"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BondOverviewCard } from "./BondOverviewCard";
import { CouponHistoryCard } from "./CouponHistoryCard";
import { SetupCard } from "./SetupCard";
import {
  AttackOutcome,
  Busy,
  Columns,
  DeskStrip,
  Label,
  Panel,
  Refusal,
  StepCard,
  type TourResult,
  TxLink,
  UnderTheHood,
} from "./TourParts";
import { formatEther } from "viem";
import { hederaTestnet } from "viem/chains";
import { useGasPrice } from "wagmi";
import { type BondData, useBond } from "~~/hooks/coupons/useBond";
import { useCouponHistory } from "~~/hooks/coupons/useCouponHistory";
import { type DeskStateResponse, useDeskState } from "~~/hooks/coupons/useDeskState";
import { useMirrorAccount } from "~~/hooks/coupons/useMirrorAccount";
import type { DemoInvestor } from "~~/services/coupons/state";
import { GREEDY_UNITS, hbarNeededFor } from "~~/utils/coupons/constants";

type Stage = "setup" | "issue" | "fund" | "start" | "break" | "miss";
type Chapter = "break" | "miss";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "issue", label: "Issue" },
  { stage: "fund", label: "Fund" },
  { stage: "start", label: "Start" },
  { stage: "break", label: "Break it" },
  { stage: "miss", label: "Miss a coupon" },
];
const TOTAL = STEPS.length;

/** The tour's bonds: short enough to watch to maturity. A minute stands in for a coupon period such as six months. */
const TERMS = { faceValue: 1000, couponRatePercent: 1, periodMinutes: 1, couponCount: 2 };
/** One coupon on `units`, in whole stablecoin. */
const couponOn = (units: number) => (units * TERMS.faceValue * TERMS.couponRatePercent) / 100;
/** Every coupon on `units`, plus the principal the last one repays. */
const owedOn = (units: number) => couponOn(units) * TERMS.couponCount + units * TERMS.faceValue;
const n = (value: number) => value.toLocaleString();

const OK: TourResult = { ok: true, result: "SUCCESS", message: "", transaction: null };
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/hedera/coupons/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `${path} failed`);
  return json;
}

const issue = (tourRole: "main" | "miss") =>
  post<{ address: `0x${string}` }>("bonds", { name: `Tour Coupon Bond (${tourRole})`, ...TERMS, tourRole });

/** The HBAR a bond on the tour's terms needs for its schedules, for display. `null` until the gas price is read. */
const hbarFor = (holders: number, gasPrice: bigint | undefined) =>
  gasPrice === undefined
    ? null
    : Number(formatEther(hbarNeededFor(BigInt(TERMS.couponCount), holders, gasPrice))).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });

/** Whether the bond holds the HBAR its schedules need. `null` until its balance and the gas price have been read. */
const hbarReady = (bond: BondData, gasPrice: bigint | undefined) =>
  bond.hbarBalance === null || gasPrice === undefined
    ? null
    : bond.hbarBalance >= hbarNeededFor(bond.couponCount, bond.holdersCount, gasPrice);

/**
 * The step follows the tour's bond on chain, not this tab, so a reload or a detour through the Sandbox lands on the
 * right one. Only which of the last two chapters the reader is on is their own. `null` while a read is outstanding.
 */
function stageOf(
  desk: DeskStateResponse | undefined,
  main: BondData | undefined,
  gasPrice: bigint | undefined,
  chapter: Chapter,
): Stage | null {
  if (!desk) return null;
  if (!desk.stablecoin || desk.investors.length < 2) return "setup";
  if (!desk.tourBonds.main) return "issue";
  if (!main) return null;
  if (main.status === "CREATED") {
    if (main.holdersCount === 0) return "fund";
    const ready = hbarReady(main, gasPrice);
    return ready === null ? null : ready ? "start" : "fund";
  }
  if (main.status === "RUNNING") return "start";
  return chapter;
}

type Task = { label: string; call: () => Promise<unknown> };

type Ctx = {
  desk: DeskStateResponse;
  gasPrice: bigint | undefined;
  busyKey: string | null;
  results: Record<string, TourResult | null>;
  progress: Record<string, number>;
  go: (key: string, work: (advance: (index: number) => void) => Promise<TourResult>) => Promise<void>;
};

