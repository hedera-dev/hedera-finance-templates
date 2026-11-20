"use client";

import { useEffect, useRef, useState } from "react";
import { HistoryPanel, HoldersPanel, OrderPanel, PendingPanel, SetupPanel, WalletStateCard } from "./SecurityDesk";
import {
  AttackOutcome,
  Columns,
  Label,
  OfficersCard,
  Panel,
  Refusal,
  StepCard,
  TokenStrip,
  TxLink,
  UnderTheHood,
} from "./TourParts";
import type { SecurityDeskHook, TourResult } from "./useSecurityDesk";
import { hashscanTransaction } from "~~/services/security/hashscan";
import type { DeskStateView } from "~~/services/security/types";

type Stage = "setup" | "propose" | "approve" | "break" | "orders";
type Chapter = "break" | "orders";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "propose", label: "Propose" },
  { stage: "approve", label: "Approve" },
  { stage: "break", label: "Break it" },
  { stage: "orders", label: "More orders" },
];
const TOTAL = STEPS.length;
const DEFAULT_REFERENCE = "CASE-2026-114";

/** An order that reached the chain: an approval, whatever the token answered. */
const orderCarried = (state: DeskStateView) => state.history.some(entry => entry.kind === "approve");

/**
 * The step follows the desk, not this tab, so a reload or a detour through the Sandbox lands on the right one. Only
 * which of the last two chapters the reader is on is their own.
 */
function stageOf(state: DeskStateView | null, settingUp: boolean, chapter: Chapter): Stage {
  if (!state || !state.setupComplete || !state.token || settingUp) return "setup";
  if (!orderCarried(state)) return state.pending.length > 0 ? "approve" : "propose";
  return chapter;
}

type Ctx = {
  state: DeskStateView;
  desk: SecurityDeskHook;
  results: Record<string, TourResult | null>;
  go: (key: string, url: string, body?: unknown) => Promise<void>;
};

export function Tour({ desk }: { desk: SecurityDeskHook }) {
  const { state, isSettingUp } = desk;
  const [chapter, setChapter] = useState<Chapter>("break");
  const [results, setResults] = useState<Record<string, TourResult | null>>({});
  const [flash, setFlash] = useState<{ text: string; result: TourResult } | null>(null);

  // A fresh desk forgets the last one's results and starts its chapters over.
  const tokenId = state?.token?.contractId ?? null;
  useEffect(() => {
    setResults({});
    setFlash(null);
    setChapter("break");
  }, [tokenId]);

  // An order nobody approves in time runs out of time on the board, which empties the pending list and
  // rewinds the tour to Propose. Without this the step appears to have reset itself. Only an expiry that
  // lands while the page is open is announced: the first read is remembered, not reported.
  const expired = state?.history.find(entry => entry.result === "EXPIRED") ?? null;
  const expiredId = expired?.id ?? null;
  const expiredLabel = expired?.action ?? "";
  const announcedExpiry = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = announcedExpiry.current;
    announcedExpiry.current = expiredId;
    if (previous === undefined || expiredId === null || expiredId === previous) return;
    setFlash({
      text: `${expiredLabel} — no second approval arrived in time, so the order ran out. Propose it again.`,
      result: { ok: false, result: "EXPIRED", message: "" },
    });
  }, [expiredId, expiredLabel]);

  const go = async (key: string, url: string, body?: unknown) => {
    setResults(previous => ({ ...previous, [key]: null }));
    setFlash(null);
    desk.clearMessage();
    const result = await desk.act(key, url, body);
    setResults(previous => ({ ...previous, [key]: result }));
    // Proposing and approving move the tour on, so their outcome is announced above the next step.
    if (key === "propose" && result.ok) setFlash({ text: `Proposed as order ${result.proposalId}.`, result });
    if (key === "approve" && result.result !== "Error")
      setFlash({ text: `The board put the order to the token: ${result.result}.`, result });
  };

  // Moving between chapters retires the last announcement: it belonged to the step it was made on.
  const pick = (next: Chapter) => {
    setChapter(next);
    setFlash(null);
    desk.clearMessage();
  };

  const stage = stageOf(state, isSettingUp, chapter);
  const ctx = state?.token ? { state, desk, results, go } : null;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={state ? stage : null} pickable={stage === "break" || stage === "orders"} onPick={pick} />
      {flash ? (
        <div role="status" className={`alert ${flash.result.ok ? "alert-success" : "alert-error"} text-sm py-2`}>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {flash.text} {flash.result.txHash ? <TxLink hash={flash.result.txHash} /> : null}
          </span>
        </div>
      ) : null}
      {desk.message ? (
        <div role="alert" className="alert alert-error text-sm py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">{desk.message}</span>
        </div>
      ) : null}
      {ctx && stage !== "setup" ? <TokenStrip state={ctx.state} /> : null}
      {!state ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the desk…
        </div>
      ) : stage === "setup" || !ctx ? (
        <SetupScreen desk={desk} state={state} />
      ) : stage === "propose" ? (
        <ProposeScreen ctx={ctx} />
      ) : stage === "approve" ? (
        <ApproveScreen ctx={ctx} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => pick("orders")} />
      ) : (
        <OrdersScreen ctx={ctx} />
      )}
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
        // Once an order has gone through, the last two chapters are the reader's to move between.
        const canPick = pickable && !here && (step.stage === "break" || step.stage === "orders");
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

