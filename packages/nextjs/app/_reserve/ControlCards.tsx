"use client";

import { useState } from "react";
import { hashscan, post, usePreview } from "./api";
import { Card, HashLink, Spinner, shortAddress } from "./ui";
import { useDebounceValue } from "usehooks-ts";
import { hederaTestnet } from "viem/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import type { ActionResult, DeskView, ReserveSnapshot } from "~~/types/reserve";

/** The reply to a button: the network's answer, as text and, where one was sent, a link. */
function Answer({ id, result, children }: { id: string; result: ActionResult; children?: React.ReactNode }) {
  return (
    <div id={id} role="status" className={`text-sm flex flex-col gap-1 ${result.ok ? "" : "text-error"}`}>
      <span className="font-medium">{result.result}</span>
      <span>{result.message}</span>
      {result.txHash ? <HashLink href={hashscan.transaction(result.txHash)}>{result.txHash}</HashLink> : null}
      {children}
    </div>
  );
}

export function TicketCard({ snapshot }: { snapshot: ReserveSnapshot | undefined }) {
  const desk = snapshot?.desk ?? null;
  const [amount, setAmount] = useState("1");
  const [holder, setHolder] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [issued, setIssued] = useState<ActionResult | null>(null);

  const holders = desk?.holders ?? [];
  const chosenHolder = holders.find(candidate => candidate.address === holder)?.address ?? holders[0]?.address;
  const [debouncedAmount] = useDebounceValue(amount, 300);
  const ready = desk !== null && !snapshot?.setup.running;
  const preview = usePreview(debouncedAmount, chosenHolder, ready && chosenHolder !== undefined);

  const unknown = desk?.asset.status === "UNKNOWN";
  const amountValid = /^\d+$/.test(amount.trim()) && BigInt(amount.trim() || "0") > 0n;

  const submit = async () => {
    setPending(true);
    setMintError(null);
    setIssued(null);
    const result = await post("/api/reserve/issue", { amount: amount.trim(), holder: chosenHolder });
    if (result.ok) setIssued(result);
    else setMintError(result.message);
    setPending(false);
    void preview.refetch();
  };

  return (
    <Card
      title="Issue ticket"
      caption="Ask the gate to issue units of the asset; it reads the reserve first and refuses if the reserve would not cover them."
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="mint-amount" className="text-sm font-medium">
          Units to issue
        </label>
        <input
          id="mint-amount"
          className="input input-bordered w-full"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          disabled={!desk}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mint-holder" className="text-sm font-medium">
          Issue to
        </label>
        <select
          id="mint-holder"
          className="select select-bordered w-full"
          value={chosenHolder ?? ""}
          onChange={event => setHolder(event.target.value)}
          disabled={!desk}
        >
          {holders.length === 0 ? <option value="">Set up the desk first</option> : null}
          {holders.map(candidate => (
            <option key={candidate.address} value={candidate.address}>
              {candidate.label} ({shortAddress(candidate.address)})
            </option>
          ))}
        </select>
      </div>

      <div id="mint-preview" className="rounded-box bg-base-200 p-3 text-sm flex flex-col gap-1" aria-live="polite">
        {!desk ? (
          <span>Set up the desk to see the reserve check for an amount.</span>
        ) : !amountValid ? (
          <span>Enter a whole number of units to see the reserve check.</span>
        ) : !preview.data ? (
          <span className="flex items-center gap-2">
            <Spinner /> Asking the gate…
          </span>
        ) : (
          <>
            <span>
              The reserve covers: <strong>{preview.data.covers ?? "unavailable"}</strong>
            </span>
            <span>
              This issuance would need: <strong>{preview.data.needs ?? "unavailable"}</strong> (the supply after it, at
              face value)
            </span>
            <span
              className={preview.data.verdict === "allowed" ? "text-success font-medium" : "text-error font-medium"}
            >
              {preview.data.verdict === "allowed"
                ? "The gate would allow it."
                : preview.data.verdict === "refused"
                  ? `The gate would refuse it. ${preview.data.reason ?? ""}`
                  : `The gate's answer is unknown. ${preview.data.reason ?? ""}`}
            </span>
          </>
        )}
      </div>

      <div>
        <button
          id="mint-submit"
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={!desk || pending || unknown || !amountValid}
        >
          {pending ? <Spinner /> : null}
          Issue through the gate
        </button>
        {unknown ? (
          <p className="m-0 mt-2 text-xs text-base-content/70">
            Issuing is paused while the reserve status is UNKNOWN: the gate cannot be known to allow it.
          </p>
        ) : null}
      </div>
      {mintError ? (
        <p id="mint-error" role="alert" className="m-0 text-sm text-error">
          {mintError}
        </p>
      ) : null}
      {issued ? (
        <div className="text-sm text-success flex flex-col gap-1">
          <span>{issued.message}</span>
          {issued.txHash ? <HashLink href={hashscan.transaction(issued.txHash)}>{issued.txHash}</HashLink> : null}
        </div>
      ) : null}
    </Card>
  );
}

