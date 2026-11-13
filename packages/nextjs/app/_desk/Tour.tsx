"use client";

import { useEffect, useState } from "react";
import { Button, Field, Outcome } from "./ControlCards";
import type { DeskProps } from "./Sandbox";
import { SetupCard } from "./SetupCard";
import {
  AttackOutcome,
  BillsCard,
  Clocks,
  History,
  Label,
  LtvBar,
  Panel,
  StepCard,
  UnderTheHood,
  Why,
  usd,
} from "./TourParts";
import { Stat, show, txLink } from "./ui";
import { usePreview } from "./useDesk";
import { WalletCard, useWalletPledge } from "./wallet";
import type { ActionRequest, ActionResult, DeskView, Snapshot } from "~~/types/repo";

type Stage = "setup" | "pledge" | "borrow" | "break" | "stress" | "resolve";
type Chapter = "break" | "stress";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "pledge", label: "Pledge" },
  { stage: "borrow", label: "Borrow" },
  { stage: "break", label: "Break it" },
  { stage: "stress", label: "Stress it" },
  { stage: "resolve", label: "Resolve" },
];

/**
 * The step is read from the chain, not remembered by this tab, so a reload, a server restart or a detour through the
 * Sandbox all land on the right one. Only two things are the reader's own: which of the two open-loan chapters they
 * are on, and whether they have moved past a finished loan.
 */
function stageOf(snapshot: Snapshot | null, chapter: Chapter, dismissedLoan: string | null): Stage {
  const desk = snapshot?.desk;
  if (!snapshot || !desk || snapshot.setup.running) return "setup";
  const p = desk.position;
  if (p.loanOpen) return chapter;
  if (Number(p.pledged ?? 0) > 0) return "borrow";
  if ((p.status === "REPAID" || p.status === "LIQUIDATED") && desk.loanId !== dismissedLoan) return "resolve";
  return "pledge";
}

/** Actions that move the tour to another step: their success is announced above the step, not beside a button. */
const ADVANCING = ["pledge", "open", "repay", "liquidate"];

/** Where a refusal shows, by action: the same ids the Sandbox uses. */
const OUTCOME_ID: Record<string, string> = {
  pledge: "pledge-error",
  open: "open-error",
  repay: "repay-result",
  liquidate: "liquidate-result",
  "top-up": "top-up-result",
  shock: "shock-result",
  freeze: "feed-result",
  resume: "feed-result",
  "restart-bill": "restart-result",
};

type Ctx = {
  snapshot: Snapshot;
  desk: DeskView;
  busy: string | null;
  results: Record<string, ActionResult | null>;
  go: (key: string, request: ActionRequest) => Promise<ActionResult>;
  record: (key: string, result: ActionResult) => void;
  act: DeskProps["act"];
};

