"use client";

import { useEffect, useState } from "react";
import { ActivityLog } from "./ActivityLog";
import { InvestorRow } from "./InvestorRow";
import { IssueBondForm } from "./IssueBondForm";
import { IssueProgress } from "./IssueProgress";
import {
  AttackOutcome,
  BondStrip,
  Columns,
  HashScanTx,
  HoldersCard,
  Label,
  Panel,
  Refusal,
  StepCard,
  UnderTheHood,
} from "./TourParts";
import { WalletInvestorCard } from "./WalletInvestorCard";
import type { BondDesk } from "./useBondDesk";
import type { ActionResult, AttackType, DeskStatus, InvestorView } from "~~/types/ats";

type Stage = "issue" | "approve" | "distribute" | "break" | "manage";
type Chapter = "break" | "manage";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "issue", label: "Issue" },
  { stage: "approve", label: "Approve" },
  { stage: "distribute", label: "Distribute" },
  { stage: "break", label: "Break it" },
  { stage: "manage", label: "Manage the list" },
];
const TOTAL = STEPS.length;

/**
 * The step is read from the chain, not remembered by this tab, so a reload or a detour through the Sandbox lands on the
 * right one. Only which of the last two chapters the reader is on is their own.
 */
function stageOf(status: DeskStatus | null, issuing: boolean, chapter: Chapter): Stage {
  const bond = status?.bond;
  if (!bond || issuing) return "issue";
  // An unread supply is not an empty one: stay where the reader was rather than send them back.
  if (bond.totalSupply === 0) return status.investors.some(i => i.approved) ? "distribute" : "approve";
  return chapter;
}

const byLabel = (investors: InvestorView[], label: string) => investors.find(i => i.label === label) ?? null;

type Ctx = {
  status: DeskStatus;
  desk: BondDesk;
  results: Record<string, ActionResult | null>;
  go: (key: string, run: () => Promise<ActionResult>) => Promise<void>;
};

export function Tour({ desk }: { desk: BondDesk }) {
  const { status, issuing, busyKey } = desk;
  const [chapter, setChapter] = useState<Chapter>("break");
  const [results, setResults] = useState<Record<string, ActionResult | null>>({});
  const [flash, setFlash] = useState<ActionResult | null>(null);

  // A new bond forgets the last one's results and starts its chapters over.
  const bondAddress = status?.bond?.address ?? null;
  useEffect(() => {
    setResults({});
    setFlash(null);
    setChapter("break");
  }, [bondAddress]);

  const go = async (key: string, run: () => Promise<ActionResult>) => {
    setResults(previous => ({ ...previous, [key]: null }));
    setFlash(null);
    const result = await run();
    setResults(previous => ({ ...previous, [key]: result }));
    // Approving and distributing move the tour on, so their success is announced above the next step.
    if (result.ok && (key === "approve" || key === "distribute")) setFlash(result);
  };

  const stage = stageOf(status, issuing, chapter);
  const ctx = status?.bond ? { status, desk, results, go } : null;
  const distributed = (status?.bond?.totalSupply ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={status ? stage : null} pickable={distributed && !issuing} onPick={setChapter} />
      {flash ? (
        <div role="status" className="alert alert-success text-sm py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {flash.message} {flash.txHash ? <HashScanTx hash={flash.txHash} /> : null}
          </span>
        </div>
      ) : null}
      {ctx && stage !== "issue" ? <BondStrip bond={ctx.status.bond!} investors={ctx.status.investors} /> : null}
      {!status ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the desk…
        </div>
      ) : stage === "issue" || !ctx ? (
        <IssueScreen desk={desk} />
      ) : stage === "approve" ? (
        <ApproveScreen ctx={ctx} />
      ) : stage === "distribute" ? (
        <DistributeScreen ctx={ctx} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => setChapter("manage")} />
      ) : (
        <ManageScreen ctx={ctx} />
      )}
      {busyKey ? <span className="sr-only">Working…</span> : null}
    </div>
  );
}

