"use client";

import type { ReactNode } from "react";
import type { TourResult } from "./useSecurityDesk";
import { hashscanContract, hashscanTransaction } from "~~/services/security/hashscan";
import type { DeskStateView, HolderView, PendingView } from "~~/services/security/types";

export function Label({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs uppercase tracking-wide text-base-content/60">{children}</p>;
}

/** The one card on a step that holds the next action. */
export function StepCard({
  step,
  total,
  who,
  title,
  children,
}: {
  step: number;
  total: number;
  who: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card bg-base-100 border-2 border-primary shadow-sm" aria-labelledby="step-title">
      <div className="card-body gap-4 p-6">
        <Label>
          Step {step} of {total} · {who}
        </Label>
        <h2 id="step-title" className="m-0 text-xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export function Panel({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4 p-5">
        <div>
          <h2 className="card-title text-lg m-0">{title}</h2>
          {caption ? <p className="m-0 text-sm text-base-content/70">{caption}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/** The exact network calls behind a step, one click away: the audience is developers. */
export function UnderTheHood({ title, code }: { title: string; code: string }) {
  return (
    <details className="rounded-box bg-[#11151d] text-[#f0f0f2] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Under the hood: {title}</summary>
      <pre className="m-0 mt-3 text-[12px] leading-relaxed whitespace-pre overflow-x-auto font-mono">{code}</pre>
    </details>
  );
}

export function Columns({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">{main}</div>
      <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">{aside}</aside>
    </div>
  );
}

export function TxLink({ hash, children = "View on HashScan" }: { hash: string; children?: ReactNode }) {
  return (
    <a className="link" href={hashscanTransaction(hash)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** A refusal beside the button that was pressed: the contract's error, or why the request did not run. */
export function Refusal({ id, result }: { id: string; result: TourResult | null }) {
  if (!result || result.ok) return null;
  return (
    <div id={id} role="alert" className="alert alert-error text-sm">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="font-mono">{result.result}</strong>
        {result.message ? ` — ${result.message}` : ""}
        {result.txHash ? (
          <>
            {" "}
            <TxLink hash={result.txHash} />
          </>
        ) : null}
      </span>
    </div>
  );
}

function Cross() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * An attack's result: refused in red, because the attack failed, which is the token holding. A request that could not
 * run at all is neither: it says why, in neutral colours, and does not count as a refusal.
 */
export function AttackOutcome({ id, result, meaning }: { id: string; result: TourResult | null; meaning: string }) {
  if (!result) return null;
  if (result.result === "Error")
    return (
      <div id={id} role="alert" className="alert text-sm">
        <span>
          <strong>Not run.</strong> {result.message}
        </span>
      </div>
    );
  if (result.ok)
    return (
      <div id={id} role="alert" className="alert alert-warning text-sm">
        <span>
          <strong>Accepted.</strong> The chain carried it out. Something is broken: the token&apos;s roles are not doing
          their job.
        </span>
      </div>
    );
  return (
    <div id={id} className="flex gap-2 items-start rounded-box border border-error bg-error/15 px-3 py-2">
      <span className="shrink-0 text-error">
        <Cross />
      </span>
      <span className="flex flex-col gap-0.5 text-xs min-w-0 [overflow-wrap:anywhere]">
        <strong className="text-sm">
          Refused · <span className="font-mono">{result.result}</span>
        </strong>
        <span>{meaning}</span>
        {result.txHash ? <TxLink hash={result.txHash}>The refused transaction on HashScan</TxLink> : null}
      </span>
    </div>
  );
}

const kyc = (holder: HolderView) =>
  holder.kyc === "GRANTED" ? "KYC" : holder.kyc === "NOT_GRANTED" ? "no KYC" : "KYC unknown";
const frozen = (holder: HolderView) =>
  holder.frozen === "FROZEN" ? "frozen" : holder.frozen === "NOT_FROZEN" ? null : "frozen unknown";

/**
 * What stays in view on every step once the desk exists: the token, whether it is paused, its supply, who holds its
 * compliance roles, and where each holder stands.
 */
export function TokenStrip({ state }: { state: DeskStateView }) {
  const token = state.token!;
  const boardHoldsAll =
    token.roles !== "unavailable" && token.roles.every(role => role.heldByBoard && !role.heldByAnyOfficer);
  return (
    <section id="token-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The token">
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <Label>
            Token · {token.symbol} ·{" "}
            {token.roles === "unavailable"
              ? "roles unavailable"
              : boardHoldsAll
                ? "KYC, freeze, controller and pause roles are the board's, and no officer's"
                : "an officer holds a compliance role"}
          </Label>
          <a
            href={hashscanContract(token.contractId)}
            target="_blank"
            rel="noreferrer"
            className="link link-primary font-mono text-xs"
          >
            {token.contractId}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center justify-between">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
            <span
              id="strip-status"
              className={`badge badge-lg ${token.status === "PAUSED" ? "badge-error" : token.status === "ACTIVE" ? "badge-success" : "badge-warning"}`}
            >
              {token.status}
            </span>
            <span className="text-xl font-bold">
              <span id="strip-supply">
                {/^\d+$/.test(token.supply) ? Number(token.supply).toLocaleString() : token.supply}
              </span>{" "}
              in supply
            </span>
            {state.pending.length > 0 ? (
              <span className="text-sm text-base-content/70">
                {state.pending.length} {state.pending.length === 1 ? "order" : "orders"} waiting for a second approval
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 items-center" aria-label="Holders">
            {state.holders.map(holder => (
              <span
                key={holder.id}
                className={`badge ${holder.frozen === "FROZEN" ? "badge-info" : holder.kyc === "GRANTED" ? "badge-success" : "badge-ghost"}`}
              >
                {holder.label} · {holder.balance} · {[kyc(holder), frozen(holder)].filter(Boolean).join(" · ")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Who has approved the order in hand. The board records which officers approved, not just how many, so this is read
 * rather than inferred.
 */
export function OfficersCard({ pending, wallet }: { pending: PendingView | null; wallet: DeskStateView["wallet"] }) {
  const count = pending?.approvals ?? 0;
  const approved = pending?.approvedBy ?? [];
  const officers = [
    { name: "Officer 1", note: "key held by this desk" },
    { name: "Officer 2", note: "key held by this desk" },
    {
      name: "Officer 3",
      note:
        wallet.kind === "officer3"
          ? `your wallet, ${wallet.accountId ?? wallet.address}`
          : "a demo key held by this desk",
    },
  ];
  return (
    <Panel
      title="Who has approved?"
      caption={
        pending === null
          ? "Nothing is waiting for an approval."
          : count === "unknown"
            ? "The board could not be read just now."
            : `${count} of 3 officers have approved. The board needs 2.`
      }
    >
      <div className="flex flex-col gap-2">
        {officers.map(officer => {
          const hasApproved = approved.includes(officer.name);
          return (
            <div
              key={officer.name}
              className={`rounded-box px-4 py-3 flex justify-between gap-2 flex-wrap ${hasApproved ? "bg-success/10 border border-success/40" : "bg-base-200"}`}
            >
              <span className="text-sm">
                <strong>{officer.name}</strong> · <span className="text-base-content/70">{officer.note}</span>
              </span>
              <span className="text-xs">{hasApproved ? "✓ approved" : "not approved"}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
