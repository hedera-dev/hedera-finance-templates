"use client";

import { useState } from "react";
import { SetupStep, useSecurityDesk } from "~~/app/_components/security/useSecurityDesk";
import { hashscanAccount, hashscanSchedule, hashscanToken, hashscanTransaction } from "~~/services/security/hashscan";
import type { DeskStateView, HolderId, OrderAction } from "~~/services/security/types";

type HolderView = DeskStateView["holders"][number];
type PendingView = DeskStateView["pending"][number];
type HistoryView = DeskStateView["history"][number];
type BusyMap = Record<string, boolean>;

const ORDER_ACTIONS: { value: OrderAction; label: string; needsHolder: boolean }[] = [
  { value: "freeze", label: "Freeze holder", needsHolder: true },
  { value: "unfreeze", label: "Unfreeze holder", needsHolder: true },
  { value: "wipe", label: "Wipe holding", needsHolder: true },
  { value: "pause", label: "Pause token", needsHolder: false },
  { value: "unpause", label: "Unpause token", needsHolder: false },
];

const STEP_LABEL: Record<SetupStep["id"], string> = {
  officers: "Create the officer keys and the 2-of-3 threshold key",
  token: "Create the security token with that key as its KYC, freeze, wipe, pause and admin key",
  holders: "Create two demo holders and associate them",
  distribute: "Grant KYC to Holder A and transfer it 100",
};

function StepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "active") return <span className="loading loading-spinner loading-xs" aria-hidden />;
  if (status === "done") return <span className="text-success">✓</span>;
  if (status === "failed") return <span className="text-error">✕</span>;
  return <span className="text-base-content/40">•</span>;
}