/** Runs tasks in order, reporting each as it starts: one button, several transactions. */
const inOrder = (tasks: Task[]) => async (advance: (index: number) => void) => {
  for (const [index, task] of tasks.entries()) {
    advance(index);
    await task.call();
  }
  advance(tasks.length);
  return OK;
};

export function Tour() {
  const desk = useDeskState();
  const main = useBond(desk.data?.tourBonds.main);
  const mainHistory = useCouponHistory(desk.data?.tourBonds.main);
  const { data: gasPrice } = useGasPrice({ chainId: hederaTestnet.id });
  const [chapter, setChapter] = useState<Chapter>("break");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TourResult | null>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [matured, setMatured] = useState(false);

  // A fresh desk forgets the last one's results and starts its chapters over.
  const tokenId = desk.data?.stablecoin?.tokenId ?? null;
  useEffect(() => {
    setResults({});
    setProgress({});
    setMatured(false);
    setChapter("break");
  }, [tokenId]);

  const stage = stageOf(desk.data, main.data, gasPrice, chapter);

  // The bond matures with nobody pressing anything, so its maturity is announced when the step moves on by itself.
  const previous = useRef<Stage | null>(null);
  useEffect(() => {
    if (previous.current === "start" && stage === "break" && main.data?.status === "MATURED") setMatured(true);
    if (stage !== null) previous.current = stage;
  }, [stage, main.data?.status]);

  const go: Ctx["go"] = async (key, work) => {
    setBusyKey(key);
    setResults(previous => ({ ...previous, [key]: null }));
    setMatured(false);
    let result: TourResult;
    try {
      result = await work(index => setProgress(previous => ({ ...previous, [key]: index })));
    } catch (e) {
      result = { ok: false, result: "Error", message: errorMessage(e), transaction: null };
    }
    setResults(previous => ({ ...previous, [key]: result }));
    setBusyKey(null);
    await Promise.all([desk.refetch(), main.refetch()]);
  };

  // Moving between chapters retires the announcement: it belonged to the step it was made on.
  const pick = (next: Chapter) => {
    setChapter(next);
    setMatured(false);
  };

  const ctx: Ctx | null = desk.data ? { desk: desk.data, gasPrice, busyKey, results, progress, go } : null;
  const repaid = mainHistory.data?.find(entry => entry.outcome === "PRINCIPAL REPAID");
  const stripBond = stage === "miss" ? desk.data?.tourBonds.miss : desk.data?.tourBonds.main;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={stage} pickable={stage === "break" || stage === "miss"} onPick={pick} />
      {matured ? (
        <div role="status" className="alert alert-success text-sm py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Matured: every coupon and the principal were paid, and nobody pressed anything.{" "}
            {repaid ? <TxLink hash={repaid.txHash}>The last payment on HashScan</TxLink> : null}
          </span>
        </div>
      ) : null}
      {ctx?.desk.stablecoin && stage !== "setup" ? (
        <StripFor desk={ctx.desk} address={stripBond ?? undefined} main={main.data} stage={stage} />
      ) : null}
      {!ctx || stage === null ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the desk…
        </div>
      ) : stage === "setup" ? (
        <SetupScreen desk={ctx.desk} onDone={() => void desk.refetch()} />
      ) : stage === "issue" ? (
        <IssueScreen ctx={ctx} />
      ) : stage === "fund" ? (
        <FundScreen ctx={ctx} address={ctx.desk.tourBonds.main!} bond={main.data!} />
      ) : stage === "start" ? (
        <StartScreen ctx={ctx} address={ctx.desk.tourBonds.main!} bond={main.data!} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => pick("miss")} />
      ) : (
        <MissScreen ctx={ctx} />
      )}
    </div>
  );
}

/** The strip's bond badge reads the bond in view: the tour's own, or in the last chapter the one that misses. */
function StripFor({
  desk,
  address,
  main,
  stage,
}: {
  desk: DeskStateResponse;
  address?: `0x${string}`;
  main?: BondData;
  stage: Stage | null;
}) {
  const miss = useBond(stage === "miss" ? address : undefined);
  return <DeskStrip desk={desk} bondAddress={address} bond={stage === "miss" ? miss.data : main} />;
}

