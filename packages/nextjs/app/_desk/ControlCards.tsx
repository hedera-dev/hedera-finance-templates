"use client";

import { type ReactNode, useState } from "react";
import { Card, Spinner } from "./ui";
import type { ActionRequest, ActionResult, DeskView, PreviewResult } from "~~/types/repo";

export type Run = (key: string, request: ActionRequest) => Promise<ActionResult>;

type Shared = { desk: DeskView | null; busy: string | null; run: Run };

/** Shown for a refusal or a result: the decoded error name in front, then what it means. */
function Outcome({ id, result }: { id: string; result: ActionResult | null }) {
  if (!result) return null;
  return (
    <div id={id} className={`alert ${result.ok ? "alert-success" : "alert-error"} text-sm break-words`}>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="font-mono">{result.result}</strong>
        {result.message ? ` — ${result.message}` : ""}
      </span>
    </div>
  );
}

function Button({
  id,
  label,
  busyKey,
  busy,
  disabled,
  onClick,
  variant = "btn-primary",
}: {
  id: string;
  label: string;
  busyKey: string;
  busy: string | null;
  disabled: boolean;
  onClick: () => void;
  variant?: string;
}) {
  return (
    <button id={id} type="button" className={`btn ${variant}`} disabled={disabled || busy !== null} onClick={onClick}>
      {busy === busyKey ? <Spinner /> : null}
      {label}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function PledgeCard({
  desk,
  busy,
  run,
  mode,
  onWalletPledge,
  pledgeError,
  setPledgeError,
  walletBusy,
}: Shared & {
  mode: "demo" | "wallet";
  onWalletPledge: (amount: string) => Promise<ActionResult>;
  pledgeError: ActionResult | null;
  setPledgeError: (result: ActionResult | null) => void;
  walletBusy: boolean;
}) {
  const [amount, setAmount] = useState("10");
  const ready = desk !== null;

  const pledge = async () => {
    setPledgeError(null);
    const result = mode === "wallet" ? await onWalletPledge(amount) : await run("pledge", { type: "pledge", amount });
    setPledgeError(result);
  };

  return (
    <Card
      title="Pledge the bills"
      caption="Encumbers the borrower's own bills in place with an ATS hold: the repo contract is escrow, the lender is the destination."
    >
      <Field label="Bills to pledge" htmlFor="pledge-amount">
        <input
          id="pledge-amount"
          className="input input-bordered w-full"
          inputMode="numeric"
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
      </Field>
      <div className="flex gap-2 flex-wrap">
        <Button
          id="pledge-collateral"
          label="Pledge bills as collateral"
          busyKey="pledge"
          busy={walletBusy ? "pledge" : busy}
          disabled={!ready}
          onClick={pledge}
        />
      </div>
      <p className="m-0 text-xs text-base-content/70">
        {mode === "wallet"
          ? "You sign this one in MetaMask: it encumbers your own asset without handing it over."
          : "The demo borrower signs this one on the server. The bills do not move; the hold reduces what ATS reports as free."}
      </p>
      <Outcome id="pledge-error" result={pledgeError && !pledgeError.ok ? pledgeError : null} />
      {pledgeError?.ok ? (
        <div id="pledge-result" className="alert alert-success text-sm">
          {pledgeError.message}
        </div>
      ) : null}
    </Card>
  );
}

export function LoanTicketCard({
  desk,
  busy,
  run,
  preview,
  amount,
  setAmount,
}: Shared & { preview: PreviewResult | null; amount: string; setAmount: (value: string) => void }) {
  const [openResult, setOpenResult] = useState<ActionResult | null>(null);
  const [repayResult, setRepayResult] = useState<ActionResult | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [topUpResult, setTopUpResult] = useState<ActionResult | null>(null);
  const [liquidateResult, setLiquidateResult] = useState<ActionResult | null>(null);
  const ready = desk !== null;

  return (
    <Card
      title="The loan ticket"
      caption="Borrow against the pledge, then repay it, cure it, or let it be taken: one transaction each."
    >
      <Field label="Stablecoin to borrow (US dollars)" htmlFor="borrow-amount">
        <input
          id="borrow-amount"
          className="input input-bordered w-full"
          inputMode="numeric"
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
      </Field>
      <div id="borrow-preview" className="rounded-box bg-base-200 p-3 text-sm flex flex-col gap-1">
        {!ready ? (
          <span>
            Set up the desk and pledge bills; this line then shows what the repo contract would say to the amount above.
          </span>
        ) : !preview ? (
          <span>Asking the repo contract…</span>
        ) : (
          <>
            <span>
              Capacity after the haircut: <strong>{preview.capacity ?? "—"}</strong>
            </span>
            <span>
              A loan of ${preview.amount} needs <strong>{preview.needs ?? "—"}</strong> of collateral value and would
              open at an LTV of <strong>{preview.ltv ?? "—"}</strong>.
            </span>
            <span>
              {preview.verdict === "allowed"
                ? "The contract would allow it."
                : preview.verdict === "refused"
                  ? `The contract would refuse it: ${preview.reason}`
                  : `Cannot tell yet: ${preview.reason}`}
            </span>
          </>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          id="open-loan"
          label="Borrow against the pledge"
          busyKey="open"
          busy={busy}
          disabled={!ready}
          onClick={async () => {
            setOpenResult(null);
            setOpenResult(await run("open", { type: "open", amount }));
          }}
        />
      </div>
      {openResult && !openResult.ok ? <Outcome id="open-error" result={openResult} /> : null}
      {openResult?.ok ? <div className="alert alert-success text-sm">{openResult.message}</div> : null}

      <div className="divider my-0" />
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          id="repay-loan"
          label="Repay and release the collateral"
          busyKey="repay"
          busy={busy}
          disabled={!ready}
          onClick={async () => {
            setRepayResult(null);
            setRepayResult(await run("repay", { type: "repay" }));
          }}
        />
      </div>
      <Outcome id="repay-result" result={repayResult} />

      <Field label="Principal to repay to cure a margin call (US dollars)" htmlFor="top-up-amount">
        <input
          id="top-up-amount"
          className="input input-bordered w-full"
          inputMode="numeric"
          value={topUpAmount}
          onChange={event => setTopUpAmount(event.target.value)}
        />
      </Field>
      <div className="flex gap-2 flex-wrap">
        <Button
          id="top-up"
          label="Repay part of the principal to cure"
          busyKey="top-up"
          busy={busy}
          disabled={!ready}
          variant="btn-secondary"
          onClick={async () => {
            setTopUpResult(null);
            setTopUpResult(await run("top-up", { type: "top-up", amount: topUpAmount }));
          }}
        />
      </div>
      <Outcome id="top-up-result" result={topUpResult} />

      <div className="divider my-0" />
      <div className="flex gap-2 flex-wrap">
        <Button
          id="liquidate"
          label="Take the collateral"
          busyKey="liquidate"
          busy={busy}
          disabled={!ready}
          variant="btn-error"
          onClick={async () => {
            setLiquidateResult(null);
            setLiquidateResult(await run("liquidate", { type: "liquidate" }));
          }}
        />
      </div>
      <Outcome id="liquidate-result" result={liquidateResult} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Which liquidation path a loan actually takes</summary>
        <div className="mt-2 text-xs text-base-content/70 flex flex-col gap-2">
          <p className="m-0">
            <strong>Failure to repay at term is the primary liquidation path</strong>, as it is for real bill repo: once
            the term reaches zero unpaid, anyone may take the collateral, and that path reads no price at all. Price
            liquidation is the second path.
          </p>
          <p className="m-0">
            A price-based liquidation is nearly unreachable on a 13-week bill. Its duration is 91/360 = 0.25 years, so
            each 100bp of rate costs about $2.53, or 0.26%. Moving the price from $987.36 to the $969.70 trigger takes
            roughly 700bp in three-month bills: not a market move but a change of monetary regime.
          </p>
          <p className="m-0">
            A stale or impossible price blocks new credit and price liquidation, but not term liquidation. That
            asymmetry is deliberate: blocking new credit on data you cannot trust is prudent; seizing someone&apos;s
            collateral on it is not.
          </p>
        </div>
      </details>
    </Card>
  );
}

export function SimulationsCard({ desk, busy, run }: Shared) {
  const [rate, setRate] = useState("1200");
  const [results, setResults] = useState<Record<string, ActionResult | null>>({});
  const ready = desk !== null;
  const record = (key: string, result: ActionResult | null) => setResults(previous => ({ ...previous, [key]: result }));
  const go = async (key: string, resultKey: string, request: ActionRequest) => {
    record(resultKey, null);
    record(resultKey, await run(key, request));
  };

  return (
    <Card
      title="Simulations"
      caption="Things that happen to a real desk, staged so the mechanism is visible: none of them is a normal day."
    >
      <Field label="Discount rate to publish (basis points)" htmlFor="shock-rate">
        <input
          id="shock-rate"
          className="input input-bordered w-full"
          inputMode="numeric"
          value={rate}
          onChange={event => setRate(event.target.value)}
        />
      </Field>
      <div className="flex gap-2 flex-wrap">
        <Button
          id="apply-shock"
          label="Shock the discount rate"
          busyKey="shock"
          busy={busy}
          disabled={!ready}
          variant="btn-secondary"
          onClick={() => go("shock", "shock", { type: "shock", bps: rate })}
        />
        <Button
          id="freeze-feed"
          label="Stop the price feed"
          busyKey="freeze"
          busy={busy}
          disabled={!ready}
          variant="btn-secondary"
          onClick={() => go("freeze", "feed", { type: "freeze" })}
        />
        <Button
          id="resume-feed"
          label="Restart the price feed"
          busyKey="resume"
          busy={busy}
          disabled={!ready}
          variant="btn-secondary"
          onClick={() => go("resume", "feed", { type: "resume" })}
        />
        <Button
          id="restart-bill"
          label="Restart the bill's 91-day clock"
          busyKey="restart-bill"
          busy={busy}
          disabled={!ready}
          variant="btn-outline"
          onClick={() => go("restart-bill", "feed", { type: "restart-bill" })}
        />
      </div>
      <p className="m-0 text-xs text-base-content/70">
        The 700bp move needed to liquidate this bill on price is far beyond anything observed in three-month bills and
        is shown only so the mechanism is visible. On the demo clock a 91-day bill matures in about fifteen minutes, and
        a matured bill prices at par whatever the rate is, so restart its clock before a price shock if the bill has run
        down.
      </p>
      <Outcome id="shock-result" result={results.shock ?? null} />
      <Outcome id="feed-result" result={results.feed ?? null} />

      <div className="divider my-0" />
      <div className="flex gap-2 flex-wrap">
        <Button
          id="transfer-pledged"
          label="Try to transfer the pledged bills"
          busyKey="transfer-pledged"
          busy={busy}
          disabled={!ready}
          variant="btn-outline"
          onClick={() => go("transfer-pledged", "transfer", { type: "transfer-pledged" })}
        />
      </div>
      <Outcome id="transfer-result" result={results.transfer ?? null} />

      <div className="flex gap-2 flex-wrap">
        <Button
          id="reclaim-pledge"
          label="Try to reclaim the pledge"
          busyKey="reclaim-pledge"
          busy={busy}
          disabled={!ready}
          variant="btn-outline"
          onClick={() => go("reclaim-pledge", "reclaim", { type: "reclaim-pledge" })}
        />
      </div>
      <Outcome id="reclaim-result" result={results.reclaim ?? null} />
      <p className="m-0 text-xs text-base-content/70">
        The borrower&apos;s own way out, <code>reclaimHoldByPartition</code>, opens only once the hold expires. That is
        why the expiry must outlast the loan.
      </p>

      <div className="divider my-0" />
      <div className="flex gap-2 flex-wrap">
        <Button
          id="pledge-wrong-escrow"
          label="Pledge with the wrong escrow"
          busyKey="pledge-wrong-escrow"
          busy={busy}
          disabled={!ready}
          variant="btn-outline"
          onClick={() => go("pledge-wrong-escrow", "wrong", { type: "pledge-wrong-escrow", amount: "10" })}
        />
      </div>
      <Outcome id="wrong-escrow-result" result={results.wrong ?? null} />
      <p className="m-0 text-xs text-base-content/70">
        This pledge names the lender as escrow instead of the repo contract. From outside it is indistinguishable from a
        good one; the loan is refused because the contract reads the hold rather than trusting this page.
      </p>

      <div className="flex gap-2 flex-wrap">
        <Button
          id="redirect-pledge"
          label="Try to send the pledge elsewhere"
          busyKey="redirect-pledge"
          busy={busy}
          disabled={!ready}
          variant="btn-outline"
          onClick={() => go("redirect-pledge", "redirect", { type: "redirect-pledge" })}
        />
      </div>
      <Outcome id="redirect-result" result={results.redirect ?? null} />
      <p className="m-0 text-xs text-base-content/70">
        The escrow is asked, as the escrow, to execute the hold to an address other than the one recorded on it. Nothing
        is sent; ATS answers with what it would do.
      </p>
    </Card>
  );
}