function Stepper({
  stage,
  pickable,
  onPick,
}: {
  /** `null` until the first read lands: no step is claimed before the desk is known. */
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
        // Once the bond is out, the last two chapters are the reader's to move between.
        const canPick = pickable && !here && (step.stage === "break" || step.stage === "manage");
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

function IssueForm({ desk, progressElsewhere }: { desk: BondDesk; progressElsewhere?: boolean }) {
  const { status, statusLoaded, issuing, issueError, steps, issueBond } = desk;
  return (
    <IssueBondForm
      configured={statusLoaded ? (status?.configured ?? false) : false}
      configError={status?.configError}
      issuing={issuing}
      issueError={issueError}
      steps={steps}
      onIssue={issueBond}
      progressElsewhere={progressElsewhere}
    />
  );
}

function IssueScreen({ desk }: { desk: BondDesk }) {
  return (
    <Columns
      main={
        <>
          <StepCard step={1} total={TOTAL} who="Issuer" title="Issue the bond">
            <p className="m-0 text-base-content/80 max-w-2xl">
              One press deploys a bond through Asset Tokenization Studio&apos;s factory on Hedera testnet, with you as
              its issuer, then creates two demo investors. This app deploys no contract of its own. It takes about a
              minute and some 12 testnet HBAR from the operator account.
            </p>
          </StepCard>
          <IssueForm desk={desk} progressElsewhere />
        </>
      }
      aside={
        desk.issuing || desk.issueError ? (
          <Panel title="Issuing" caption="Each step reports as it starts and finishes.">
            <IssueProgress steps={desk.steps} />
          </Panel>
        ) : (
          <Panel title="What happens next" caption="Four steps, one action each.">
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-2 text-sm">
              <li>
                <strong>Approve</strong>: put Investor A on the bond&apos;s allowlist. Leave Investor B off.
              </li>
              <li>
                <strong>Distribute</strong>: issue bonds to Investor A.
              </li>
              <li>
                <strong>Break it</strong>: try three ways around the allowlist. Each should be refused.
              </li>
              <li>
                <strong>Manage the list</strong>: approve and revoke investors, and add your own wallet.
              </li>
            </ol>
          </Panel>
        )
      }
    />
  );
}

function ApproveScreen({ ctx }: { ctx: Ctx }) {
  const { status, desk, results, go } = ctx;
  const a = byLabel(status.investors, "Investor A");
  return (
    <Columns
      main={
        <>
          <StepCard step={2} total={TOTAL} who="Issuer" title="Put Investor A on the allowlist">
            <p className="m-0 text-base-content/80 max-w-2xl">
              The bond was deployed with an allowlist as its control list: only addresses on it may receive or hold the
              bond, and the bond checks on every issue and every transfer. Approve Investor A. Leave Investor B off: it
              is the one the bond should refuse in step 4.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="approve-investor-a"
                type="button"
                className="btn btn-primary"
                disabled={!a || desk.busyKey !== null}
                onClick={() =>
                  a && void go("approve", () => desk.act("approve", `/api/hedera/bond/investors/${a.address}/approve`))
                }
              >
                {desk.busyKey === "approve" ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                Approve Investor A
              </button>
            </div>
            <Refusal id="approve-error" result={results.approve ?? null} />
          </StepCard>
          <UnderTheHood
            title="the call this step makes"
            code={`bond.addToControlList(investorA)   // signed by the issuer, who holds the control-list role
bond.isInControlList(investorA)   // read back: true`}
          />
        </>
      }
      aside={<HoldersCard investors={status.investors} caption="Neither investor is on the allowlist yet." />}
    />
  );
}

function DistributeScreen({ ctx }: { ctx: Ctx }) {
  const { status, desk, results, go } = ctx;
  const a = byLabel(status.investors, "Investor A");
  const [amount, setAmount] = useState("100");
  // The label, the call and the request all use the same number, and none of them is sent until it is a whole one.
  const count = /^\d+$/.test(amount) && Number(amount) > 0 ? Number(amount) : null;
  const bonds = count === null ? "bonds" : `${count.toLocaleString()} ${count === 1 ? "bond" : "bonds"}`;
  return (
    <Columns
      main={
        <>
          <StepCard step={3} total={TOTAL} who="Issuer" title="Issue bonds to Investor A">
            <p className="m-0 text-base-content/80 max-w-2xl">
              Issuing mints new bonds straight to an investor. The bond checks the allowlist first, so this works for
              Investor A and would not for Investor B.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Bonds to issue</span>
                <input
                  id="distribute-amount"
                  type="number"
                  min={1}
                  step={1}
                  className="input input-bordered w-32"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </label>
              <button
                id="distribute"
                type="button"
                className="btn btn-primary"
                disabled={!a || count === null || desk.busyKey !== null}
                onClick={() =>
                  a &&
                  count !== null &&
                  void go("distribute", () =>
                    desk.act("distribute", `/api/hedera/bond/investors/${a.address}/issue`, { amount: count }),
                  )
                }
              >
                {desk.busyKey === "distribute" ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                Issue {bonds} to Investor A
              </button>
            </div>
            <Refusal id="distribute-error" result={results.distribute ?? null} />
          </StepCard>
          <UnderTheHood
            title="the call this step makes"
            code={`bond.issue(investorA, ${count ?? "amount"}, "0x")   // signed by the issuer, who holds the issuer role
// the bond checks the allowlist and the maximum supply before it mints`}
          />
        </>
      }
      aside={<HoldersCard investors={status.investors} caption="Investor A is approved. Investor B is not." />}
    />
  );
}

const ATTACKS: {
  type: AttackType;
  who: string;
  title: string;
  text: string;
  meaning: string;
  code: string;
}[] = [
  {
    type: "issue-unapproved",
    who: "Issuer",
    title: "Issue to Investor B",
    text: "Mint 100 bonds to an investor who is not on the allowlist.",
    meaning: "The bond only mints to addresses on its allowlist.",
    code: 'bond.issue(investorB, 100, "0x")   // signed by the issuer',
  },
  {
    type: "over-cap",
    who: "Issuer",
    title: "Mint past the cap",
    text: "Issue one more bond than the maximum supply allows, to an approved investor.",
    meaning: "The maximum supply is fixed when the bond is issued, and the bond never mints past it.",
    code: 'bond.issue(investorA, maxSupply − issued + 1, "0x")',
  },
  {
    type: "transfer-unapproved",
    who: "Investor A",
    title: "Sell to Investor B",
    text: "Investor A, who holds bonds, sends one to an investor who is not on the allowlist.",
    meaning: "The bond checks the receiver on every transfer, not only when it issues.",
    code: "bond.transfer(investorB, 1)   // signed by Investor A's own key",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { desk, results, go } = ctx;
  const tried = ATTACKS.map(attack => results[attack.type]).filter(Boolean);
  const refused = tried.filter(result => result && !result.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 4 of {TOTAL} · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            Try to put the bond where the allowlist says it cannot go. Each attempt is sent as a real transaction, so
            each refusal links to HashScan. <strong>A refusal is a pass</strong>; an &quot;Accepted&quot; means the
            allowlist is not doing its job.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of {ATTACKS.length} tried · {refused} refused
          </span>
          <button id="next-manage" type="button" className="btn btn-primary" onClick={onNext}>
            Next: manage the list →
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
                disabled={desk.busyKey !== null}
                onClick={() => void go(attack.type, () => desk.attack(attack.type))}
              >
                {desk.busyKey === attack.type ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                {results[attack.type] ? "Try again" : "Run this attack"}
              </button>
              <span className="text-xs text-base-content/60">{attack.who} · guarded by the bond · sent on-chain</span>
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

function ManageScreen({ ctx }: { ctx: Ctx }) {
  const { status, desk } = ctx;
  return (
    <Columns
      main={
        <StepCard step={5} total={TOTAL} who="Issuer" title="Change who may hold it">
          <p className="m-0 text-base-content/80 max-w-2xl">
            The allowlist is the issuer&apos;s to change at any time, and the bond follows it from the next transaction
            on. Approve Investor B and issue it some bonds; revoke it, and it keeps them but cannot receive more.
          </p>
          {desk.actionError ? (
            <p id="action-error" className="m-0 text-sm text-error" role="alert">
              {desk.actionError}
            </p>
          ) : null}
          <ul id="investors" className="m-0 p-0 flex flex-col gap-3">
            {status.investors.map(investor => (
              <InvestorRow
                key={investor.address}
                investor={investor}
                busy={desk.busyAddress === investor.address}
                onApprove={() => desk.approveInvestor(investor.address)}
                onRevoke={() => desk.revokeInvestor(investor.address)}
                onIssue={amount => desk.issueToInvestor(investor.address, amount)}
              />
            ))}
          </ul>
        </StepCard>
      }
      aside={
        <>
          {/* The rows beside this already show who is approved and what each holds, so no picture here. */}
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">Hold it in your own wallet</summary>
            <div className="px-1 pb-1">
              <WalletInvestorCard
                bondAddress={status.bond?.address ?? null}
                investors={status.investors}
                addingWallet={desk.addingWallet}
                onAddWalletInvestor={desk.addWalletInvestor}
                onLogActivity={desk.logActivity}
                onTransferred={desk.refreshStatus}
              />
            </div>
          </details>
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">History · {status.activity.length} actions</summary>
            <div className="px-1 pb-1">
              <ActivityLog entries={status.activity} />
            </div>
          </details>
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">Issue a fresh bond</summary>
            <div className="px-1 pb-1">
              <IssueForm desk={desk} />
            </div>
          </details>
        </>
      }
    />
  );
}
