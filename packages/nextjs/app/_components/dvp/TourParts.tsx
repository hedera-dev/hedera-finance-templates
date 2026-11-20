"use client";

import type { ReactNode } from "react";
import type { DeskResult } from "./useDesk";
import type { AttackResult } from "~~/services/dvp/attacks";
import { hashscanContract, hashscanTransaction } from "~~/services/dvp/hashscan";
import type { DeskView, PartyView, TradeView } from "~~/services/dvp/types";

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

/** The exact calls behind a step, one click away: the audience is developers. */
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
export function Refusal({ id, result }: { id: string; result: DeskResult | null }) {
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
 * An attack's result: refused in red, because the attack failed, which is the desk holding. A request that could not
 * run at all is neither: it says why, in neutral colours, and does not count as a refusal.
 */
export function AttackOutcome({ id, result, meaning }: { id: string; result: AttackResult | null; meaning: string }) {
  if (!result) return null;
  if (result.outcome === "blocked")
    return (
      <div id={id} role="alert" className="alert text-sm">
        <span>
          <strong>Not run.</strong> {result.blocked ?? "It could not be tried just now."}
        </span>
      </div>
    );
  if (result.outcome === "accepted")
    return (
      <div id={id} role="alert" className="alert alert-warning text-sm">
        <span>
          <strong>Accepted.</strong> The chain carried it out. Something is broken: this desk is not doing its job.
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
          Refused · <span className="font-mono">{result.errorName ?? "Reverted"}</span>
        </strong>
        <span>{meaning}</span>
        {result.txHash ? <TxLink hash={result.txHash}>The refused transaction on HashScan</TxLink> : null}
      </span>
    </div>
  );
}

const amount = (value: string) => (value === "unavailable" ? "?" : value);

function PartyBadge({ party }: { party: PartyView }) {
  const held = party.securityHeld !== "unavailable" && party.securityHeld !== "0";
  const cashHeld = party.cashHeld !== "unavailable" && party.cashHeld !== "0";
  return (
    <span
      className={`badge badge-lg py-3 h-auto ${party.kyc === false ? "badge-warning" : held || cashHeld ? "badge-info" : "badge-ghost"}`}
      data-party-badge={party.id}
    >
      <span className="flex flex-col items-start leading-tight">
        <span className="font-semibold">
          {party.label}
          {party.kyc === false ? " · no KYC" : ""}
        </span>
        <span className="text-[11px]">
          {amount(party.securityFree)} security{held ? ` (+${amount(party.securityHeld)} held)` : ""} ·{" "}
          {amount(party.cashFree)} cash{cashHeld ? ` (+${amount(party.cashHeld)} held)` : ""}
        </span>
      </span>
    </span>
  );
}

/**
 * What stays in view on every step once the market exists: the three contracts, and where each
 * party stands — free and held, which is the whole point of pledging in place.
 */
export function MarketStrip({ state }: { state: DeskView }) {
  const { security, cash, settlement } = state.market;
  return (
    <section id="market-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The market">
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center justify-between">
          <Label>Security · cash · settlement contract</Label>
          <span className="flex flex-wrap gap-3 font-mono text-xs">
            {security && (
              <a
                id="strip-security"
                className="link link-primary"
                href={hashscanContract(security.contractId)}
                target="_blank"
                rel="noreferrer"
              >
                {security.contractId}
              </a>
            )}
            {cash && (
              <a
                id="strip-cash"
                className="link link-primary"
                href={`https://hashscan.io/testnet/token/${cash.tokenId}`}
                target="_blank"
                rel="noreferrer"
              >
                {cash.tokenId}
              </a>
            )}
            {settlement && (
              <a
                id="strip-settlement"
                className="link link-primary"
                href={hashscanContract(settlement.contractId)}
                target="_blank"
                rel="noreferrer"
              >
                {settlement.contractId}
              </a>
            )}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          {state.parties.map(party => (
            <PartyBadge key={party.id} party={party} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** What is pledged on the trade in hand, and which leg is still missing. */
export function PledgeCard({ trade, state }: { trade: TradeView | null; state: DeskView }) {
  if (!trade) {
    return (
      <Panel title="What is pledged?" caption="Nothing yet: propose a trade and each side pledges its own leg.">
        <p className="m-0 text-sm text-base-content/70">
          A pledge is a hold: the settlement contract becomes the only address that can move those units, and only to
          the counterparty the owner named. The security stays in the Seller&apos;s own account; the cash moves into the
          stablecoin&apos;s custody, because HTS cannot encumber units in place. Neither counterparty has received
          anything.
        </p>
      </Panel>
    );
  }
  const seller = state.parties.find(p => p.id === trade.seller);
  const buyer = state.parties.find(p => p.id === trade.buyer);
  const legs = [
    {
      what: `${trade.quantity} security`,
      from: seller?.label ?? "Seller",
      to: buyer?.label ?? "Buyer",
      pledged: trade.securityPledged,
    },
    {
      what: `${trade.price} cash`,
      from: buyer?.label ?? "Buyer",
      to: seller?.label ?? "Seller",
      pledged: trade.cashPledged,
    },
  ];
  return (
    <Panel
      title="What is pledged?"
      caption={
        trade.securityPledged && trade.cashPledged
          ? "Both legs are committed. Settlement can deliver them together."
          : "One leg is still missing. Until both are in, settlement is refused."
      }
    >
      <div id="pledge-card" className="flex flex-col gap-2">
        {legs.map(leg => (
          <div
            key={leg.what}
            className={`rounded-box px-4 py-3 flex justify-between gap-2 flex-wrap ${leg.pledged ? "bg-success/10 border border-success/40" : "bg-base-200"}`}
          >
            <span className="text-sm">
              <strong>{leg.what}</strong> ·{" "}
              <span className="text-base-content/70">
                {leg.from} → {leg.to}
              </span>
            </span>
            <span className="text-xs">{leg.pledged ? "✓ held for the trade" : "not pledged"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