function SetupScreen({ desk, state }: { desk: SecurityDeskHook; state: DeskStateView }) {
  return (
    <Columns
      main={
        <>
          <StepCard step={1} total={TOTAL} who="Operator" title="Deploy the token, its board and its officers">
            <p className="m-0 text-base-content/80 max-w-2xl">
              One press creates three officer keys, deploys a 2-of-3 board for them, issues a security through the Asset
              Tokenization Studio factory already on testnet with that board holding its KYC, freeze, controller and
              pause roles, and creates two demo holders. Holder A gets KYC and 100 tokens; Holder B gets neither. No
              officer holds a compliance role, so no officer can act alone.
            </p>
            <p className="m-0 text-sm text-base-content/70 max-w-2xl">
              Connect a wallet <strong>before</strong> you press it to make the wallet Officer 3. The board&apos;s
              officers are fixed when it is deployed.
            </p>
          </StepCard>
          <SetupPanel
            configured={state.config.configured}
            missing={state.config.missing}
            steps={desk.setupSteps}
            isSettingUp={desk.isSettingUp}
            onSetup={desk.runSetup}
          />
        </>
      }
      aside={
        <Panel title="What happens next" caption="Four steps, one action each.">
          <ol className="m-0 pl-5 list-decimal flex flex-col gap-2 text-sm">
            <li>
              <strong>Propose</strong>: Officer 1 proposes a court order to freeze Holder A. One approval is not enough,
              so nothing reaches the token yet.
            </li>
            <li>
              <strong>Approve</strong>: Officer 2 approves too, and the board freezes Holder A in that transaction.
            </li>
            <li>
              <strong>Break it</strong>: try three ways around the roles. Each should be refused.
            </li>
            <li>
              <strong>More orders</strong>: unfreeze, redeem, revoke KYC, pause, or withdraw an order.
            </li>
          </ol>
          <WalletStateCard wallet={state.wallet} />
        </Panel>
      }
    />
  );
}