export function SimulationsCard({ desk, disabled }: { desk: DeskView | null; disabled: boolean }) {
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [busy, setBusy] = useState<null | "withdraw" | "direct" | "bypass">(null);
  const [withdrawResult, setWithdrawResult] = useState<ActionResult | null>(null);
  const [directResult, setDirectResult] = useState<ActionResult | null>(null);
  const [bypassResult, setBypassResult] = useState<ActionResult | null>(null);

  const off = !desk || disabled || busy !== null;

  const run = async (kind: "withdraw" | "direct" | "bypass") => {
    setBusy(kind);
    if (kind === "withdraw") {
      setWithdrawResult(await post("/api/reserve/withdraw", { amount: withdrawAmount.trim() }));
    } else if (kind === "direct") {
      setDirectResult(await post("/api/reserve/direct-issue"));
    } else {
      setBypassResult(await post("/api/reserve/bypass"));
    }
    setBusy(null);
  };

  return (
    <Card
      title="Simulations"
      caption="Simulations of things that happen to a real issuer: collateral leaving, issuing around the gate, and the admin role overriding it."
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="withdraw-amount" className="text-sm font-medium">
          Collateral units to move out of the reserve
        </label>
        <input
          id="withdraw-amount"
          className="input input-bordered w-full"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={withdrawAmount}
          onChange={event => setWithdrawAmount(event.target.value)}
          disabled={!desk}
        />
        <div>
          <button
            id="withdraw-collateral"
            type="button"
            className="btn btn-outline btn-sm mt-1"
            onClick={() => run("withdraw")}
            disabled={off}
          >
            {busy === "withdraw" ? <Spinner /> : null}
            Move collateral out of the reserve
          </button>
        </div>
        <p className="m-0 text-xs text-base-content/70">
          A real transfer from the reserve address to the operator. Nothing is unwound: units already issued stay
          issued.
        </p>
        {withdrawResult ? <Answer id="withdraw-result" result={withdrawResult} /> : null}
      </div>

      <div className="divider my-0" />

      <div className="flex flex-col gap-1">
        <button
          id="direct-issue"
          type="button"
          className="btn btn-outline btn-sm self-start"
          onClick={() => run("direct")}
          disabled={off}
        >
          {busy === "direct" ? <Spinner /> : null}
          Try issuing without the gate
        </button>
        <p className="m-0 text-xs text-base-content/70">
          The operator calls the asset&apos;s own <code>issue</code>. The operator does not hold the issuer role, so ATS
          refuses.
        </p>
        {directResult ? <Answer id="direct-issue-result" result={directResult} /> : null}
      </div>

      <div className="divider my-0" />

      <div className="flex flex-col gap-1">
        <button
          id="bypass-gate"
          type="button"
          className="btn btn-outline btn-error btn-sm self-start"
          onClick={() => run("bypass")}
          disabled={off}
        >
          {busy === "bypass" ? <Spinner /> : null}
          Grant the admin the issuer role and issue unbacked
        </button>
        <p className="m-0 text-xs text-base-content/70">
          The operator holds the admin role, so it can grant itself the issuer role and then issue one unit more than
          the reserve covers. It succeeds. Setting up a fresh desk restores the gate-only arrangement.
        </p>
        {bypassResult ? (
          <Answer id="bypass-result" result={bypassResult}>
            <span>
              The gate binds the issuer role and never the admin role: the admin role sits above it and can grant the
              issuer role to itself.
              {bypassResult.grantTxHash ? " That cannot happen quietly. The grant emitted a RoleGranted event:" : ""}
            </span>
            {bypassResult.grantTxHash ? (
              <HashLink href={hashscan.transaction(bypassResult.grantTxHash)}>{bypassResult.grantTxHash}</HashLink>
            ) : null}
            <span>
              Anyone watching the token can filter for that event. In production, hold the admin role on a threshold
              key, renounce it after setup, and alert on <code>RoleGranted</code> for the issuer role.
            </span>
          </Answer>
        ) : null}
      </div>
    </Card>
  );
}

export function WalletCard({ desk, disabled }: { desk: DeskView | null; disabled: boolean }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTestnet = chainId === hederaTestnet.id;
  const holder = desk?.holders.find(candidate => address && candidate.address.toLowerCase() === address.toLowerCase());

  // A wallet's chain id is only known to wagmi once connected; the wallet may sit on any chain.
  const sentence = !isConnected
    ? "Connect MetaMask to hold the asset."
    : !onTestnet
      ? "Switch MetaMask to Hedera testnet."
      : !holder
        ? desk
          ? "Add your wallet as a holder so the issuer can issue to it."
          : "Set up the desk, then add your wallet as a holder."
        : holder.balance && holder.balance !== "0"
          ? `Your wallet holds ${holder.balance} units of the asset.`
          : "Wait to be issued to: choose My wallet in the issue ticket.";

  const add = async () => {
    if (!address) return;
    setAdding(true);
    setError(null);
    const result = await post("/api/reserve/holders", { address });
    if (!result.ok) setError(result.message);
    setAdding(false);
  };

  return (
    <Card
      title="Your wallet"
      caption="Add your MetaMask account on Hedera testnet as a holder, then the issuer can issue the asset to it."
    >
      <p id="wallet-state" className="m-0 text-sm">
        {sentence}
      </p>
      {isConnected && !onTestnet ? (
        <div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => switchChain({ chainId: hederaTestnet.id })}
          >
            Switch to Hedera testnet
          </button>
        </div>
      ) : null}
      {isConnected ? (
        <div>
          <button
            id="add-wallet-holder"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={add}
            disabled={!desk || disabled || adding || !onTestnet || holder !== undefined}
          >
            {adding ? <Spinner /> : null}
            Add my wallet as a holder
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-sm text-error">
          {error}
        </p>
      ) : null}
      <p className="m-0 text-xs text-base-content/70">
        Adding a wallet is taken on trust: no signature proves the address belongs to whoever asked.
      </p>
    </Card>
  );
}
