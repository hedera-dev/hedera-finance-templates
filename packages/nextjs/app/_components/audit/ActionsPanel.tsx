"use client";

import { useEffect, useState } from "react";
import type { TokenAction } from "~~/services/hcsAudit/types";

type ActionsPanelProps = {
  disabled: boolean;
  busyAction: TokenAction | null;
  actionError: string | null;
  /** The demo holder: the default target, and what an empty target field falls back to. */
  holderAccountId: string | null;
  onAction: (action: TokenAction, amount?: number, account?: string) => void;
};

/**
 * One real token action per button, applied to the target account and logged to the trail.
 * The target defaults to the demo holder; any testnet account works once it has associated the
 * token, and a refusal (e.g. TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) is logged like any other result.
 */
export const ActionsPanel = ({ disabled, busyAction, actionError, holderAccountId, onAction }: ActionsPanelProps) => {
  const [amount, setAmount] = useState("100");
  const [target, setTarget] = useState(holderAccountId ?? "");

  // A fresh setup brings a new demo holder: follow it.
  useEffect(() => setTarget(holderAccountId ?? ""), [holderAccountId]);

  const anyBusy = busyAction !== null;
  const off = disabled || anyBusy;
  const account = target.trim() || undefined;
  const run = (action: TokenAction, value?: number) => onAction(action, value, account);

  const actionButton = (id: string, action: TokenAction, label: string, busyLabel: string) => (
    <button id={id} className="btn btn-sm btn-outline" disabled={off} onClick={() => run(action)}>
      {busyAction === action && <span className="loading loading-spinner loading-xs" />}
      {busyAction === action ? busyLabel : label}
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
            {busyAction === "transfer" && <span className="loading loading-spinner loading-xs" />}
            {busyAction === "transfer" ? "Transferring…" : "Transfer"}
          </button>
        </div>
      </div>

      {actionError && <span className="text-sm text-error">{actionError}</span>}
    </div>
  );
};
