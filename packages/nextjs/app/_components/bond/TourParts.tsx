"use client";

import type { ReactNode } from "react";
import { formatDate, formatNumber, shortAddress } from "./formatters";
import type { ActionResult, BondTerms, InvestorView } from "~~/types/ats";
import { hashscanContractUrl, hashscanTxUrl } from "~~/utils/ats/hashscan";

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

/** The exact contract call behind a step, one click away: the audience is developers. */
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

export function HashScanTx({ hash, children = "View on HashScan" }: { hash: string; children?: ReactNode }) {
  return (
    <a className="link" href={hashscanTxUrl(hash)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** A refusal beside the button that was pressed, with the decoded error in front. */
export function Refusal({ id, result }: { id: string; result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <div id={id} role="alert" className="alert alert-error text-sm">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="font-mono">{result.result}</strong>
        {result.message && result.message !== result.result ? ` — ${explain(result)}` : ""}
        {result.txHash ? (
          <>
            {" "}
            <HashScanTx hash={result.txHash} />
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

/** The refusal's sentence without the error name in front of it, which the line above already shows. */
function explain(result: ActionResult, meaning?: string): string {
  const message = result.message.startsWith(`${result.result}(`) ? "" : result.message;
  const sentence = message === result.result || message === "" ? (meaning ?? message) : message;
  const short = sentence.replace(/0x[0-9a-fA-F]{40}/g, address => shortAddress(address));
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * An attack's result: refused in red, because the attack failed, which is the allowlist holding. A request that could
 * not run at all is neither: it says why, in neutral colours, and does not count as a refusal.
 */
export function AttackOutcome({ id, result, meaning }: { id: string; result: ActionResult | null; meaning: string }) {
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
          <strong>Accepted.</strong> {result.message} Something is broken: the allowlist is not doing its job.
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
        <span>{explain(result, meaning)}</span>
        {result.txHash ? <HashScanTx hash={result.txHash}>The refused transaction on HashScan</HashScanTx> : null}
      </span>
    </div>
  );
}

/**
 * What stays in view on every step once the bond exists: how much of it is out, when it matures, and who the
 * allowlist lets hold it.
 */
export function BondStrip({ bond, investors }: { bond: BondTerms; investors: InvestorView[] }) {
  const issued = bond.totalSupply;
  return (
    <section id="bond-strip" className="card bg-base-100 border border-base-300 shadow-sm" aria-label="The bond">
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <Label>
            Bond · {bond.symbol} · {bond.isin} · {formatNumber(bond.faceValue)} {bond.currency} face
          </Label>
          <a
            href={hashscanContractUrl(bond.contractId)}
            target="_blank"
            rel="noreferrer"
            className="link link-primary font-mono text-xs"
          >
            {bond.contractId}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-baseline justify-between">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
            <span className="text-xl font-bold">
              <span id="strip-issued">{formatNumber(issued)}</span> of {formatNumber(bond.maxSupply)} issued
            </span>
            <span className="text-sm text-base-content/70">matures {formatDate(bond.maturityDateIso)}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center" aria-label="Allowlist">
            <span className="text-xs uppercase tracking-wide text-base-content/60">Allowlist</span>
            {investors.map(investor => (
              <span
                key={investor.address}
                className={`badge ${investor.approved ? "badge-success" : investor.approved === null ? "badge-warning" : "badge-ghost"}`}
              >
                {investor.approved ? "✓" : investor.approved === null ? "?" : "✕"} {investor.label}
              </span>
            ))}
          </div>
        </div>
        <progress
          className="progress progress-primary h-2"
          value={issued === null ? 0 : (issued / bond.maxSupply) * 100}
          max={100}
        />
      </div>
    </section>
  );
}

/** One picture for the allowlist: every investor, whether the bond lets them hold it, and what they hold. */
export function HoldersCard({ investors, caption }: { investors: InvestorView[]; caption: string }) {
  return (
    <Panel title="Who holds the bond?" caption={caption}>
      <div className="flex flex-col gap-3">
        {investors.map(investor => (
          <div
            key={investor.address}
            className={`rounded-box p-4 flex flex-col gap-1 ${investor.approved ? "bg-success/10 border border-success/40" : "bg-base-200"}`}
          >
            <div className="flex justify-between gap-2 flex-wrap">
              <strong className="text-sm">{investor.label}</strong>
              <span className="font-mono text-xs text-base-content/70">{shortAddress(investor.address)}</span>
            </div>
            <div className="flex justify-between gap-2 flex-wrap items-baseline">
              <span className="text-2xl font-bold">
                {formatNumber(investor.balance)}{" "}
                <span className="text-sm font-normal">{investor.balance === 1 ? "bond" : "bonds"}</span>
              </span>
              <span className="text-xs">
                {investor.approved === null
                  ? "Allowlist unknown"
                  : investor.approved
                    ? "On the allowlist: may hold and receive"
                    : "Not on the allowlist: the bond refuses to send it any"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
