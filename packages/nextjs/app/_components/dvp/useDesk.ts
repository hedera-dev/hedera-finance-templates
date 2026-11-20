"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hederaTestnet } from "viem/chains";
import { useAccount } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-hbar";
import type { AttackResult, AttackType } from "~~/services/dvp/attacks";
import type { DeskView, PartyId } from "~~/services/dvp/types";

export type SetupStepId = "accounts" | "security" | "cash" | "contract" | "permissions" | "fund";
export type SetupStepStatus = "pending" | "active" | "done" | "failed";
export type SetupStep = { id: SetupStepId; status: SetupStepStatus; detail: string | null };

const STEP_IDS: SetupStepId[] = ["accounts", "security", "cash", "contract", "permissions", "fund"];
const POLL_MS = 6000;

function initialSteps(): SetupStep[] {
  return STEP_IDS.map(id => ({ id, status: "pending" as const, detail: null }));
}

async function request(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error ?? `Request to ${url} failed.`);
  return data;
}

const postJson = (url: string, body: unknown = {}) =>
  request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** What the page shows beside a button: the chain's answer, and the transaction it came with. */
export type DeskResult = {
  ok: boolean;
  /** `SUCCESS`, the error the contract returned, or `Error` when the request never reached the chain. */
  result: string;
  message: string;
  txHash?: string;
  tradeId?: number;
};

export type TradeTerms = {
  quantity: string;
  price: string;
  buyer: PartyId;
  settlementMode: "immediate" | "delayed";
  delayMinutes: string;
};

/**
 * Drives the desk: polls `/api/dvp/state` for everything the chain shows, and exposes one function
 * per action the learner can take. Every mutating call replaces `state` with the fresh view the
 * route sends back, so the page never has to guess what changed.
 */
