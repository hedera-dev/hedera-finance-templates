"use client";

import type { ReactNode } from "react";
import { formatUnits } from "viem";
import type { BondData } from "~~/hooks/coupons/useBond";
import type { DeskStateResponse } from "~~/hooks/coupons/useDeskState";
import { useMirrorAccount } from "~~/hooks/coupons/useMirrorAccount";
import type { Stablecoin } from "~~/services/coupons/state";

/** What an action in the tour came to: the network's verdict, or why it did not run (`result: "Error"`). */
export type TourResult = { ok: boolean; result: string; message: string; transaction: string | null };

const HASHSCAN = "https://hashscan.io/testnet";

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
      <aside className="flex-[1_1_360px] min-w-0 flex flex-col gap-4">{aside}</aside>
    </div>
  );
}

export function HashScan({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      href={`${HASHSCAN}/${path}`}
      target="_blank"
      rel="noreferrer"
      className="link normal-case [overflow-wrap:anywhere]"
    >
      {children}
    </a>
  );
}

/** A transaction by its EVM hash, which HashScan resolves like any other transaction id. */
export function TxLink({ hash, children }: { hash: string; children: ReactNode }) {
  return <HashScan path={`transaction/${hash}`}>{children}</HashScan>;
}

/** A spinner while a step's request runs. */
export function Busy({ on }: { on: boolean }) {
  return on ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null;
}

/** A failure beside the button that was pressed. */
export function Refusal({ id, result }: { id: string; result: TourResult | null | undefined }) {
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
 * An attack's result: refused in red, because the attack failed, which is the bond holding. A request that could not
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
          <strong>Accepted.</strong> The bond carried it out. Something is broken: the bond is not protecting its
          holders.
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
          Reverted · <span className="font-mono">{result.result}</span>
        </strong>
        <span>{meaning}</span>
        {result.transaction ? <TxLink hash={result.transaction}>The reverted transaction on HashScan</TxLink> : null}
      </span>
    </div>
  );
}

export const whole = (value: bigint, decimals: number) => Number(formatUnits(value, decimals)).toLocaleString();

/** A balance the reader is meant to watch move, so the number carries the weight, not the label. */
function Badge({ name, children, tone }: { name: string; children: ReactNode; tone?: string }) {
  return (
    <div className={`rounded-box px-3 py-2 flex flex-col gap-0.5 min-w-40 ${tone ?? "bg-base-200"}`}>
      <span className="text-xs uppercase tracking-wide text-base-content/60">{name}</span>
      <span className="text-base leading-tight">{children}</span>
    </div>
  );
}

/** The bond's own badge takes its colour from what the network is doing with it. */
const BOND_TONE: Record<string, string> = {
  RUNNING: "bg-primary/10 border border-primary/30",
  MATURED: "bg-success/10 border border-success/40",
  STOPPED: "bg-warning/10 border border-warning/40",
};

function InvestorBadge({
  name,
  evmAddress,
  stablecoin,
}: {
  name: string;
  evmAddress: `0x${string}`;
  stablecoin: Stablecoin;
}) {
  const { data } = useMirrorAccount(evmAddress, stablecoin.tokenId);
  return (
    <Badge name={name}>
      {data ? (
        <>
          <strong className="font-bold">{whole(data.tokenBalance, stablecoin.decimals)}</strong> {stablecoin.symbol}
        </>
      ) : (
        "reading…"
      )}
    </Badge>
  );
}

function BondBadge({ address, bond, stablecoin }: { address: `0x${string}`; bond?: BondData; stablecoin: Stablecoin }) {
  const { data } = useMirrorAccount(address, stablecoin.tokenId);
  return (
    <Badge name={`Bond · ${bond?.status ?? "reading…"}`} tone={BOND_TONE[bond?.status ?? ""] ?? "bg-base-200"}>
      {data ? <strong className="font-bold">{whole(data.tokenBalance, stablecoin.decimals)}</strong> : "…"}{" "}
      {stablecoin.symbol} ·{" "}
      {bond?.hbarBalance != null ? <strong className="font-bold">{whole(bond.hbarBalance, 18)}</strong> : "…"} HBAR
    </Badge>
  );
}

/** One id in the strip: the label stays quiet, the value is the thing to click. */
function StripId({ name, path, value }: { name: string; path: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <dt className="uppercase tracking-wide text-base-content/50">{name}</dt>
      <dd className="m-0 font-mono">
        <HashScan path={path}>{value}</HashScan>
      </dd>
    </div>
  );
}

/** What stays in view on every step once the desk exists: the stablecoin, the factory, and who holds what. */
export function DeskStrip({
  desk,
  bondAddress,
  bond,
}: {
  desk: DeskStateResponse;
  bondAddress?: `0x${string}`;
  bond?: BondData;
}) {
  const stablecoin = desk.stablecoin!;
  return (
    <section id="desk-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The desk">
      <div className="card-body flex-row flex-wrap gap-x-6 gap-y-3 items-center justify-between p-4">
        <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <StripId name="Stablecoin" path={`token/${stablecoin.tokenId}`} value={stablecoin.tokenId} />
          {desk.factory ? (
            <StripId
              name="Factory"
              path={`contract/${desk.factory.address}`}
              value={`${desk.factory.address.slice(0, 10)}…`}
            />
          ) : null}
          {bondAddress ? (
            <StripId name="Bond" path={`contract/${bondAddress}`} value={`${bondAddress.slice(0, 10)}…`} />
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2" aria-label="Balances">
          {desk.investors.map(investor => (
            <InvestorBadge
              key={investor.id}
              name={investor.label}
              evmAddress={investor.evmAddress}
              stablecoin={stablecoin}
            />
          ))}
          {bondAddress ? <BondBadge address={bondAddress} bond={bond} stablecoin={stablecoin} /> : null}
        </div>
      </div>
    </section>
  );
}
