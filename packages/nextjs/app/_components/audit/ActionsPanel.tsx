"use client";

import { useEffect, useState } from "react";
import { DocumentHashField } from "~~/app/_components/audit/DocumentHashField";
import { type BusyRecord, MAX_REASON_LENGTH, type RecordPayload, type TokenAction } from "~~/services/hcsAudit/types";

type ActionsPanelProps = {
  disabled: boolean;
  busyRecord: BusyRecord | null;
  actionError: string | null;
  /** The demo holder: the default target, and what an empty target field falls back to. */
  holderAccountId: string | null;
  onRecord: (payload: RecordPayload) => void;
};

/**
 * One real token action per button, applied to the target account and logged to the trail.
 * The target defaults to the demo holder; any testnet account works once it has associated the
 * token, and a refusal (e.g. TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) is logged like any other result.
 *
 * Reason, authority and a supporting document are optional here and required for a
 * decision: a freeze is already on the ledger, so the entry only has to add why it
 * was done and under whose instruction.
 */
export const ActionsPanel = ({ disabled, busyRecord, actionError, holderAccountId, onRecord }: ActionsPanelProps) => {
  const [amount, setAmount] = useState("100");
  const [target, setTarget] = useState(holderAccountId ?? "");
  const [reason, setReason] = useState("");
  const [authority, setAuthority] = useState("");
  const [evidence, setEvidence] = useState<string | null>(null);

  // A fresh setup brings a new demo holder: follow it.
  useEffect(() => setTarget(holderAccountId ?? ""), [holderAccountId]);

  const anyBusy = busyRecord !== null;
  const off = disabled || anyBusy;

  const run = (action: TokenAction, value?: number) =>
    onRecord({
      kind: "action",
      action,
      amount: value,
      account: target.trim() || undefined,
      reason: reason.trim() || undefined,
      authority: authority.trim() || undefined,
      evidence: evidence ?? undefined,
    });

  const actionButton = (id: string, action: TokenAction, label: string, busyLabel: string) => (
    <button id={id} className="btn btn-sm btn-outline" disabled={off} onClick={() => run(action)}>
      {busyRecord === action && <span className="loading loading-spinner loading-xs" />}
      {busyRecord === action ? busyLabel : label}
    </button>
  );

  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col gap-4">
      <h3 className="font-bold text-lg m-0">Token actions</h3>

      <div className="flex flex-col gap-1">
        <label htmlFor="action-account" className="text-sm text-base-content/70">
          Target account
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="action-account"
            className="input input-sm input-bordered w-48 font-mono"
            placeholder="0.0.1234"
            value={target}
            onChange={e => setTarget(e.target.value)}
            disabled={anyBusy}
          />
          {holderAccountId && target.trim() !== holderAccountId && (
            <button className="btn btn-xs btn-ghost" onClick={() => setTarget(holderAccountId)} disabled={anyBusy}>
              Use demo holder
            </button>
          )}
        </div>
        <span className="text-xs text-base-content/60">
          Defaults to the demo holder. Any testnet account works once it has associated the token; otherwise the network
          refuses the action, and that refusal is logged too.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="action-reason" className="text-sm text-base-content/70">
          Reason <span className="text-base-content/50">(optional)</span>
        </label>
        <input
          id="action-reason"
          className="input input-sm input-bordered w-full max-w-md"
          placeholder="Case CMP-2026-114: court order received"
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={anyBusy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="action-authority" className="text-sm text-base-content/70">
          Authority <span className="text-base-content/50">(optional)</span>
        </label>
        <input
          id="action-authority"
          className="input input-sm input-bordered w-48 font-mono"
          placeholder="0.0.1234"
          value={authority}
          onChange={e => setAuthority(e.target.value)}
          disabled={anyBusy}
        />
        <span className="text-xs text-base-content/60">
          The account that authorised this, if it was not the publisher. Recorded as the publisher&apos;s claim: the
          topic&apos;s submit key proves who wrote the entry, not that this account agreed to it.
        </span>
      </div>

      <DocumentHashField
        id="action-evidence"
        label="Supporting document (optional)"
        hint="Hashed in your browser. Only the hash is published; the file never leaves this page."
        disabled={anyBusy}
        hash={evidence}
        onHash={setEvidence}
      />

      <div className="flex flex-wrap gap-2">
        {actionButton("action-grant-kyc", "grant_kyc", "Grant KYC", "Granting KYC…")}
        {actionButton("action-freeze", "freeze", "Freeze holder", "Freezing…")}
        {actionButton("action-unfreeze", "unfreeze", "Unfreeze holder", "Unfreezing…")}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transfer-amount" className="text-sm text-base-content/70">
          Transfer amount
        </label>
        <div className="flex items-center gap-2">
          <input
            id="transfer-amount"
            type="number"
            min={1}
            step={1}
            className="input input-sm input-bordered w-28"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={anyBusy}
          />
          <button
            id="action-transfer"
            className="btn btn-sm btn-outline"
            disabled={off}
            onClick={() => run("transfer", Number(amount))}
          >
            {busyRecord === "transfer" && <span className="loading loading-spinner loading-xs" />}
            {busyRecord === "transfer" ? "Transferring…" : "Transfer"}
          </button>
        </div>
      </div>

      {actionError && <span className="text-sm text-error">{actionError}</span>}
    </div>
  );
};
