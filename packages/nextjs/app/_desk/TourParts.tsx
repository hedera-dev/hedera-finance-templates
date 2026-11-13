"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Outcome } from "./ControlCards";
import { ActivityList } from "./DeskCards";
import { DASH, show } from "./ui";
import { DEMO_BILL_DAYS, SECONDS_PER_DAY } from "~~/services/repo/constants";
import type { ActionResult, ActivityEntry, DeskView } from "~~/types/repo";

/** `$9,600` or `$9,603.84` from the snapshot's plain cash strings. */
export function usd(plain: string | null | undefined): string {
  if (plain === null || plain === undefined || plain === "") return DASH;
  const [whole, cents] = plain.split(".");
  return `$${Number(whole).toLocaleString("en-US")}${cents ? `.${cents}` : ""}`;
}

export const percent = (text: string | null) => (text === null ? null : Number.parseFloat(text));

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function Label({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs uppercase tracking-wide text-base-content/60">{children}</p>;
}

/** The one card on a step that holds the next action. */
export function StepCard({
  step,
  who,
  title,
  children,
}: {
  step: number;
  who: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card bg-base-100 border-2 border-primary shadow-sm" aria-labelledby="step-title">
      <div className="card-body gap-4 p-6">
        <Label>
          Step {step} of 6 · {who}
        </Label>
        <h2 id="step-title" className="m-0 text-xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export function Panel({
  title,
  caption,
  aside,
  children,
}: {
  title: string;
  caption?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4 p-5">
        <div className="flex flex-wrap gap-2 items-start justify-between">
          <div>
            <h2 className="card-title text-lg m-0">{title}</h2>
            {caption ? <p className="m-0 text-sm text-base-content/70">{caption}</p> : null}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

/** A short explanation that stays out of the way until asked for. */
export function Why({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer link link-primary w-fit">{label}</summary>
      <div className="mt-2 text-base-content/80 flex flex-col gap-2">{children}</div>
    </details>
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

const MIN = 94;
const MAX = 100;
const at = (value: number) => `${((Math.min(Math.max(value, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`;

/** Loan-to-value on a 94–100% scale, so the two lines that matter, 98% and 99%, are far enough apart to see. */
export function LtvBar({ ltv, loanOpen }: { ltv: string | null; loanOpen: boolean }) {
  const value = percent(ltv);
  const label =
    value === null
      ? loanOpen
        ? "Loan to value unavailable: the price cannot be stood behind"
        : "No loan yet"
      : `Loan to value ${ltv}${value >= 99 ? ", at or above the 99% liquidation line" : value > 98 ? ", above the 98% borrowing limit" : ""}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-10" role="img" aria-label={label}>
        <div className="absolute inset-x-0 top-2 h-6 rounded-full overflow-hidden flex">
          <div className="bg-success/50" style={{ width: at(98) }} />
          <div className="bg-warning/70" style={{ width: `calc(${at(99)} - ${at(98)})` }} />
          <div className="bg-error/70 grow" />
        </div>
        {[98, 99].map(mark => (
          <div key={mark} className="absolute top-0 h-10 w-px bg-base-content/50" style={{ left: at(mark) }} />
        ))}
        {value !== null ? (
          <div
            className="absolute top-0 h-10 w-1.5 -ml-[3px] rounded-full bg-base-content ring-2 ring-base-100"
            style={{ left: at(value) }}
          />
        ) : null}
        {value === null ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="badge badge-neutral">{loanOpen ? "Price unavailable" : "No loan yet"}</span>
          </div>
        ) : null}
      </div>
      <div className="relative h-5 text-xs text-base-content/70">
        <span className="absolute left-0">{MIN}%</span>
        <span className="absolute -translate-x-full pr-2 whitespace-nowrap" style={{ left: at(98) }}>
          98% max to open
        </span>
        <span className="absolute right-0 whitespace-nowrap">99% liquidation</span>
      </div>
    </div>
  );
}

function Lock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Tiles({ locked, free }: { locked: number; free: number }) {
  // A wallet borrower can hold any number; past twenty tiles the count says it better than the picture.
  const shown = Math.min(locked + free, 20);
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden>
      {Array.from({ length: shown }, (_, index) =>
        index < locked ? (
          <div
            key={index}
            className="w-7 h-9 rounded-md border-2 border-primary bg-primary/10 text-primary flex items-center justify-center"
          >
            <Lock />
          </div>
        ) : (
          <div
            key={index}
            className="w-7 h-9 rounded-md border border-base-300 bg-base-100 text-[8px] font-semibold text-base-content/60 flex items-center justify-center"
          >
            BILL
          </div>
        ),
      )}
    </div>
  );
}

const count = (text: string | null | undefined) => {
  const value = Number(text);
  return text === null || text === undefined || !Number.isFinite(value) ? 0 : value;
};

/** One picture for the pledge: the same bills, in the borrower's wallet, with or without a padlock. */
export function BillsCard({ desk, caption }: { desk: DeskView; caption: string }) {
  const p = desk.position;
  const locked = count(p.pledged);
  const free = count(p.free);
  const lenderBills = count(desk.cash.lenderBills);
  const e = desk.encumbrance;
  return (
    <Panel title="Where are the bills?" caption={caption}>
      <div className="flex flex-wrap gap-4">
        <div className="flex-[2_1_320px] rounded-box bg-base-200 p-4 flex flex-col gap-2">
          <div className="flex justify-between gap-2 flex-wrap">
            <strong className="text-sm">
              {desk.borrower.kind === "wallet" ? "Borrower (your wallet)" : "Borrower"}
            </strong>
            <span className="font-mono text-xs text-base-content/70">{shortAddress(desk.borrower.address)}</span>
          </div>
          <Tiles locked={locked} free={free} />
          <span className="text-sm">
            <strong>
              <span id="collateral-pledged">{show(p.pledged)}</span> locked ·{" "}
              <span id="collateral-free">{show(p.free)}</span> free.
            </strong>{" "}
            {locked > 0
              ? "Locked bills stay in this wallet. Only the repo contract can move them, and only to the lender."
              : "Free bills can be sold or sent like any token."}
          </span>
          <span className="text-sm text-base-content/70">
            <span id="borrower-cash">{usd(desk.cash.borrowerCash)}</span> stablecoin
          </span>
        </div>
        <div className="flex-[1_1_180px] rounded-box bg-base-200 px-4 py-3 flex flex-col gap-2">
          <div className="flex justify-between gap-2 flex-wrap text-sm">
            <span>
              <strong>Lender</strong> · {show(desk.cash.lenderBills)} bills ·{" "}
              <span id="lender-cash">{usd(desk.cash.lenderCash)}</span> stablecoin
            </span>
            <span className="font-mono text-xs text-base-content/70">{shortAddress(desk.operator)}</span>
          </div>
          {lenderBills > 0 ? <Tiles locked={0} free={lenderBills} /> : null}
        </div>
      </div>
      {locked > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="badge badge-outline">Escrow: repo contract</span>
          <span className="badge badge-outline">
            Destination:{" "}
            {e.holdDestination?.toLowerCase() === desk.operator.toLowerCase() ? "lender" : show(e.holdDestination)}
          </span>
        </div>
      ) : null}
    </Panel>
  );
}

const DAY_MS = Number(SECONDS_PER_DAY) * 1000;

/** Real time, once a second: the clocks count down between reads instead of jumping every few seconds. */
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const minutes = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function Clock({
  id,
  label,
  tone,
  headline,
  detail,
  elapsed,
  action,
  children,
}: {
  id: string;
  label: string;
  tone: "neutral" | "success" | "warning" | "error";
  headline: ReactNode;
  detail: ReactNode;
  /** Share of the clock already run, 0 to 1, or `null` for no bar. */
  elapsed: number | null;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const bar = {
    neutral: "progress",
    success: "progress-success",
    warning: "progress-warning",
    error: "progress-error",
  };
  return (
    <section id={id} className="card bg-base-100 border border-base-300 shadow-sm" aria-label={label}>
      <div className="card-body gap-2 p-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <Label>{label}</Label>
          {action}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
          <span className="text-xl font-bold">{headline}</span>
          <span className="text-sm text-base-content/70">{detail}</span>
        </div>
        {elapsed !== null ? (
          <progress className={`progress ${bar[tone]} h-2`} value={Math.min(Math.max(elapsed, 0), 1) * 100} max={100} />
        ) : null}
        {children}
      </div>
    </section>
  );
}

/**
 * The two clocks that decide what the bill is worth and when the loan can be taken: the bill counting down to
 * maturity, and the loan counting down to the end of its term, when anyone may liquidate whatever the price.
 */
export function Clocks({
  desk,
  busy,
  restart,
}: {
  desk: DeskView;
  busy: string | null;
  restart: { onClick: () => void; result: ActionResult | null };
}) {
  const now = useNow();
  const { bill } = desk;
  const p = desk.position;

  const billLeft = bill.maturesAtMs === null ? null : bill.maturesAtMs - now;
  const matured = billLeft !== null && billLeft <= 0;
  const termLeft = p.loanOpen && p.termEndsMs !== null ? p.termEndsMs - now : null;
  const termOver = p.termElapsed || (termLeft !== null && termLeft <= 0);
  const termTone = termOver ? "error" : termLeft !== null && termLeft < 5 * DAY_MS ? "warning" : "success";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Clock
        id="bill-clock"
        label={`T-bill · ${bill.terms?.symbol ?? "TBILL13"} · pays $1,000 at maturity`}
        tone={matured ? "warning" : "neutral"}
        headline={
          <>
            <span id="bill-days-remaining">{show(bill.daysRemaining)}</span> days to maturity
          </>
        }
        detail={
          <>
            {matured
              ? "Matured: it prices at $1,000 whatever the rate, so a shock does nothing."
              : billLeft === null
                ? "Maturity unavailable"
                : `${minutes(billLeft)} real time`}
            {" · "}price <strong id="bill-price">{show(bill.price, "unavailable")}</strong>
            {" · "}rate{" "}
            <strong id="bill-discount-rate">
              {bill.discountRateBps === null ? DASH : `${bill.discountRateBps} bp`}
            </strong>
          </>
        }
        elapsed={billLeft === null ? null : 1 - billLeft / (DEMO_BILL_DAYS * DAY_MS)}
        action={
          <div className="flex gap-3 items-center">
            <span
              tabIndex={0}
              className="tooltip tooltip-bottom before:max-w-80 before:text-left text-sm link link-primary"
              data-tip={`A T-bill pays no coupon: it sells below face and pays $1,000 at maturity, priced as face × (1 − rate × days / 360). The price climbs toward $1,000 as the days run down and falls when the rate rises. Resetting puts ${DEMO_BILL_DAYS} days back on the clock.`}
            >
              Why below $1,000?
            </span>
            <button
              id="restart-bill"
              type="button"
              className={`btn btn-xs ${matured ? "btn-primary" : "btn-outline"}`}
              disabled={busy !== null}
              onClick={restart.onClick}
            >
              {busy === "restart-bill" ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
              Reset to {DEMO_BILL_DAYS} days
            </button>
          </div>
        }
      >
        {restart.result && !restart.result.ok ? <Outcome id="restart-result" result={restart.result} /> : null}
      </Clock>
      {p.loanOpen ? (
        <Clock
          id="loan-clock"
          label={`Loan · ${desk.termDays}-day term`}
          tone={termTone}
          action={
            desk.encumbrance.holdExpiryMs ? (
              <span className="text-xs text-base-content/70">
                Hold expires {new Date(desk.encumbrance.holdExpiryMs).toLocaleTimeString()}, after the term
              </span>
            ) : null
          }
          headline={termOver ? "Term over" : `${show(p.termRemaining)} days to term liquidation`}
          detail={
            termOver
              ? "Unpaid: anyone may liquidate now, whatever the price."
              : termLeft === null
                ? "Term end unavailable"
                : `${minutes(termLeft)} real time, then anyone may liquidate whatever the price`
          }
          elapsed={termLeft === null ? (termOver ? 1 : null) : 1 - termLeft / (desk.termDays * DAY_MS)}
        ></Clock>
      ) : (
        <Clock
          id="loan-clock"
          label={`Loan · ${desk.termDays}-day term`}
          tone="neutral"
          headline={p.status === "REPAID" ? "Repaid" : p.status === "LIQUIDATED" ? "Liquidated" : "No loan yet"}
          detail={
            p.status === "REPAID" || p.status === "LIQUIDATED"
              ? "The clock stopped when the loan closed."
              : `Starts when the lender lends: ${desk.termDays} days, about ${minutes(desk.termDays * DAY_MS)} real time.`
          }
          elapsed={null}
        />
      )}
    </div>
  );
}

export function History({ entries }: { entries: ActivityEntry[] }) {
  return (
    <details className="card bg-base-100 border border-base-300 shadow-sm">
      <summary className="cursor-pointer p-5 font-semibold">History · {entries.length} actions</summary>
      <div className="px-5 pb-5">
        <ActivityList entries={entries} />
      </div>
    </details>
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
  const message = result.message.startsWith(`${result.result}: `)
    ? result.message.slice(result.result.length + 2)
    : result.message;
  const sentence = message === result.result || message === "" ? (meaning ?? message) : message;
  return sentence.replace(/0x[0-9a-fA-F]{40}/g, address => shortAddress(address));
}

/** An attack's result: refused in red, because the attack failed, which is the pledge holding. */
export function AttackOutcome({
  id,
  result,
  meaning,
}: {
  id: string;
  result: ActionResult | null;
  /** What the refusal means, for errors ATS names without a message of its own. */
  meaning?: string;
}) {
  if (!result) return null;
  if (result.ok)
    return (
      <div id={id} role="alert" className="alert alert-warning text-sm">
        <span>
          <strong>Accepted.</strong> {result.message} Something is broken: the pledge would not be worth lending
          against.
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
      </span>
    </div>
  );
}
