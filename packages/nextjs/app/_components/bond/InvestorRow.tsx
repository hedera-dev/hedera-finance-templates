"use client";

import { useState } from "react";
import { formatNumber } from "./formatters";
import type { InvestorView } from "~~/types/ats";
import { hashscanAccountUrl } from "~~/utils/ats/hashscan";

type Props = {
  investor: InvestorView;
  busy: boolean;
  onApprove: () => void;
  onRevoke: () => void;
  onIssue: (amount: number) => void;
};

export const InvestorRow = ({ investor, busy, onApprove, onRevoke, onIssue }: Props) => {
  const [amount, setAmount] = useState("100");

  return (
    <li
      className="investor-row flex flex-col gap-2 p-3 rounded-lg border border-base-300"
      data-address={investor.address}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{investor.label}</span>{" "}
          <span
            className={
              investor.approved === null
                ? "badge badge-warning badge-sm"
                : investor.approved
                  ? "badge badge-success badge-sm"
                  : "badge badge-ghost badge-sm"
            }
          >
            {investor.approved === null ? "Unknown" : investor.approved ? "Approved" : "Not approved"}
          </span>
        </div>
        <span className="text-sm text-base-content/70">Balance: {formatNumber(investor.balance)}</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-base-content/60">
        {investor.hederaAccountId ? (
          <a
            href={hashscanAccountUrl(investor.hederaAccountId)}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            {investor.hederaAccountId}
          </a>
        ) : null}
        <span className="break-all">{investor.address}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="btn btn-sm btn-outline investor-approve"
          disabled={investor.approved === true || busy}
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline investor-revoke"
          disabled={investor.approved === false || busy}
          onClick={onRevoke}
        >
          Revoke
        </button>

        <input
          type="number"
          min={1}
          step={1}
          className="input input-bordered input-sm w-24 investor-amount"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          disabled={busy}
          aria-label={`Amount to issue to ${investor.label}`}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary investor-issue"
          disabled={busy}
          onClick={() => onIssue(Number(amount))}
        >
          Issue
        </button>
      </div>
    </li>
  );
};