function Stepper({
  stage,
  pickable,
  onPick,
}: {
  /** `null` until the reads land: no step is claimed before the desk is known. */
  stage: Stage | null;
  pickable: boolean;
  onPick: (chapter: Chapter) => void;
}) {
  const current = stage === null ? -1 : STEPS.findIndex(step => step.stage === stage);
  return (
    <nav id="tour-progress" aria-label="Progress" className="flex flex-wrap gap-2 items-center">
      {STEPS.map((step, index) => {
        const done = index < current;
        const here = index === current;
        const look = here
          ? "bg-primary text-primary-content font-semibold"
          : done
            ? "bg-success/20 border border-success/50 font-semibold"
            : "bg-base-100 border border-base-300 text-base-content/70";
        const text = done ? `✓ ${step.label}` : `${index + 1} ${step.label}`;
        // Once the tour's bond has matured, the last two chapters are the reader's to move between.
        const canPick = pickable && !here && (step.stage === "break" || step.stage === "miss");
        return (
          <span key={step.stage} className="contents">
            {index > 0 ? (
              <span aria-hidden className="text-base-content/40">
                —
              </span>
            ) : null}
            {canPick ? (
              <button
                type="button"
                className={`px-3.5 py-2 rounded-full text-sm cursor-pointer hover:ring-2 hover:ring-primary/40 ${look}`}
                onClick={() => onPick(step.stage as Chapter)}
              >
                {text}
              </button>
            ) : (
              <span aria-current={here ? "step" : undefined} className={`px-3.5 py-2 rounded-full text-sm ${look}`}>
                {text}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** A step's transactions, ticked off as they land. */
function Checklist({ labels, done, failed }: { labels: string[]; done: number | undefined; failed: boolean }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-0.5 text-sm">
      {labels.map((label, index) => {
        const state =
          done === undefined || index > done
            ? "pending"
            : index < done
              ? "done"
              : failed
                ? "failed"
                : done < labels.length
                  ? "active"
                  : "done";
        return (
          <li
            key={label}
            data-status={state}
            className={`flex items-center gap-2.5 rounded-box px-3 py-2 ${
              state === "active"
                ? "bg-primary/10"
                : state === "failed"
                  ? "bg-error/10"
                  : state === "done"
                    ? "text-base-content/70"
                    : "text-base-content/50"
            }`}
          >
            <span className="w-5 shrink-0 flex justify-center" aria-hidden>
              {state === "active" ? <span className="loading loading-spinner loading-xs" /> : null}
              {state === "done" ? <span className="text-success">✓</span> : null}
              {state === "failed" ? <span className="text-error">✗</span> : null}
              {/* Not a circle: an empty circle in a list reads as a radio button, and these are
                  steps that all run, not a choice between them. */}
              {state === "pending" ? <span className="text-base-content/40 font-mono text-xs">{index + 1}</span> : null}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Ticks every second, for countdowns. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NextCoupon({ bond }: { bond: BondData }) {
  const now = useNow();
  const due = Number(bond.dueTime) * 1000;
  const left = Math.max(0, Math.ceil((due - now) / 1000));
  const period = Number(bond.periodSeconds);
  return (
    <div
      id="tour-next-coupon"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-box bg-primary/10 border border-primary/30 p-4"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs uppercase tracking-wide text-base-content/60">
          Coupon {bond.currentCoupon.toString()} of {bond.couponCount.toString()} · due at{" "}
          {new Date(due).toLocaleTimeString()}
        </span>
        {left > 0 ? (
          <span className="font-mono text-4xl font-bold leading-none tabular-nums">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        ) : (
          <span className="text-lg font-semibold">Any second now…</span>
        )}
      </div>
      <p className="m-0 flex-1 min-w-48 text-sm text-base-content/80">
        {left > 0
          ? "Nobody is watching this clock on your behalf. The network is holding a call it will make on its own."
          : "The network calls the bond within seconds, and the payment shows below a few seconds later."}
      </p>
      {period > 0 ? (
        <progress
          className="progress progress-primary h-2 basis-full"
          value={Math.min(100, Math.max(0, ((period - left) / period) * 100))}
          max={100}
        />
      ) : null}
    </div>
  );
}

function SetupScreen({ desk, onDone }: { desk: DeskStateResponse; onDone: () => void }) {
  return (
    <Columns
      main={
        <SetupCard
          desk={desk}
          onDone={onDone}
          step={{ label: `Step 1 of ${TOTAL} · Issuer`, title: "Set up the desk" }}
        />
      }
      aside={
        <>
          <Panel title="Who is who" caption="Two demo accounts the app creates, and you as the issuer.">
            <ul className="m-0 pl-5 list-disc flex flex-col gap-1.5 text-sm">
              <li>
                <strong>Issuer</strong>: your operator account. Creates the stablecoin, issues and funds bonds, pays
                every fee.
              </li>
              <li>
                <strong>Investor A</strong> and <strong>Investor B</strong>: hold positions and sign nothing. Coupons
                simply arrive.
              </li>
              <li>
                <strong>The bond</strong>: a contract the factory deploys for each bond. It holds what it owes and pays
                it out itself.
              </li>
            </ul>
          </Panel>
          <Panel
            title="What happens next"
            caption="One action a step, about 60 testnet HBAR in all: creating the stablecoin, and the HBAR each bond spends on its own schedules."
          >
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-1 text-sm">
              <li>
                <strong>Issue</strong> a bond: {TERMS.couponCount} coupons, {TERMS.periodMinutes} min apart.
              </li>
              <li>
                <strong>Fund</strong> it with what it owes.
              </li>
              <li>
                <strong>Start</strong> it, and watch it pay itself.
              </li>
              <li>
                <strong>Break it</strong>: three calls it must refuse.
              </li>
              <li>
                <strong>Miss a coupon</strong>: what it does when short.
              </li>
            </ol>
          </Panel>
        </>
      }
    />
  );
}

function Terms() {
  const rows: [string, string][] = [
    ["Face value", `${n(TERMS.faceValue)} a unit`],
    ["Coupon", `${TERMS.couponRatePercent}% of face value a period`],
    ["Period", `${TERMS.periodMinutes} minute, standing in for six months`],
    ["Coupons", `${TERMS.couponCount}, the last also repaying the principal`],
  ];
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-base-content/60">{term}</dt>
          <dd className="m-0 font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IssueScreen({ ctx }: { ctx: Ctx }) {
  const { desk, busyKey, results, go } = ctx;
  const stablecoin = desk.stablecoin!;
  return (
    <Columns
      main={
        <>
          <StepCard step={2} total={TOTAL} who="Issuer" title="Issue a bond that pays itself">
            <p className="m-0 text-base-content/80 max-w-2xl">
              The factory deploys a new bond contract, owned by you, on these terms. It pays its coupons in{" "}
              {stablecoin.symbol}, the stablecoin you just created.
            </p>
            <Terms />
            {desk.factory ? null : (
              <p className="m-0 text-sm text-warning">
                No factory is deployed yet. Run <code>yarn coupons:deploy</code>, then reload.
              </p>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-issue"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null || !desk.factory || Boolean(desk.configError)}
                onClick={() => void go("issue", inOrder([{ label: "Issue", call: () => issue("main") }]))}
              >
                <Busy on={busyKey === "issue"} />
                Issue bond
              </button>
            </div>
            <Refusal id="tour-issue-error" result={results.issue} />
          </StepCard>
          <UnderTheHood
            title="the call this step makes"
            code={`factory.createBond(
  name,
  stablecoin,                        // ${stablecoin.tokenId}, at its EVM address
  ${TERMS.faceValue},                              // face value a unit
  ${TERMS.couponRatePercent * 100},                               // coupon rate, in basis points
  ${TERMS.periodMinutes * 60},                                // seconds between coupons
  ${TERMS.couponCount}                                  // coupons; the last also repays principal
);
// The bond's constructor associates it with the stablecoin (HIP-719 associate()), so it can hold and pay it.`}
          />
        </>
      }
      aside={
        <Panel title="Why a contract" caption="Something has to send each coupon on its date.">
          <p className="m-0 text-sm">
            Usually that is a paying agent, or a keeper network such as Chainlink Automation. Here the bond asks the
            Hedera Schedule Service to call it back at each coupon date, and each payment books the next one. No keeper,
            no bot, no cron job.
          </p>
        </Panel>
      }
    />
  );
}

function FundScreen({ ctx, address, bond }: { ctx: Ctx; address: `0x${string}`; bond: BondData }) {
  const { desk, gasPrice, busyKey, results, progress, go } = ctx;
  const hbar = hbarFor(desk.investors.length, gasPrice) ?? "…";
  const stablecoin = desk.stablecoin!;
  const held = useMirrorAccount(address, stablecoin.tokenId).data?.tokenBalance;
  const units = desk.investors.reduce((sum, investor) => sum + investor.defaultUnits, 0);
  const owed = owedOn(units);
  const heldWhole = held === undefined ? null : Math.floor(Number(held) / 10 ** stablecoin.decimals);
  const toSend = heldWhole === null ? null : Math.max(0, owed - heldWhole);
  const tasks: Task[] = [
    ...desk.investors.map(investor => ({
      label: `Allocate ${investor.defaultUnits} units to ${investor.label}`,
      call: () => post(`bonds/${address}/allocate`, { holder: investor.evmAddress, units: investor.defaultUnits }),
    })),
    {
      label: `Send the bond ${n(toSend ?? owed)} ${stablecoin.symbol} and ${hbar} HBAR`,
      call: () => post(`bonds/${address}/fund`, { stablecoinWhole: toSend }),
    },
  ];
  const funded = results.fund?.ok === true;
  return (
    <Columns
      main={
        <>
          <StepCard step={3} total={TOTAL} who="Issuer" title="Give the investors positions, and fund the bond">
            <p className="m-0 text-base-content/80 max-w-2xl">
              {desk.investors.map(i => `${i.label} takes ${i.defaultUnits} units`).join(", ")}. Each coupon pays{" "}
              {TERMS.couponRatePercent}% of the {n(TERMS.faceValue)} face value a unit: {n(couponOn(units))}{" "}
              {stablecoin.symbol} in all. The last one also repays {n(units * TERMS.faceValue)} principal. So before it
              starts the bond must hold <strong>{n(owed)}</strong> {stablecoin.symbol}, and <strong>{hbar} HBAR</strong>{" "}
              to pay for the schedules it creates.
            </p>
            <Checklist
              labels={tasks.map(task => task.label)}
              done={progress.fund}
              failed={results.fund?.ok === false}
            />
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-fund"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null || toSend === null || funded}
                onClick={() => void go("fund", inOrder(tasks))}
              >
                <Busy on={busyKey === "fund"} />
                Allocate and fund
              </button>
              {funded ? (
                <span className="text-sm text-base-content/70">Funded. Waiting for the network to show it…</span>
              ) : null}
            </div>
            <Refusal id="tour-fund-error" result={results.fund} />
          </StepCard>
          <UnderTheHood
            title="the calls this step makes"
            code={`${desk.investors.map(i => `bond.allocate(${i.label.replace(" ", "")}, ${i.defaultUnits});`).join("\n")}
stablecoin.transfer(bond, ${n(owed)} × 10^${stablecoin.decimals});   // HTS token, through its ERC-20 interface
send(bond, ${hbar} HBAR);   // the bond pays for its own scheduled calls`}
          />
        </>
      }
      aside={<BondOverviewCard bondAddress={address} bond={bond} />}
    />
  );
}

function StartScreen({ ctx, address, bond }: { ctx: Ctx; address: `0x${string}`; bond: BondData }) {
  const { desk, busyKey, results, go } = ctx;
  const stablecoin = desk.stablecoin!;
  if (bond.status === "CREATED")
    return (
      <Columns
        main={
          <>
            <StepCard step={4} total={TOTAL} who="Issuer" title="Start the coupons, then let go">
              <p className="m-0 text-base-content/80 max-w-2xl">
                <code>start()</code> asks the Hedera Schedule Service to call the bond back in {TERMS.periodMinutes}{" "}
                minute. At that time the network calls <code>payCoupon()</code>, which pays every holder and books the
                next coupon. Nobody presses anything again until the bond has matured.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  id="tour-start"
                  type="button"
                  className="btn btn-primary"
                  disabled={busyKey !== null}
                  onClick={() =>
                    void go("start", inOrder([{ label: "Start", call: () => post(`bonds/${address}/start`) }]))
                  }
                >
                  <Busy on={busyKey === "start"} />
                  Start coupons
                </button>
              </div>
              <Refusal id="tour-start-error" result={results.start} />
            </StepCard>
            <UnderTheHood
              title="what start() does"
              code={`// CouponBond.start(), signed by the issuer
status = RUNNING;
currentCoupon = 1;
HSS.scheduleCall(                          // the Hedera Schedule Service, at 0x16b
  address(this),                           // call this bond back
  block.timestamp + ${TERMS.periodMinutes * 60},                    // at the first coupon date
  gasLimit,
  0,
  abi.encodeWithSelector(this.payCoupon.selector)
);`}
            />
          </>
        }
        aside={<BondOverviewCard bondAddress={address} bond={bond} />}
      />
    );

  return (
    <Columns
      main={
        <>
          <StepCard step={4} total={TOTAL} who="Hedera Schedule Service" title="Watch it pay. Nobody presses anything">
            <NextCoupon bond={bond} />
            <p className="m-0 text-sm text-base-content/80 max-w-2xl">
              Each coupon pays {desk.investors.map(i => `${i.label} ${n(couponOn(i.defaultUnits))}`).join(" and ")}{" "}
              {stablecoin.symbol}. The last adds the principal:{" "}
              {desk.investors.map(i => n(i.defaultUnits * TERMS.faceValue)).join(" and ")}. Watch the balances above.
            </p>
          </StepCard>
          <CouponHistoryCard bondAddress={address} stablecoinDecimals={stablecoin.decimals} />
          <UnderTheHood
            title="what payCoupon() does"
            code={`// CouponBond.payCoupon(), called by the network at the due time
require(status == RUNNING && block.timestamp >= dueTime);
for each holder: stablecoin.transfer(holder, units × faceValue × rate);
if (last coupon) { also repay units × faceValue; status = MATURED; }   // and schedule nothing
else { currentCoupon++; HSS.scheduleCall(..., dueTime + period, ...); }   // the next one`}
          />
        </>
      }
      aside={<BondOverviewCard bondAddress={address} bond={bond} />}
    />
  );
}

const ATTACKS: { type: string; who: string; title: string; text: string; meaning: string; code: string }[] = [
  {
    type: "pay-twice",
    who: "Investor A",
    title: "Get paid twice",
    text: "The bond has paid its last coupon. Investor A calls payCoupon() again: anyone may call it.",
    meaning: "payCoupon() pays only a coupon that is due, on a running bond. This one has matured, so nothing moved.",
    code: "bond.payCoupon()   // signed by Investor A",
  },
  {
    type: "investor-allocates",
    who: "Investor B",
    title: "Give yourself units",
    text: `Investor B calls allocate() to give itself ${n(GREEDY_UNITS)} units.`,
    meaning: "Only the issuer can allocate. The bond refused the caller before doing anything else.",
    code: `bond.allocate(InvestorB, ${GREEDY_UNITS})   // signed by Investor B`,
  },
  {
    type: "issuer-reallocates",
    who: "Issuer",
    title: "Take a position away",
    text: "The issuer itself sets Investor A's units to 0, after the coupons have started.",
    meaning: "Positions can change only before Start. Once the bond runs, not even the issuer can change who is owed.",
    code: "bond.allocate(InvestorA, 0)   // signed by the issuer",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { busyKey, results, go } = ctx;
  const tried = ATTACKS.map(attack => results[attack.type]).filter(result => result && result.result !== "Error");
  const refused = tried.filter(result => result && !result.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 5 of {TOTAL} · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            Try to get paid out of turn, or change who is owed. Each attempt is a real transaction to the matured bond:{" "}
            <strong>a revert is a pass</strong>, and the balances above should not move.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of {ATTACKS.length} tried · {refused} reverted
          </span>
          <button id="next-miss" type="button" className="btn btn-primary" onClick={onNext}>
            Next: miss a coupon →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {ATTACKS.map(attack => (
          <Panel key={attack.type} title={attack.title}>
            <p className="m-0 text-sm">{attack.text}</p>
            <pre className="m-0 rounded-box bg-[#11151d] text-[#f0f0f2] px-3 py-2 text-[12px] whitespace-pre-wrap font-mono">
              {attack.code}
            </pre>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <button
                id={attack.type}
                type="button"
                className={`btn ${results[attack.type] ? "btn-outline" : "btn-neutral"}`}
                disabled={busyKey !== null}
                onClick={() =>
                  void go(attack.type, async () => {
                    const { ok, result, transaction } = await post<{
                      ok: boolean;
                      result: string;
                      transaction: string;
                    }>("attack", { type: attack.type });
                    return { ok, result, message: "", transaction };
                  })
                }
              >
                <Busy on={busyKey === attack.type} />
                {results[attack.type] ? "Try again" : "Run this attack"}
              </button>
              <span className="text-xs text-base-content/60">{attack.who}</span>
            </div>
            <AttackOutcome
              id={`${attack.type}-result`}
              result={results[attack.type] ?? null}
              meaning={attack.meaning}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}

function MissScreen({ ctx }: { ctx: Ctx }) {
  const { desk, gasPrice, busyKey, results, progress, go } = ctx;
  const hbar = hbarFor(1, gasPrice) ?? "…";
  const router = useRouter();
  const address = desk.tourBonds.miss;
  const bond = useBond(address).data;
  const history = useCouponHistory(address).data;
  const stablecoin = desk.stablecoin!;
  const held = useMirrorAccount(address, stablecoin.tokenId).data?.tokenBalance;
  const investor: DemoInvestor = desk.investors[0];
  const oneCoupon = couponOn(investor.defaultUnits);
  const owed = owedOn(investor.defaultUnits);
  const scale = 10 ** stablecoin.decimals;
  const heldWhole = held === undefined ? null : Math.floor(Number(held) / scale);
  const missed = history?.find(entry => entry.outcome === "MISSED");

  let body: ReactNode;
  let title: string;
  if (!address || bond?.status === "CREATED") {
    title = "Fund one coupon, and start";
    let bondAddress = address;
    const tasks: Task[] = [
      ...(address
        ? []
        : [
            {
              label: "Issue a second bond on the same terms",
              call: async () => (bondAddress = (await issue("miss")).address),
            },
          ]),
      {
        label: `Allocate ${investor.defaultUnits} units to ${investor.label}`,
        call: () =>
          post(`bonds/${bondAddress}/allocate`, { holder: investor.evmAddress, units: investor.defaultUnits }),
      },
      {
        label: `Send the bond ${n(oneCoupon)} ${stablecoin.symbol}, one coupon, and ${hbar} HBAR`,
        call: () => post(`bonds/${bondAddress}/fund`, { stablecoinWhole: Math.max(0, oneCoupon - (heldWhole ?? 0)) }),
      },
      { label: "Start coupons", call: () => post(`bonds/${bondAddress}/start`) },
    ];
    body = (
      <>
        <p className="m-0 text-base-content/80 max-w-2xl">
          A second bond on the same terms, held only by {investor.label} with {investor.defaultUnits} units. It owes{" "}
          {n(owed)} {stablecoin.symbol}: {n(oneCoupon)} a coupon, and {n(investor.defaultUnits * TERMS.faceValue)}{" "}
          principal with the last. The issuer funds just one coupon. Coupon 1 is paid; coupon 2 cannot be paid in full,
          so the bond pays nothing for it and tries again one period later.
        </p>
        <Checklist labels={tasks.map(task => task.label)} done={progress.miss} failed={results.miss?.ok === false} />
        <div className="flex flex-wrap gap-3 items-center">
          <button
            id="tour-miss"
            type="button"
            className="btn btn-primary"
            disabled={busyKey !== null || (address !== undefined && heldWhole === null) || results.miss?.ok === true}
            onClick={() => void go("miss", inOrder(tasks))}
          >
            <Busy on={busyKey === "miss"} />
            {address ? "Fund one coupon and start" : "Issue, fund one coupon, and start"}
          </button>
        </div>
        <Refusal id="tour-miss-error" result={results.miss} />
      </>
    );
  } else if (!bond) {
    title = "Miss a coupon";
    body = <span className="loading loading-spinner loading-sm" aria-hidden />;
  } else if (bond.status === "RUNNING" && !missed) {
    title = "Coupon 1 is funded. Coupon 2 is not";
    body = (
      <>
        <NextCoupon bond={bond} />
        <p className="m-0 text-sm text-base-content/80 max-w-2xl">
          The bond holds {heldWhole === null ? "…" : n(heldWhole)} {stablecoin.symbol}. Coupon 2 and the principal need{" "}
          {n(owed - oneCoupon)}.
        </p>
      </>
    );
  } else if (bond.status === "RUNNING") {
    const needed = Math.ceil(Number(bond.stablecoinNeeded) / scale);
    const toSend = heldWhole === null ? null : Math.max(0, needed - heldWhole);
    title = `Coupon ${missed!.coupon} was missed: fund the rest`;
    body = (
      <>
        <p className="m-0 text-base-content/80 max-w-2xl">
          At {new Date(missed!.consensusTime).toLocaleTimeString()} the bond could not cover the {n(needed)}{" "}
          {stablecoin.symbol} it still owes. It paid nothing, rather than part, and booked a retry for{" "}
          <strong>{new Date(Number(bond.dueTime) * 1000).toLocaleTimeString()}</strong>: one period after the coupon was
          due, not after the attempt, so later coupons keep their dates.
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            id="tour-fund-rest"
            type="button"
            className="btn btn-primary"
            disabled={busyKey !== null || toSend === null || toSend === 0 || results["fund-rest"]?.ok === true}
            onClick={() =>
              void go(
                "fund-rest",
                inOrder([{ label: "Fund", call: () => post(`bonds/${address}/fund`, { stablecoinWhole: toSend }) }]),
              )
            }
          >
            <Busy on={busyKey === "fund-rest"} />
            Send {toSend === null ? "…" : n(toSend)} {stablecoin.symbol}
          </button>
          {results["fund-rest"]?.ok ? (
            <span className="text-sm text-base-content/70">Funded. The retry pays in full.</span>
          ) : null}
        </div>
        <NextCoupon bond={bond} />
        <Refusal id="tour-fund-rest-error" result={results["fund-rest"]} />
      </>
    );
  } else if (bond.status === "MATURED") {
    const repaid = history?.find(entry => entry.outcome === "PRINCIPAL REPAID");
    title = "The retry paid in full";
    body = (
      <>
        <p className="m-0 text-base-content/80 max-w-2xl">
          {repaid ? `At ${new Date(repaid.consensusTime).toLocaleTimeString()} the` : "The"} retry paid coupon 2 and the
          principal together, with nobody pressing anything.{" "}
          {repaid ? <TxLink hash={repaid.txHash}>The payment on HashScan</TxLink> : null}
        </p>
        <p className="m-0 text-sm text-base-content/80 max-w-2xl">
          That is the tour. The Sandbox has every control on one page: your own terms, stopping a bond before its first
          coupon, and your own wallet as an investor.
        </p>
        <div>
          <button
            id="to-sandbox"
            type="button"
            className="btn btn-primary"
            onClick={() => router.replace("/?view=sandbox")}
          >
            Open the Sandbox
          </button>
        </div>
      </>
    );
  } else {
    title = "This bond was stopped";
    body = <p className="m-0 text-base-content/80">It was stopped from the Sandbox, so it pays nothing more.</p>;
  }

  return (
    <Columns
      main={
        <>
          <StepCard
            step={6}
            total={TOTAL}
            who={bond?.status === "RUNNING" ? "Hedera Schedule Service" : "Issuer"}
            title={title}
          >
            {body}
          </StepCard>
          {address ? <CouponHistoryCard bondAddress={address} stablecoinDecimals={stablecoin.decimals} /> : null}
        </>
      }
      aside={
        address ? (
          <BondOverviewCard bondAddress={address} bond={bond} />
        ) : (
          <Panel title="A coupon the bond cannot afford" caption="Missed, not partly paid.">
            <p className="m-0 text-sm">
              Paying some holders and not others, or everyone a part, leaves a mess to unpick. The bond pays a coupon in
              full or not at all, says so in a <code>CouponMissed</code> event, and schedules a retry of the same coupon
              itself.
            </p>
          </Panel>
        )
      }
    />
  );
}
