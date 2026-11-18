"use client";

import type { ReactNode } from "react";
import { HashScanLink } from "./HashScanLink";
import type { MarketSnapshot, PartySnapshot, TradeSnapshot } from "~~/services/hedera/types";

/** What an action in the tour came to: the network's code, or why it did not run (`result: "Error"`). */
export type TourResult = { ok: boolean; result: string; message: string; transaction: string | null };

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

/** `wideAside` makes room for a form in the side column. */
export function Columns({ main, aside, wideAside }: { main: ReactNode; aside: ReactNode; wideAside?: boolean }) {
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">{main}</div>
      <aside className={`${wideAside ? "flex-[1_1_448px]" : "flex-[1_1_320px]"} min-w-0 flex flex-col gap-4`}>
        {aside}
      </aside>
    </div>
  );
}

export function TxLink({ transaction, children }: { transaction: string; children: string }) {
  return <HashScanLink hederaId={transaction} kind="transaction" label={children} />;
}

/** A failure beside the button that was pressed. */
export function Refusal({ id, result }: { id: string; result: TourResult | null }) {
  if (!result || result.ok) return null;
  return (
    <div id={id} role="alert" className="alert alert-error text-sm">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {result.result === "Error" ? result.message : <strong className="font-mono">{result.result}</strong>}
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
 * An attack's result: refused in red, because the attack failed, which is settlement holding. A request that could
 * not run at all is neither: it says why, in neutral colours, and does not count as a refusal.
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
          <strong>Accepted.</strong> The network carried it out. Something is broken: settlement is not protecting the
          parties.
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
        {result.transaction ? (
          <TxLink transaction={result.transaction}>The refused transaction on HashScan</TxLink>
        ) : null}
      </span>
    </div>
  );
}

const number = (value: string) => Number(value).toLocaleString();

function PartyBadge({ name, party, note }: { name: string; party: PartySnapshot; note?: string }) {
  return (
    <div className="rounded-box bg-base-200 px-3 py-2 flex flex-col gap-0.5 min-w-44">
      <div className="flex gap-2 items-baseline justify-between">
        <strong className="text-sm">{name}</strong>
        {note ? <span className="badge badge-warning badge-sm">{note}</span> : null}
      </div>
      <span className="text-sm">
        <strong>{number(party.balances.security)}</strong> security · <strong>{number(party.balances.payment)}</strong>{" "}
        stablecoin
      </span>
    </div>
  );
}

/** What stays in view on every step once the market exists: the tokens, and where each party stands. */
export function MarketStrip({ market }: { market: MarketSnapshot }) {
  return (
    <section id="market-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The market">
      <div className="card-body flex-row flex-wrap gap-x-6 gap-y-2 items-center justify-between p-3">
        <div className="flex flex-col gap-1 text-xs uppercase tracking-wide text-base-content/60">
          <span>
            Security <HashScanLink hederaId={market.securityTokenId} kind="token" />
          </span>
          <span>
            Stablecoin <HashScanLink hederaId={market.paymentTokenId} kind="token" />
          </span>
          {market.auditTopicId ? (
            <span>
              Audit topic <HashScanLink hederaId={market.auditTopicId} kind="topic" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Balances">
          <PartyBadge name="Seller" party={market.seller} />
          <PartyBadge name="Buyer" party={market.buyer} />
          <PartyBadge name="Unverified Buyer" party={market.unverifiedBuyer} note="no KYC" />
          {market.walletSeller ? <PartyBadge name="Wallet (Seller)" party={market.walletSeller} /> : null}
          {market.walletBuyer ? <PartyBadge name="Wallet (Buyer)" party={market.walletBuyer} /> : null}
        </div>
      </div>
    </section>
  );
}

/** Both legs of a trade, and which of the two signatures the schedule holds. */
export function SignaturesCard({
  trade,
  quantity,
  price,
}: {
  trade: TradeSnapshot | null;
  quantity: number;
  price: number;
}) {
  const rows = [
    { who: "Seller", signed: trade !== null, gives: `${quantity.toLocaleString()} security` },
    { who: "Buyer", signed: false, gives: `${price.toLocaleString()} stablecoin` },
  ];
  return (
    <Panel title="Who has signed?" caption="One transaction, two legs. It runs when both parties have signed.">
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {rows.map(row => (
          <li
            key={row.who}
            className={`rounded-box px-4 py-3 flex justify-between gap-2 ${row.signed ? "bg-success/10 border border-success/40" : "bg-base-200"}`}
          >
            <span className="flex flex-col">
              <strong className="text-sm">{row.who}</strong>
              <span className="text-xs text-base-content/70">gives {row.gives}</span>
            </span>
            <span className={`text-sm ${row.signed ? "text-success font-semibold" : "text-base-content/60"}`}>
              {row.signed ? "✓ Signed" : "Not yet"}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-base-content/70">
        {trade ? (
          <>
            Schedule <HashScanLink hederaId={trade.scheduleId} kind="schedule" /> expires at{" "}
            {new Date(trade.expiresAt).toLocaleTimeString()} if the Buyer does not sign.
          </>
        ) : (
          "No schedule yet: the Seller's proposal creates it."
        )}
      </p>
    </Panel>
  );
}