function ProposeScreen({ ctx }: { ctx: Ctx }) {
  const { state, desk, results, go } = ctx;
  const [reference, setReference] = useState(DEFAULT_REFERENCE);
  return (
    <Columns
      main={
        <>
          <StepCard step={2} total={TOTAL} who="Officer 1" title="Propose a court order: freeze Holder A">
            <p className="m-0 text-base-content/80 max-w-2xl">
              A court instructs the transfer agent to freeze Holder A. Officer 1 records the call on the board, with
              only Officer 1&apos;s approval on it. The board acts on the second officer&apos;s approval and not before,
              so nothing reaches the token yet and Holder A stays unfrozen.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Case reference</span>
                <input
                  id="tour-reference"
                  className="input input-bordered w-56"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                />
              </label>
              <button
                id="propose-freeze"
                type="button"
                className="btn btn-primary"
                disabled={desk.busyKey !== null}
                onClick={() =>
                  void go("propose", "/api/security/orders/propose", {
                    action: "freeze",
                    holderId: "A",
                    reference: reference.trim() || DEFAULT_REFERENCE,
                  })
                }
              >
                {desk.busyKey === "propose" ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                Propose as Officer 1
              </button>
            </div>
            <Refusal id="propose-error" result={results.propose ?? null} />
          </StepCard>
          <UnderTheHood
            title="the calls this step makes"
            code={`// Officer 1 records the token's own call on the board. The board holds ROLE_FREEZE_MANAGER;
// Officer 1 holds nothing, so this is the only route the call has.
board.propose(
  token,
  encodeFunctionData({ abi: tokenAbi, functionName: "setAddressFrozen", args: [holderA, true] }),
)   // case ${reference} — one approval of the two the board needs`}
          />
        </>
      }
      aside={<OfficersCard pending={null} wallet={state.wallet} />}
    />
  );
}

function ApproveScreen({ ctx }: { ctx: Ctx }) {
  const { state, desk, results, go } = ctx;
  const pending = state.pending[0];
  const walletOfficer = state.wallet.kind === "officer3";
  return (
    <Columns
      main={
        <>
          <StepCard step={3} total={TOTAL} who="Officer 2" title={`Approve: ${pending.actionLabel}`}>
            <p className="m-0 text-base-content/80 max-w-2xl">
              Order{" "}
              <a
                className="link font-mono"
                href={hashscanTransaction(pending.proposeTxHash)}
                target="_blank"
                rel="noreferrer"
              >
                {pending.proposalId}
              </a>{" "}
              is waiting on the board for case {pending.reference}. It runs out at{" "}
              {new Date(pending.expiresAtMs).toLocaleTimeString()} if nobody approves. Officer 2&apos;s approval is the
              second of three, and the board makes the token&apos;s call in that same transaction.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="approve-order"
                type="button"
                className="btn btn-primary"
                disabled={desk.busyKey !== null}
                onClick={() =>
                  void go("approve", `/api/security/orders/${encodeURIComponent(pending.proposalId)}/approve`)
                }
              >
                {desk.busyKey === "approve" ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                Approve as Officer 2
              </button>
              {walletOfficer ? (
                <button
                  id="approve-as-wallet"
                  type="button"
                  className="btn btn-secondary"
                  disabled={desk.busyKey !== null || Boolean(desk.busy[`wallet-${pending.proposalId}`])}
                  onClick={() => desk.approveAsWallet(pending.proposalId)}
                >
                  {desk.busy[`wallet-${pending.proposalId}`] ? (
                    <span className="loading loading-spinner loading-xs" aria-hidden />
                  ) : null}
                  Approve with your wallet (Officer 3)
                </button>
              ) : null}
            </div>
            <Refusal id="approve-error" result={results.approve ?? null} />
          </StepCard>
          <UnderTheHood
            title="the calls this step makes"
            code={`board.approve(${pending.proposalId})   // signed by Officer 2
// Two distinct officers, so inside that same transaction the board makes the call:
//   token.setAddressFrozen(holderA, true)
// A wallet officer sends exactly this, from the browser. No special signing path.`}
          />
        </>
      }
      aside={<OfficersCard pending={pending} wallet={state.wallet} />}
    />
  );
}

const ATTACKS: { type: string; who: string; title: string; text: string; meaning: string; code: string }[] = [
  {
    type: "send-no-kyc",
    who: "Issuer",
    title: "Send to Holder B",
    text: "Send 10 tokens to a holder who was never granted KYC.",
    meaning: "The token has internal KYC switched on, so an account without it cannot receive the token.",
    code: "token.transfer(holderB, 10)   // from the issuer",
  },
  {
    type: "send-frozen",
    who: "Issuer",
    title: "Send to frozen Holder A",
    text: "Send 10 tokens to the holder the court order froze.",
    meaning: "A frozen account cannot send or receive the token until two officers unfreeze it.",
    code: "token.transfer(holderA, 10)   // from the issuer",
  },
  {
    type: "one-officer",
    who: "Officer 1",
    title: "Act with one officer",
    text: "Officer 1 calls the token directly, with no board and no second officer.",
    meaning: "ROLE_FREEZE_MANAGER belongs to the board, and to no officer. The token refuses its own officer.",
    code: "token.setAddressFrozen(holderA, true)   // sent by Officer 1, who holds no role",
  },
  {
    type: "one-officer-board",
    who: "Officer 1",
    title: "Be both officers",
    text: "Officer 1 proposes an order and then approves it, to reach two approvals alone. Needs an order waiting.",
    meaning: "The board counts officers, not approvals: the one who proposed is already the first of the two.",
    code: "board.approve(id)   // sent by Officer 1, who proposed it",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { desk, results, go } = ctx;
  const tried = ATTACKS.map(attack => results[attack.type]).filter(result => result && result.result !== "Error");
  const refused = tried.filter(result => result && !result.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 4 of {TOTAL} · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            Try to get around the token&apos;s roles and the board. Each attempt is a real transaction, so each refusal
            is the contract&apos;s own answer, on HashScan. <strong>A refusal is a pass</strong>; an
            &quot;Accepted&quot; means the roles are not doing their job.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of {ATTACKS.length} tried · {refused} refused
          </span>
          <button id="next-orders" type="button" className="btn btn-primary" onClick={onNext}>
            Next: more orders →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                onClick={() => void go(attack.type, "/api/security/attack", { type: attack.type })}
              >
                {desk.busyKey === attack.type ? (
                  <span className="loading loading-spinner loading-xs" aria-hidden />
                ) : null}
                {results[attack.type] ? "Try again" : "Run this attack"}
              </button>
              <span className="text-xs text-base-content/60">{attack.who} · guarded by the contract</span>
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

function OrdersScreen({ ctx }: { ctx: Ctx }) {
  const { state, desk } = ctx;
  return (
    <Columns
      main={
        <>
          <div className="flex flex-col gap-1 max-w-4xl">
            <Label>Step 5 of {TOTAL} · Officers</Label>
            <h2 id="step-title" className="m-0 text-xl font-bold">
              Carry out more orders
            </h2>
            <p className="m-0 text-sm text-base-content/80">
              Every order works the same way: Officer 1 proposes, a second officer approves, and only then does the
              board call the token. Unfreeze Holder A and send to it again, redeem a holding, revoke KYC, or pause the
              token.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <OrderPanel holders={state.holders} busy={Boolean(desk.busy.propose)} onPropose={desk.propose} />
            <div className="flex flex-col gap-4">
              <PendingPanel
                rows={state.pending}
                isWalletOfficer={state.wallet.kind === "officer3"}
                busy={desk.busy}
                onApprove={desk.approve}
                onDelete={desk.remove}
                onApproveWallet={desk.approveAsWallet}
              />
              <WalletStateCard wallet={state.wallet} />
            </div>
          </div>
        </>
      }
      aside={
        <>
          <OfficersCard pending={state.pending[0] ?? null} wallet={state.wallet} />
          <HoldersPanel holders={state.holders} busy={desk.busy} results={desk.sendResults} onSend={desk.send} />
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">
              History · {state.history.length} {state.history.length === 1 ? "action" : "actions"}
            </summary>
            <div className="px-1 pb-1">
              <HistoryPanel rows={state.history} />
            </div>
          </details>
        </>
      }
    />
  );
}