export function useDvpDesk() {
  const { address, isConnected, chainId } = useAccount();
  const transact = useTransactor();
  const [state, setState] = useState<DeskView | null>(null);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>(initialSteps());
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  const refresh = useCallback(async () => {
    const qs = addressRef.current ? `?walletEvm=${encodeURIComponent(addressRef.current)}` : "";
    const res = await fetch(`/api/dvp/state${qs}`, { cache: "no-store" });
    const data = (await res.json()) as DeskView;
    setState(data);
    return data;
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const setStep = useCallback((id: SetupStepId, status: SetupStepStatus, detail: string | null = null) => {
    setSetupSteps(steps => steps.map(s => (s.id === id ? { id, status, detail } : s)));
  }, []);

  const runSetup = useCallback(async () => {
    if (isSettingUp) return;
    setIsSettingUp(true);
    setSetupSteps(initialSteps());
    try {
      setStep("accounts", "active");
      const parties = await postJson("/api/dvp/setup/parties", { walletEvm: isConnected ? address : undefined });
      setStep(
        "accounts",
        "done",
        parties.result.buyerKind === "wallet" ? "The Buyer is the connected wallet" : "Three demo accounts",
      );

      setStep("security", "active");
      const security = await postJson("/api/dvp/setup/security");
      setStep("security", "done", `${security.result.contractId} (equity configuration v${security.result.version})`);

      setStep("cash", "active");
      const cash = await postJson("/api/dvp/setup/cash");
      setStep("cash", "done", `${cash.result.tokenId} · proxy ${cash.result.proxyContractId}`);

      setStep("contract", "active");
      const settlement = await postJson("/api/dvp/setup/settlement");
      setStep("contract", "done", `${settlement.result.contractId}, ${settlement.result.graceSeconds}s grace`);

      setStep("permissions", "active");
      await postJson("/api/dvp/setup/permissions");
      setStep("permissions", "done", "Both buyers can pledge cash; the Unverified Buyer has no KYC");

      setStep("fund", "active");
      const funded = await postJson("/api/dvp/setup/fund");
      setStep(
        "fund",
        "done",
        `Seller ${funded.result.security}, Buyer ${funded.result.buyerCash}, Unverified Buyer ${funded.result.unverifiedCash}`,
      );

      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Setup failed.";
      setSetupSteps(steps => {
        const activeIndex = steps.findIndex(s => s.status === "active");
        return steps.map((s, i) => (i === activeIndex ? { ...s, status: "failed", detail: text } : s));
      });
    } finally {
      setIsSettingUp(false);
    }
  }, [address, isConnected, isSettingUp, refresh, setStep]);

  /**
   * One action at a time, keyed so its own button shows the spinner, resolving to the chain's
   * answer rather than a message the page has to parse.
   */
  const act = useCallback(async (key: string, url: string, body: unknown = {}): Promise<DeskResult> => {
    setBusyKey(key);
    try {
      const data = await postJson(url, body);
      if (data.state) setState(data.state);
      const result = data.ok ? "SUCCESS" : (data.errorName ?? data.result?.errorName ?? "Reverted");
      return {
        ok: Boolean(data.ok),
        result,
        message: data.error ?? data.result?.error ?? "",
        txHash: data.txHash ?? data.result?.txHash ?? undefined,
        tradeId: data.tradeId ?? data.result?.tradeId ?? undefined,
      };
    } catch (error) {
      return { ok: false, result: "Error", message: error instanceof Error ? error.message : String(error) };
    } finally {
      setBusyKey(null);
    }
  }, []);

  const propose = useCallback(
    (terms: TradeTerms) =>
      act("propose", "/api/dvp/trades/propose", {
        quantity: terms.quantity,
        price: terms.price,
        buyer: terms.buyer,
        settlementMode: terms.settlementMode,
        delayMinutes: terms.delayMinutes,
      }),
    [act],
  );

  const pledgeSecurity = useCallback(
    (tradeId: number) => act(`pledge-security-${tradeId}`, `/api/dvp/trades/${tradeId}/pledge-security`),
    [act],
  );

  const pledgeCash = useCallback(
    (tradeId: number) => act(`pledge-cash-${tradeId}`, `/api/dvp/trades/${tradeId}/pledge-cash`),
    [act],
  );

  const settle = useCallback((tradeId: number) => act(`settle-${tradeId}`, `/api/dvp/trades/${tradeId}/settle`), [act]);

  const cancel = useCallback(
    (tradeId: number, by: PartyId = "seller") => act(`cancel-${tradeId}`, `/api/dvp/trades/${tradeId}/cancel`, { by }),
    [act],
  );

  /**
   * An attack's own result, not the request's: the route answers `ok` when the attempt *ran*, and
   * whether it was refused is what the card has to show.
   */
  const attack = useCallback(async (type: AttackType): Promise<AttackResult> => {
    setBusyKey(`attack-${type}`);
    try {
      const data = await postJson("/api/dvp/attack", { type });
      if (data.state) setState(data.state);
      return data.result as AttackResult;
    } catch (error) {
      return {
        type,
        outcome: "blocked",
        errorName: null,
        error: null,
        txHash: null,
        blocked: error instanceof Error ? error.message : String(error),
        tradeId: null,
      };
    } finally {
      setBusyKey(null);
    }
  }, []);

  /** The wallet buyer's own pledge: one ordinary `createHold` call, which the wallet pays for. */
  const pledgeAsWallet = useCallback(
    async (tradeId: number): Promise<DeskResult> => {
      const key = `wallet-${tradeId}`;
      setBusyKey(key);
      try {
        if (!isConnected) throw new Error("No wallet is connected.");
        // The stablecoin lives on Hedera testnet; from a wallet on any other network this
        // transaction would go to an address that means nothing there.
        if (chainId !== hederaTestnet.id) throw new Error("Switch the wallet to Hedera testnet to pledge.");

        const prepared = await postJson(`/api/dvp/trades/${tradeId}/pledge-wallet/prepare`);
        const hash = await transact({ to: prepared.to, data: prepared.data, gas: BigInt(prepared.gas) });
        if (!hash) throw new Error("The wallet did not sign the hold.");

        const data = await postJson(`/api/dvp/trades/${tradeId}/pledge-wallet/submit`, { txHash: hash });
        if (data.state) setState(data.state);
        return {
          ok: Boolean(data.ok),
          result: data.ok ? "SUCCESS" : (data.errorName ?? "Reverted"),
          message: data.error ?? "",
          txHash: data.txHash ?? hash,
        };
      } catch (error) {
        return { ok: false, result: "Error", message: error instanceof Error ? error.message : String(error) };
      } finally {
        setBusyKey(null);
      }
    },
    [chainId, isConnected, transact],
  );

  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    state,
    busyKey,
    message,
    clearMessage,
    setMessage,
    setupSteps,
    isSettingUp,
    runSetup,
    refresh,
    act,
    propose,
    pledgeSecurity,
    pledgeCash,
    settle,
    cancel,
    attack,
    pledgeAsWallet,
  };
}

export type DvpDeskHook = ReturnType<typeof useDvpDesk>;