function SetupPanel({
  configured,
  missing,
  steps,
  isSettingUp,
  onSetup,
}: {
  configured: boolean;
  missing: string[];
  steps: SetupStep[];
  isSettingUp: boolean;
  onSetup: () => void;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Set up the desk</h2>
        <p className="text-sm text-base-content/70 m-0">
          Creates the officer keys, the token, the two demo holders, and grants the first holder KYC, in that order.
        </p>

        {!configured && (
          <div id="config-error" role="alert" className="alert alert-error text-sm">
            Set{" "}
            {missing.map(name => (
              <code key={name} className="mx-1">
                {name}
              </code>
            ))}
            before setting up the desk.
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {steps.map(step => (
            <li
              key={step.id}
              id={`setup-step-${step.id}`}
              data-status={step.status}
              className="flex items-start gap-2 text-sm"
            >
              <StepIcon status={step.status} />
              <div>
                <p className="m-0">{STEP_LABEL[step.id]}</p>
                {step.detail && <p className="m-0 text-xs text-base-content/60">{step.detail}</p>}
              </div>
            </li>
          ))}
        </ul>

        <button
          id="setup-desk"
          className="btn btn-primary btn-sm self-start"
          disabled={!configured || isSettingUp}
          onClick={onSetup}
        >
          {isSettingUp && <span className="loading loading-spinner loading-xs" />}
          Set up desk
        </button>
      </div>
    </div>
  );
}

function describeWallet(wallet: DeskStateView["wallet"]): string {
  if (wallet.kind === "officer3") {
    return (
      `This wallet is Officer 3 for this desk (${wallet.accountId}) — it can approve a pending order by signing ` +
      `for it in the wallet, which puts its own key on that order's schedule. It pays that one small fee itself.`
    );
  }
  if (wallet.kind === "unknown") {
    return "A wallet is connected, but the desk could not reach the mirror node to check its role just now.";
  }
  if (wallet.kind === "not-officer") {
    return "A wallet is connected, but it was not connected before setup, so it can watch this desk but cannot approve orders.";
  }
  return "No wallet is connected to this desk.";
}

function WalletStateCard({ wallet }: { wallet: DeskStateView["wallet"] }) {
  return (
    <p id="wallet-state" className="text-sm text-base-content/70 m-0">
      {describeWallet(wallet)}
    </p>
  );
}

function kycLabel(kyc: HolderView["kyc"]) {
  if (kyc === "GRANTED") return "Granted";
  if (kyc === "NOT_GRANTED") return "Not granted";
  return "Unknown";
}

function frozenLabel(frozen: HolderView["frozen"]) {
  if (frozen === "FROZEN") return "Yes";
  if (frozen === "NOT_FROZEN") return "No";
  return "Unknown";
}

function HolderRow({ holder, busy, onSend }: { holder: HolderView; busy: boolean; onSend: () => void }) {
  return (
    <li
      data-account={holder.accountId}
      className="holder-row flex flex-col gap-1 border border-base-300 rounded-lg p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{holder.label}</span>
        <a href={hashscanAccount(holder.accountId)} target="_blank" rel="noreferrer" className="link text-xs font-mono">
          {holder.accountId}
        </a>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-base-content/70">
        <span>KYC: {kycLabel(holder.kyc)}</span>
        <span>Frozen: {frozenLabel(holder.frozen)}</span>
        <span>Balance: {holder.balance}</span>
      </div>
      <button className="holder-send btn btn-xs btn-outline self-start" disabled={busy} onClick={onSend}>
        {busy && <span className="loading loading-spinner loading-xs" />}
        Send 10
      </button>
    </li>
  );
}

function HoldersPanel({
  holders,
  busy,
  onSend,
}: {
  holders: HolderView[];
  busy: BusyMap;
  onSend: (holderId: HolderId) => void;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">The holders</h2>
        <p className="text-sm text-base-content/70 m-0">Two demo accounts the issuer can send the token to.</p>
        <ul id="holders" className="flex flex-col gap-2">
          {holders.map(h => (
            <HolderRow key={h.id} holder={h} busy={Boolean(busy[`send-${h.id}`])} onSend={() => onSend(h.id)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function OrderPanel({
  holders,
  busy,
  onPropose,
}: {
  holders: HolderView[];
  busy: boolean;
  onPropose: (action: OrderAction, holderId: HolderId | null, reference: string) => void;
}) {
  const [action, setAction] = useState<OrderAction>("freeze");
  const [holderId, setHolderId] = useState<HolderId | "">(holders[0]?.id ?? "");
  const [reference, setReference] = useState("CASE-2026-114");
  const meta = ORDER_ACTIONS.find(a => a.value === action)!;

  return (
    <div id="order-panel" className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">The court order</h2>
        <p className="text-sm text-base-content/70 m-0">
          Choose what the court instructs — proposing it is what starts the two-officer flow.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span>Order</span>
          <select
            id="order-action"
            className="select select-bordered select-sm"
            value={action}
            onChange={e => setAction(e.target.value as OrderAction)}
          >
            {ORDER_ACTIONS.map(a => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Holder</span>
          <select
            id="order-holder"
            className="select select-bordered select-sm"
            value={holderId}
            disabled={!meta.needsHolder}
            onChange={e => setHolderId(e.target.value as HolderId)}
          >
            <option value="">—</option>
            {holders.map(h => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Case reference</span>
          <input
            id="order-reference"
            className="input input-bordered input-sm"
            value={reference}
            onChange={e => setReference(e.target.value)}
          />
        </label>

        <button
          id="propose-order"
          className="btn btn-primary btn-sm self-start"
          disabled={busy || (meta.needsHolder && !holderId)}
          onClick={() =>
            onPropose(action, meta.needsHolder ? (holderId as HolderId) : null, reference.trim() || "CASE-2026-114")
          }
        >
          {busy && <span className="loading loading-spinner loading-xs" />}
          Propose as Officer 1
        </button>
      </div>
    </div>
  );
}

function TokenPanel({ token }: { token: NonNullable<DeskStateView["token"]> }) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">The token</h2>
        <p className="text-sm text-base-content/70 m-0">
          What the network reports for the security token, read live from the mirror node.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a
            id="token-id"
            href={hashscanToken(token.tokenId)}
            target="_blank"
            rel="noreferrer"
            className="link font-mono"
          >
            {token.tokenId}
          </a>
          <span id="token-symbol" className="badge badge-ghost">
            {token.symbol}
          </span>
          <span id="token-status" className={`badge ${token.status === "PAUSED" ? "badge-error" : "badge-success"}`}>
            {token.status}
          </span>
        </div>
        <p className="text-sm m-0">
          Total supply: <span id="token-supply">{token.supply}</span>
        </p>
        <ul id="token-keys" className="flex flex-col gap-1 text-sm">
          {token.keys === "unavailable" ? (
            <li className="text-base-content/60">Key structure unavailable.</li>
          ) : (
            token.keys.map(k => (
              <li key={k.name} className="token-key">
                {k.name}: {k.isThreshold ? "2-of-3 threshold" : "unknown structure"}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function PendingRow({
  row,
  isWalletOfficer,
  busy,
  onApprove,
  onDelete,
  onApproveWallet,
}: {
  row: PendingView;
  isWalletOfficer: boolean;
  busy: { approve: boolean; delete: boolean; wallet: boolean };
  onApprove: () => void;
  onDelete: () => void;
  onApproveWallet: () => void;
}) {
  return (
    <li
      data-schedule={row.scheduleId}
      className="approval-row flex flex-col gap-1 border border-base-300 rounded-lg p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <a href={hashscanSchedule(row.scheduleId)} target="_blank" rel="noreferrer" className="link text-xs font-mono">
          {row.scheduleId}
        </a>
        <span className="text-xs text-base-content/60">
          {row.signatureCount === "unknown"
            ? "signatures could not be read just now"
            : `${row.signatureCount} of 3 officers signed`}
        </span>
      </div>
      <p className="text-sm m-0">{row.actionLabel}</p>
      <p className="text-xs text-base-content/60 m-0">
        Case {row.reference} · expires {new Date(row.expiresAtMs).toLocaleTimeString()}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="approval-approve btn btn-xs btn-primary" disabled={busy.approve} onClick={onApprove}>
          {busy.approve && <span className="loading loading-spinner loading-xs" />}
          Approve as Officer 2
        </button>
        <button className="approval-delete btn btn-xs btn-ghost" disabled={busy.delete} onClick={onDelete}>
          {busy.delete && <span className="loading loading-spinner loading-xs" />}
          Delete
        </button>
        {isWalletOfficer && (
          <button
            id="approve-as-wallet"
            className="btn btn-xs btn-secondary"
            disabled={busy.wallet}
            onClick={onApproveWallet}
          >
            {busy.wallet && <span className="loading loading-spinner loading-xs" />}
            Approve as wallet
          </button>
        )}
      </div>
    </li>
  );
}

function PendingPanel({
  rows,
  isWalletOfficer,
  busy,
  onApprove,
  onDelete,
  onApproveWallet,
}: {
  rows: PendingView[];
  isWalletOfficer: boolean;
  busy: BusyMap;
  onApprove: (scheduleId: string) => void;
  onDelete: (scheduleId: string) => void;
  onApproveWallet: (scheduleId: string) => void;
}) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Pending approvals</h2>
        <p className="text-sm text-base-content/70 m-0">Orders Officer 1 proposed, waiting on a second signature.</p>
        <ul id="pending-approvals" className="flex flex-col gap-2">
          {rows.length === 0 && <li className="text-sm text-base-content/50">No pending orders.</li>}
          {rows.map(row => (
            <PendingRow
              key={row.scheduleId}
              row={row}
              isWalletOfficer={isWalletOfficer}
              busy={{
                approve: Boolean(busy[`approve-${row.scheduleId}`]),
                delete: Boolean(busy[`delete-${row.scheduleId}`]),
                wallet: Boolean(busy[`wallet-${row.scheduleId}`]),
              }}
              onApprove={() => onApprove(row.scheduleId)}
              onDelete={() => onDelete(row.scheduleId)}
              onApproveWallet={() => onApproveWallet(row.scheduleId)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function HistoryRow({ row }: { row: HistoryView }) {
  const href =
    row.linkKind === "schedule" ? hashscanSchedule(row.transactionId) : hashscanTransaction(row.transactionId);
  return (
    <li className="history-entry flex flex-col gap-0.5 border-b border-base-300 py-2 text-sm last:border-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-base-content/60">{new Date(row.timestampMs).toLocaleTimeString()}</span>
        <a href={href} target="_blank" rel="noreferrer" className="link text-xs font-mono">
          {row.transactionId}
        </a>
      </div>
      <p className="m-0">
        {row.action}
        {row.reference ? ` · ${row.reference}` : ""} —{" "}
        <span className={row.result === "SUCCESS" ? "text-success" : "text-error"}>{row.result}</span>
      </p>
    </li>
  );
}

function HistoryPanel({ rows }: { rows: HistoryView[] }) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">History</h2>
        <p className="text-sm text-base-content/70 m-0">What the desk has done, newest first.</p>
        <ul id="history" className="flex flex-col">
          {rows.length === 0 ? (
            <li className="text-sm text-base-content/50 py-2">Nothing yet.</li>
          ) : (
            rows.map(row => <HistoryRow key={row.id} row={row} />)
          )}
        </ul>
      </div>
    </div>
  );
}

function RightColumnPlaceholder() {
  return (
    <div className="card bg-base-100 border border-base-300 border-dashed shadow-sm">
      <div className="card-body gap-2">
        <h2 className="card-title text-lg">What the network will show</h2>
        <p className="text-sm text-base-content/70 m-0">
          Once the desk is set up, this column shows the token and its keys, pending approvals, and the desk&apos;s
          history — all read live from the mirror node.
        </p>
      </div>
    </div>
  );
}

export function SecurityDesk() {
  const desk = useSecurityDesk();
  const { state } = desk;

  if (!state) {
    return <p className="text-center text-base-content/60 py-10">Loading the desk…</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-6">
        <SetupPanel
          configured={state.config.configured}
          missing={state.config.missing}
          steps={desk.setupSteps}
          isSettingUp={desk.isSettingUp}
          onSetup={desk.runSetup}
        />
        <WalletStateCard wallet={state.wallet} />
        {state.holders.length > 0 && <HoldersPanel holders={state.holders} busy={desk.busy} onSend={desk.send} />}
        {state.token && (
          <OrderPanel holders={state.holders} busy={Boolean(desk.busy.propose)} onPropose={desk.propose} />
        )}
        {desk.message && <p className="text-sm text-base-content/70">{desk.message}</p>}
      </div>

      <div className="flex flex-col gap-6">
        {!state.token ? (
          <RightColumnPlaceholder />
        ) : (
          <>
            <TokenPanel token={state.token} />
            <PendingPanel
              rows={state.pending}
              isWalletOfficer={state.wallet.kind === "officer3"}
              busy={desk.busy}
              onApprove={desk.approve}
              onDelete={desk.remove}
              onApproveWallet={desk.approveAsWallet}
            />
            <HistoryPanel rows={state.history} />
          </>
        )}
      </div>
    </div>
  );
}