export function Tour({ snapshot, busy, run, act, setup }: DeskProps) {
  const desk = snapshot?.desk ?? null;
  const [chapter, setChapter] = useState<Chapter>("break");
  const [dismissedLoan, setDismissedLoan] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult | null>>({});
  const [flash, setFlash] = useState<{ key: string; result: ActionResult } | null>(null);

  const loanId = desk?.loanId ?? null;
  const loanOpen = desk?.position.loanOpen ?? false;
  const status = desk?.position.status ?? null;
  // A new loan starts on the attacks; a loan in any trouble belongs on the stress screen.
  useEffect(() => setChapter("break"), [loanId]);
  useEffect(() => {
    if (loanOpen && status !== "OPEN") setChapter("stress");
  }, [loanOpen, status]);
  // A fresh desk forgets the last one's results.
  const completedAt = snapshot?.setup.completedAt ?? null;
  useEffect(() => {
    setResults({});
    setFlash(null);
  }, [completedAt]);

  const record = (key: string, result: ActionResult) => {
    setResults(previous => ({ ...previous, [key]: result }));
    if (result.ok && ADVANCING.includes(key)) setFlash({ key, result });
  };
  const go = async (key: string, request: ActionRequest) => {
    setResults(previous => ({ ...previous, [key]: null }));
    setFlash(null);
    const result = await run(key, request);
    record(key, result);
    return result;
  };

  // The fake pledge holds the bills for a few seconds before releasing them; the tour stays on the Pledge step
  // throughout rather than flicker to Borrow and back.
  const stage = busy === "fake-pledge" ? "pledge" : stageOf(snapshot, chapter, dismissedLoan);
  const ctx = snapshot && desk ? { snapshot, desk, busy, results, go, record, act } : null;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={snapshot ? stage : null} loanOpen={loanOpen} onPick={setChapter} />
      {flash ? (
        <div id={`${flash.key}-result`} role="status" className="alert alert-success text-sm py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {flash.result.message}
            {flash.result.txHash ? (
              <>
                {" "}
                <a className="link" href={txLink(flash.result.txHash)} target="_blank" rel="noreferrer">
                  View on HashScan
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {ctx && stage !== "setup" ? (
        <Clocks
          desk={ctx.desk}
          busy={busy}
          restart={{
            onClick: () => void go("restart-bill", { type: "restart-bill" }),
            result: results["restart-bill"] ?? null,
          }}
        />
      ) : null}
      {!snapshot ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the desk…
        </div>
      ) : stage === "setup" || !ctx ? (
        <SetupScreen snapshot={snapshot} busy={busy} setup={setup} />
      ) : stage === "pledge" ? (
        <PledgeScreen ctx={ctx} />
      ) : stage === "borrow" ? (
        <BorrowScreen ctx={ctx} setup={setup} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => setChapter("stress")} />
      ) : stage === "stress" ? (
        <StressScreen ctx={ctx} />
      ) : (
        <ResolveScreen ctx={ctx} onPledgeAgain={() => setDismissedLoan(loanId)} setup={setup} />
      )}
    </div>
  );
}

function Stepper({
  stage,
  loanOpen,
  onPick,
}: {
  /** `null` until the first read lands: no step is claimed before the desk is known. */
  stage: Stage | null;
  loanOpen: boolean;
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
        // While the loan is open the two loan chapters are the reader's to move between.
        const pickable = loanOpen && !here && (step.stage === "break" || step.stage === "stress");
        return (
          <span key={step.stage} className="contents">
            {index > 0 ? (
              <span aria-hidden className="text-base-content/40">
                —
              </span>
            ) : null}
            {pickable ? (
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

function Columns({ main, aside }: { main: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">{main}</div>
      <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">{aside}</aside>
    </div>
  );
}

function SetupScreen({
  snapshot,
  busy,
  setup,
}: {
  snapshot: Snapshot | null;
  busy: string | null;
  setup: () => Promise<void>;
}) {
  return (
    <Columns
      main={
        <>
          <StepCard step={1} who="Operator" title="Deploy the desk">
            <p className="m-0 text-base-content/80 max-w-2xl">
              One press deploys a T-bill on Asset Tokenization Studio, a stablecoin on Stablecoin Studio, a price feed
              and the repo contract, then gives the borrower 10 bills and the lender $50,000. It takes about six
              minutes, paid by the operator account in testnet HBAR.
            </p>
          </StepCard>
          <SetupCard snapshot={snapshot} busy={busy !== null} onSetup={() => void setup()} />
        </>
      }
      aside={
        <Panel title="What happens next" caption="Five steps, one action each.">
          <ol className="m-0 pl-5 list-decimal flex flex-col gap-2 text-sm">
            <li>
              <strong>Pledge</strong>: lock the 10 bills in the borrower&apos;s own wallet.
            </li>
            <li>
              <strong>Borrow</strong>: the lender lends $9,600 of stablecoin against them.
            </li>
            <li>
              <strong>Break it</strong>: try three ways around the pledge. Each should be refused.
            </li>
            <li>
              <strong>Stress it</strong>: play the market and push the loan over the line.
            </li>
            <li>
              <strong>Resolve</strong>: repay, or let the lender liquidate.
            </li>
          </ol>
          <p className="m-0 text-xs text-base-content/70">
            10 seconds of real time is one day of the bill&apos;s life.
          </p>
        </Panel>
      }
    />
  );
}

function PledgeScreen({ ctx }: { ctx: Ctx }) {
  const { desk, busy, results, go, record, act } = ctx;
  const [amount, setAmount] = useState("10");
  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const walletPledge = useWalletPledge(desk, act);
  const signer = desk.wallet?.added ? mode : "demo";
  const result = results.pledge ?? null;

  const pledge = async () => {
    if (signer === "wallet") record("pledge", await walletPledge.pledge(amount));
    else await go("pledge", { type: "pledge", amount });
  };

  return (
    <Columns
      main={
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
            <StepCard step={2} who="Borrower" title="Lock the bills as collateral">
              <p className="m-0 text-base-content/80 max-w-2xl">
                A hold locks the bills inside the borrower&apos;s own wallet. Nothing is transferred. Only the repo
                contract can act on the hold, and only by sending the bills to the lender.
              </p>
              <div className="flex flex-wrap gap-4 items-end">
                <Field label="Bills" htmlFor="pledge-amount">
                  <input
                    id="pledge-amount"
                    className="input input-bordered w-24"
                    inputMode="numeric"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                  />
                </Field>
                <Button
                  id="pledge-collateral"
                  label={`Pledge ${amount} bills`}
                  busyKey="pledge"
                  busy={walletPledge.pending ? "pledge" : busy}
                  disabled={false}
                  onClick={pledge}
                />
              </div>
              <p className="m-0 text-xs text-base-content/70">
                {signer === "wallet"
                  ? "You sign this one in MetaMask: it encumbers your own bills without handing them over."
                  : "The demo borrower signs this one on the server."}
              </p>
              {result && !result.ok ? <Outcome id="pledge-error" result={result} /> : null}
              <UnderTheHood
                title="the call this button makes"
                code={`bill.createHoldByPartition(PARTITION, {
  amount: ${amount},
  expirationTimestamp: now + term + grace + margin,
  escrow: repo,      // the only address that can execute or release it
  to: lender,        // the only place execution can send the bills
  data: "0x"
})                   // signed by the borrower · ATS ERC-1400 hold`}
              />
            </StepCard>
            <BillsCard desk={desk} caption="All of them are free to move until the pledge." />
          </div>
        </>
      }
      aside={
        <>
          <Panel title="Fake a pledge" caption="Optional attack · before you pledge">
            <p className="m-0 text-sm">
              Pledge every bill naming the lender as escrow, then ask for the loan. It only works now: after the real
              pledge the borrower has no free bills. Expect a refusal; the fake hold is released afterwards.
            </p>
            {results["fake-pledge"] ? <AttackOutcome id="wrong-escrow-result" result={results["fake-pledge"]} /> : null}
            <Button
              id="fake-pledge"
              label="Try a fake pledge first"
              busyKey="fake-pledge"
              busy={busy}
              disabled={false}
              variant="btn-outline"
              onClick={() => void go("fake-pledge", { type: "fake-pledge" })}
            />
          </Panel>
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">Sign with your own wallet</summary>
            <div className="px-1 pb-1">
              <WalletCard
                desk={desk}
                busy={busy}
                mode={mode}
                setMode={setMode}
                onAdd={address => void go("add-wallet", { type: "add-wallet", address })}
              />
            </div>
          </details>
          <History entries={ctx.snapshot.activity} />
        </>
      }
    />
  );
}

function BorrowScreen({ ctx, setup }: { ctx: Ctx; setup: () => Promise<void> }) {
  const { desk, busy, results, go } = ctx;
  const [amount, setAmount] = useState("9600");
  const preview = usePreview(amount, true);
  const result = results.open ?? null;
  const units = /^\d+$/.test(amount.trim()) ? (BigInt(amount.trim()) * 100n).toString() : "…";
  // A hold whose escrow is not the repo contract is the fake pledge, left behind when its release failed.
  const { holdEscrow, escrow } = desk.encumbrance;
  const wrongEscrow = holdEscrow !== null && holdEscrow.toLowerCase() !== escrow.address.toLowerCase();

  return (
    <Columns
      main={
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
            <StepCard step={3} who="Lender" title="Lend stablecoin against the pledge">
              <p className="m-0 text-base-content/80 max-w-2xl">
                Before it lends, the repo contract reads the hold back from the bill: the escrow must be the repo
                contract, the destination the lender, and the expiry later than the loan. Then it checks the amount
                against the bills&apos; value less a {desk.position.haircut} haircut.
              </p>
              <div className="flex flex-wrap gap-4 items-end">
                <Field label="Stablecoin to borrow (US dollars)" htmlFor="borrow-amount">
                  <input
                    id="borrow-amount"
                    className="input input-bordered w-40"
                    inputMode="numeric"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                  />
                </Field>
                <Button
                  id="open-loan"
                  label={`Borrow ${usd(amount.trim() || null)}`}
                  busyKey="open"
                  busy={busy}
                  disabled={false}
                  onClick={() => void go("open", { type: "open", amount })}
                />
              </div>
              <p id="borrow-preview" className="m-0 text-sm">
                {!preview
                  ? "Asking the repo contract…"
                  : preview.verdict === "allowed"
                    ? `Allowed: the loan would open at ${preview.ltv}, under the 98% limit. The most you can borrow is ${preview.capacity}.`
                    : preview.verdict === "refused"
                      ? `The contract would refuse it: ${preview.reason} The most you can borrow is ${preview.capacity ?? "unavailable"}.`
                      : `Cannot tell yet: ${preview.reason}`}
              </p>
              <LtvBar ltv={preview?.verdict === "allowed" ? preview.ltv : null} loanOpen={false} />
              {result && !result.ok ? <Outcome id="open-error" result={result} /> : null}
              {wrongEscrow ? (
                <div role="alert" className="alert alert-warning text-sm">
                  <span className="flex flex-col gap-1">
                    <strong>This pledge names the lender as escrow, not the repo contract.</strong>
                    <span>
                      The repo contract will refuse to lend against it. Set up a fresh desk, or wait until the hold
                      expires at {new Date(desk.encumbrance.holdExpiryMs ?? 0).toLocaleTimeString()} and reclaim it from
                      the Sandbox.
                    </span>
                  </span>
                </div>
              ) : null}
              {wrongEscrow ? (
                <button
                  id="setup-again"
                  type="button"
                  className="btn btn-outline w-fit"
                  disabled={busy !== null}
                  onClick={() => void setup()}
                >
                  Set up a fresh desk
                </button>
              ) : null}
              <UnderTheHood
                title="the call this button makes"
                code={`repo.openLoan(borrower, holdId, ${desk.position.pledged ?? "…"}, ${units}, ${desk.repoRateBps}, ${desk.termDays})
                   // signed by the lender
// validateOpen reads the hold back from the bill:
//   escrow == repo, destination == lender, expiry > term + grace
// then: a fresh price, and debt ≤ ${100 - Number.parseFloat(desk.position.haircut)}% of the bills' value
// the stablecoin moves lender → borrower in the same transaction`}
              />
            </StepCard>
            <BillsCard desk={desk} caption="Pledged, not moved: a hold locks them in the borrower's own wallet." />
          </div>
        </>
      }
      aside={
        <>
          <History entries={ctx.snapshot.activity} />
        </>
      }
    />
  );
}

const ATTACKS: {
  key: string;
  request: ActionRequest;
  resultId: string;
  who: string;
  guard: string;
  title: string;
  text: string;
  meaning: string;
  code: string;
}[] = [
  {
    key: "transfer-pledged",
    request: { type: "transfer-pledged" },
    resultId: "transfer-result",
    who: "Borrower",
    guard: "guarded by ATS",
    title: "Move the locked bills",
    text: "Sell the bills while they back a loan, by sending more than the free balance.",
    meaning: "Held bills are not transferable, and the wallet has no free bills to move.",
    code: "bill.transfer(lender, free + 1)   // signed by the borrower",
  },
  {
    key: "reclaim-pledge",
    request: { type: "reclaim-pledge" },
    resultId: "reclaim-result",
    who: "Borrower",
    guard: "guarded by ATS",
    title: "Take the pledge back early",
    text: "Cancel the hold halfway through the loan and walk away with the bills.",
    meaning: "A hold can only be reclaimed once it expires, and it outlasts the loan term plus grace.",
    code: "bill.reclaimHoldByPartition(hold)   // signed by the borrower",
  },
  {
    key: "redirect-pledge",
    request: { type: "redirect-pledge" },
    resultId: "redirect-result",
    who: "Escrow",
    guard: "guarded by ATS · simulated, nothing sent",
    title: "Send the bills somewhere else",
    text: "Even the escrow tries to execute the hold to an address other than the lender.",
    meaning: "ATS only executes a hold to the destination fixed when it was created.",
    code: "bill.executeHoldByPartition(hold, borrower, 10)   // eth_call from the repo contract",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { desk, busy, results, go } = ctx;
  const tried = [...ATTACKS.map(attack => attack.key), "fake-pledge"].map(key => results[key]).filter(Boolean);
  const refused = tried.filter(result => result && !result.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 4 of 6 · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            The loan is open at <span id="ltv">{show(desk.position.ltv, "unavailable")}</span>, so the pledge is live.
            Try to get around it before you stress the price. Each attempt should be refused.{" "}
            <strong>A refusal is a pass</strong>; an &quot;Accepted&quot; means the pledge would not be worth lending
            against.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of 4 tried · {refused} refused
          </span>
          <button id="next-stress" type="button" className="btn btn-primary" onClick={onNext}>
            Next: stress the price →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {ATTACKS.map(attack => (
          <Panel key={attack.key} title={attack.title}>
            <p className="m-0 text-sm">{attack.text}</p>
            <pre className="m-0 rounded-box bg-[#11151d] text-[#f0f0f2] px-3 py-2 text-[12px] whitespace-pre-wrap font-mono">
              {attack.code}
            </pre>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <Button
                id={attack.key}
                label={results[attack.key] ? "Try again" : "Run this attack"}
                busyKey={attack.key}
                busy={busy}
                disabled={false}
                variant={results[attack.key] ? "btn-outline" : "btn-neutral"}
                onClick={() => void go(attack.key, attack.request)}
              />
              <span className="text-xs text-base-content/60">
                {attack.who} · {attack.guard}
              </span>
            </div>
            <AttackOutcome id={attack.resultId} result={results[attack.key] ?? null} meaning={attack.meaning} />
          </Panel>
        ))}
        <Panel title="Fake a pledge">
          <p className="m-0 text-sm">
            Create a hold that looks right but names the lender as escrow, then borrow against it.
          </p>
          <pre className="m-0 rounded-box bg-[#11151d] text-[#f0f0f2] px-3 py-2 text-[12px] whitespace-pre-wrap font-mono">
            {`bill.createHoldByPartition(…, { escrow: lender, … })
repo.openLoan(…)   // expect: refused, wrong escrow`}
          </pre>
          <span className="text-xs text-base-content/60">Borrower · guarded by the repo contract</span>
          {results["fake-pledge"] ? (
            <AttackOutcome id="wrong-escrow-result" result={results["fake-pledge"]} />
          ) : (
            <div className="rounded-box border border-dashed border-base-300 px-4 py-3 text-sm text-base-content/70">
              Only possible before a pledge exists, so it runs on the Pledge step.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** The call behind the last market or borrower move on the stress screen. */
const STRESS_CODE: Record<string, [string, string]> = {
  shock: [
    "the call that just ran",
    `feed.setDiscountRate(rateBps)   // signed by the operator, who owns the feed
// price = 1000 × (1 − rate × daysRemaining / 360)
repo.position(loanId)           // read once a second: debt, value, ltv, liquidatable`,
  ],
  freeze: [
    "the call that just ran",
    `feed.pinUpdatedAt(now − 180)   // updatedAt falls outside the 60 s staleness window
// stale price: no new credit, no top-up, no price liquidation
// repay and term liquidation read no price, so they still work`,
  ],
  resume: ["the call that just ran", "feed.pinUpdatedAt(0)   // the feed reports the current time again"],
  "restart-bill": [
    "the call that just ran",
    "feed.setMaturityTimestamp(now + 91 days)   // on the demo clock: about fifteen minutes",
  ],
  "top-up": [
    "the call that just ran",
    `repo.topUp(loanId, amountUnits)   // signed by the borrower, needs a fresh price
// pays back principal: the debt falls, and the LTV with it`,
  ],
  liquidate: [
    "the call that just ran",
    `repo.liquidate(loanId)   // anyone may call it
// allowed when the term is over (reads no price),
// or on a fresh price with LTV ≥ 99%`,
  ],
};

const DEFAULT_STRESS_CODE: [string, string] = [
  "what the page reads",
  `repo.position(loanId)    // once a second
// → principal, interest, debt, value, ltv, liquidation price, term elapsed
feed.latestRoundData()   // Chainlink AggregatorV3: price and updatedAt`,
];

/**
 * A rate, rounded up to the next 100 bp, that prices the bill well under the liquidation price: the feed's own formula,
 * face × (1 − rate × days / 360), solved for the rate. Only a suggestion, so the input stays the reader's to change.
 */
function rateToBreach(desk: DeskView): string | null {
  const price = Number.parseFloat((desk.position.liquidationPrice ?? "").replace(/[$,]/g, ""));
  const days = Number(desk.bill.daysRemaining);
  if (!Number.isFinite(price) || !days) return null;
  // A quarter more than the bare minimum: the bill gains value every demo day, so a shock that only just crosses the
  // line falls back under it before a liquidation can land.
  const bps = (((1 - price / 1000) * 360 * 10_000) / days) * 1.25;
  return bps > 0 ? (Math.ceil(bps / 100) * 100).toString() : null;
}

function headline(desk: DeskView): string {
  const p = desk.position;
  if (p.status === "OPEN") return `The loan is healthy at ${p.ltv}.`;
  if (p.status === "MARGIN CALL") return `Margin call: the loan is at ${p.ltv}, over the 98% limit.`;
  if (p.status === "LIQUIDATABLE")
    return p.termElapsed
      ? "Term over."
      : `Each bill is now worth ${desk.bill.price}: the loan is at ${p.ltv}, over the 99% line.`;
  return "The price cannot be stood behind.";
}

function StressScreen({ ctx }: { ctx: Ctx }) {
  const { desk, busy, results, go } = ctx;
  const p = desk.position;
  const [topUp, setTopUp] = useState("400");
  const breakRate = rateToBreach(desk);
  const [rate, setRate] = useState(breakRate ?? "1400");
  const [last, setLast] = useState<string | null>(null);
  const move = async (key: string, request: ActionRequest) => {
    setLast(key);
    await go(key, request);
  };
  const tone = p.status === "OPEN" ? "alert-success" : p.status === "LIQUIDATABLE" ? "alert-error" : "alert-warning";
  const breached = p.status !== "OPEN";
  const [codeTitle, code] = (last && STRESS_CODE[last]) || DEFAULT_STRESS_CODE;
  const failed = (key: string) => {
    const result = results[key];
    return result ? <Outcome id={OUTCOME_ID[key]} result={result} /> : null;
  };

  return (
    <>
      <div id="loan-status-note" role={breached ? "alert" : "status"} className={`alert ${tone} text-sm py-2`}>
        <span>
          <strong>{headline(desk)}</strong> {p.statusNote}
        </span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title="How safe is the loan?"
            caption="Loan-to-value: the debt as a share of what the pledged bills are worth."
          >
            <LtvBar ltv={p.ltv} loanOpen />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ["Debt", "debt", usd(p.debt), `${usd(p.principal)} + ${usd(p.interest)} interest`],
                [
                  "Collateral value",
                  "collateral-value",
                  show(p.value, "unavailable"),
                  `${show(p.pledged)} bills × ${show(desk.bill.price, "?")}`,
                ],
                ["LTV", "ltv", show(p.ltv, "unavailable"), null],
              ].map(([label, id, value, note]) => (
                <div key={id} className="rounded-box bg-base-200 px-4 py-3 flex flex-col gap-0.5">
                  <Label>{label}</Label>
                  <span id={id ?? undefined} className="text-xl font-bold">
                    {value}
                  </span>
                  {note ? <span className="text-xs text-base-content/70">{note}</span> : null}
                  {id === "ltv" ? (
                    <span id="loan-status" className="text-xs font-semibold">
                      {p.status}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <Why label="Why 98% and 99%?">
              <p className="m-0">
                98% is the most the lender lends against the bills: their value less the {p.haircut} haircut. Above it
                the loan is in a margin call. Nothing happens on its own, but the borrower should pay some back.
              </p>
              <p className="m-0">
                99% is the liquidation line. On a fresh price at or above it, anyone may liquidate and the bills go to
                the lender. When the term ends unpaid, anyone may liquidate whatever the price.
              </p>
            </Why>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                More numbers: liquidation price, headroom, accretion, carry, term
              </summary>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat label="Principal" id="principal" value={usd(p.principal)} />
                <Stat label="Interest accrued" id="interest-accrued" value={usd(p.interest)} />
                <Stat label="Liquidation price (per bill)" id="liquidation-price" value={show(p.liquidationPrice)} />
                <Stat label="Headroom" id="headroom" value={show(p.headroom, "unavailable")} />
                <Stat label="Borrowing capacity" id="borrowing-capacity" value={show(p.capacity, "unavailable")} />
                <Stat label="Term remaining (demo days)" id="term-remaining" value={show(p.termRemaining)} />
                <Stat label="Bill accretion since the loan opened" id="accretion" value={show(p.accretion)} />
                <Stat label="Carry (accretion − interest)" id="carry" value={show(p.carry)} />
                <Stat label="Haircut · liquidation threshold" id="haircut" value={`${p.haircut} · ${p.threshold}`} />
              </div>
              {p.carryNote ? (
                <p id="carry-note" className="m-0 mt-3 text-xs text-base-content/70">
                  {p.carryNote}
                </p>
              ) : null}
            </details>
          </Panel>
          <UnderTheHood title={codeTitle} code={code} />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="Market" caption="You play it: the operator owns the feed.">
            <Field label="Discount rate to publish (basis points)" htmlFor="shock-rate">
              <div className="flex gap-2">
                <input
                  id="shock-rate"
                  className="input input-bordered w-28"
                  inputMode="numeric"
                  value={rate}
                  onChange={event => setRate(event.target.value)}
                />
                <Button
                  id="apply-shock"
                  label="Shock the rate"
                  busyKey="shock"
                  busy={busy}
                  disabled={false}
                  variant={breached ? "btn-outline" : "btn-primary"}
                  onClick={() => void move("shock", { type: "shock", bps: rate })}
                />
              </div>
            </Field>
            <span className="text-xs text-base-content/70">
              {desk.bill.daysRemaining === "0"
                ? "The bill has matured and prices at $1,000 whatever the rate. Reset its clock, above, before a shock."
                : `Today's rate is ${show(desk.bill.discountRateBps)} bp. Each 100 bp costs the bill about $2.50${breakRate ? `; about ${breakRate} bp pushes this loan over the 99% line` : ""}.`}
            </span>
            {failed("shock")}
            <div className="flex flex-wrap gap-2">
              <Button
                id="freeze-feed"
                label="Freeze the feed"
                busyKey="freeze"
                busy={busy}
                disabled={false}
                variant="btn-outline btn-sm"
                onClick={() => void move("freeze", { type: "freeze" })}
              />
              <Button
                id="resume-feed"
                label="Restart the feed"
                busyKey="resume"
                busy={busy}
                disabled={false}
                variant="btn-outline btn-sm"
                onClick={() => void move("resume", { type: "resume" })}
              />
            </div>
            <span className="text-xs text-base-content/70">
              A frozen feed goes stale after 60 seconds: top-ups and price liquidation stop; repay and term liquidation
              still work.
            </span>
            {last && ["freeze", "resume"].includes(last) ? failed(last) : null}
          </Panel>
          <History entries={ctx.snapshot.activity} />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title="Your move"
            caption={breached ? "Cure the breach before someone liquidates." : "Nothing to cure yet."}
          >
            <div className="flex flex-col gap-3">
              <Label>Borrower</Label>
              <Field label="Pay back part of the loan (US dollars)" htmlFor="top-up-amount">
                <div className="flex gap-2">
                  <input
                    id="top-up-amount"
                    className="input input-bordered w-28"
                    inputMode="numeric"
                    value={topUp}
                    onChange={event => setTopUp(event.target.value)}
                  />
                  <Button
                    id="top-up"
                    label={`Pay back ${usd(topUp.trim() || null)}`}
                    busyKey="top-up"
                    busy={busy}
                    disabled={false}
                    variant={breached ? "btn-primary" : "btn-outline"}
                    onClick={() => void move("top-up", { type: "top-up", amount: topUp })}
                  />
                </div>
              </Field>
              <span className="text-xs text-base-content/70">
                Lowers the debt, and the LTV with it. Needs a fresh price.
              </span>
              {failed("top-up")}
              <Button
                id="repay-loan"
                label={`Repay in full (${usd(p.debt)})`}
                busyKey="repay"
                busy={busy}
                disabled={false}
                variant="btn-outline"
                onClick={() => void move("repay", { type: "repay" })}
              />
              {results.repay && !results.repay.ok ? failed("repay") : null}
            </div>
            <div className="divider my-0" />
            <div className="flex flex-col gap-3">
              <Label>Lender, or anyone</Label>
              <Button
                id="liquidate"
                label="Liquidate: take the collateral"
                busyKey="liquidate"
                busy={busy}
                disabled={false}
                variant="btn-error"
                onClick={() => void move("liquidate", { type: "liquidate" })}
              />
              <span className="text-xs text-base-content/70">
                {p.status === "LIQUIDATABLE"
                  ? p.termElapsed
                    ? "Allowed now: the term is over, and that path reads no price."
                    : "Allowed now: the LTV is at or above 99% on a fresh price."
                  : p.status === "UNKNOWN"
                    ? "Refused on price while the feed is stale. Allowed once the term ends."
                    : "Refused now: the LTV is under 99% and the term has not ended. Try it anyway."}
              </span>
              {results.liquidate && !results.liquidate.ok ? failed("liquidate") : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function ResolveScreen({
  ctx,
  onPledgeAgain,
  setup,
}: {
  ctx: Ctx;
  onPledgeAgain: () => void;
  setup: () => Promise<void>;
}) {
  const { desk, busy, snapshot } = ctx;
  const liquidated = desk.position.status === "LIQUIDATED";
  const timeline = snapshot.activity
    .filter(entry => entry.result === "SUCCESS")
    .slice(0, 10)
    .reverse();

  return (
    <Columns
      main={
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              <StepCard
                step={6}
                who="Outcome"
                title={liquidated ? "Liquidated: the lender took the bills" : "Repaid: the bills are free again"}
              >
                <p className="m-0 text-base-content/80 max-w-2xl">
                  {liquidated
                    ? "The repo contract executed the hold. The bills went to the one destination fixed at pledge time, the lender. Nobody else could have received them."
                    : "The borrower paid principal plus interest to the lender in the same transaction that released the hold. The bills never left the borrower's wallet."}
                </p>
                <span className="text-sm">
                  Loan status: <strong id="loan-status">{desk.position.status}</strong>
                </span>
                <UnderTheHood
                  title="how it closed"
                  code={
                    liquidated
                      ? `repo.liquidate(loanId)   // anyone may call it
// checks: term over (no price needed), or a fresh price with LTV ≥ 99%
bill.executeHoldByPartition(hold, lender, ${desk.cash.lenderBills ?? "10"})
// ATS only accepts the destination fixed at pledge time`
                      : `repo.repay(loanId)   // signed by the borrower
// stablecoin: borrower → lender, principal + interest
bill.releaseHoldByPartition(hold, amount)   // the repo contract, as escrow`
                  }
                />
              </StepCard>
              <Panel title="What happened" caption="This desk's transactions, oldest first.">
                <ol className="m-0 pl-5 list-decimal flex flex-col gap-1.5 text-sm max-h-48 overflow-y-auto">
                  {timeline.map(entry => (
                    <li key={entry.id}>
                      {entry.action}
                      {entry.txHash ? (
                        <>
                          {" "}
                          <a className="link link-primary" href={txLink(entry.txHash)} target="_blank" rel="noreferrer">
                            HashScan ↗
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
            <BillsCard
              desk={desk}
              caption={liquidated ? "The pledged bills now sit with the lender." : "Unlocked, in the same wallet."}
            />
          </div>
        </>
      }
      aside={
        <>
          <Panel title="What next?">
            {liquidated ? null : (
              <button id="pledge-again" type="button" className="btn btn-primary" onClick={onPledgeAgain}>
                Pledge again on this desk
              </button>
            )}
            <button
              id="setup-again"
              type="button"
              className={`btn ${liquidated ? "btn-primary" : "btn-outline"}`}
              disabled={busy !== null}
              onClick={() => void setup()}
            >
              Set up a fresh desk
            </button>
            <span className="text-xs text-base-content/70">
              {liquidated
                ? "The borrower has no bills left, so another run needs a new desk: about six minutes."
                : "A fresh desk starts over with new contracts: about six minutes."}{" "}
              Or switch to the Sandbox, top right, to use every control at once.
            </span>
          </Panel>
          {liquidated ? (
            <div role="note" className="alert alert-warning text-sm">
              <span className="flex flex-col gap-1">
                <strong>Simplified here</strong>
                <span>
                  The lender keeps every bill. A real repo agreement values them at close-out and returns anything above
                  the debt to the borrower.
                </span>
              </span>
            </div>
          ) : null}
        </>
      }
    />
  );
}
