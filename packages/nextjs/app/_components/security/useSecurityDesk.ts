"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { DeskStateView, HolderId, OrderAction } from "~~/services/security/types";

export type SetupStepId = "officers" | "token" | "holders" | "distribute";
export type SetupStepStatus = "pending" | "active" | "done" | "failed";
export type SetupStep = { id: SetupStepId; status: SetupStepStatus; detail: string | null };

const STEP_IDS: SetupStepId[] = ["officers", "token", "holders", "distribute"];
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

/**
 * Drives the desk: polls `/api/security/state` for everything the network shows, and exposes
 * one function per action the learner can take. Every mutating call replaces `state` with the
 * fresh view the route sends back, so the page never has to guess what changed.
 */
export function useSecurityDesk() {
  const { address, isConnected, connector } = useAccount();
  const [state, setState] = useState<DeskStateView | null>(null);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>(initialSteps());
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  const refresh = useCallback(async () => {
    const qs = addressRef.current ? `?walletEvm=${encodeURIComponent(addressRef.current)}` : "";
    const res = await fetch(`/api/security/state${qs}`, { cache: "no-store" });
    const data = (await res.json()) as DeskStateView;
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
      setStep("officers", "active");
      const officers = await postJson("/api/security/setup/officers", {
        walletEvm: isConnected ? address : undefined,
      });
      setStep(
        "officers",
        "done",
        officers.result.officer3Kind === "wallet"
          ? `Officer 3 is the connected wallet (${officers.result.officer3AccountId})`
          : "3 officer keys ready; Officer 3 is a demo key",
      );

      setStep("token", "active");
      const token = await postJson("/api/security/setup/token");
      setStep("token", "done", `Token ${token.result.tokenId}`);

      setStep("holders", "active");
      const holders = await postJson("/api/security/setup/holders");
      setStep("holders", "done", holders.result.map((h: { accountId: string }) => h.accountId).join(", "));

      setStep("distribute", "active");
      await postJson("/api/security/setup/distribute");
      setStep("distribute", "done", "Holder A granted KYC and sent 100");

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

  const withBusy = useCallback(async (key: string, task: () => Promise<void>) => {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }, []);

  const send = useCallback(
    (holderId: HolderId) =>
      withBusy(`send-${holderId}`, async () => {
        const data = await postJson(`/api/security/holders/${holderId}/send`);
        setState(data.state);
        setMessage(`Send 10 to Holder ${holderId}: ${data.result.result}`);
      }),
    [withBusy],
  );

  const propose = useCallback(
    (action: OrderAction, holderId: HolderId | null, reference: string) =>
      withBusy("propose", async () => {
        const data = await postJson("/api/security/orders/propose", { action, holderId, reference });
        setState(data.state);
      }),
    [withBusy],
  );

  const approve = useCallback(
    (scheduleId: string) =>
      withBusy(`approve-${scheduleId}`, async () => {
        const data = await postJson(`/api/security/orders/${encodeURIComponent(scheduleId)}/approve`);
        setState(data.state);
      }),
    [withBusy],
  );

  const remove = useCallback(
    (scheduleId: string) =>
      withBusy(`delete-${scheduleId}`, async () => {
        const data = await request(`/api/security/orders/${encodeURIComponent(scheduleId)}`, { method: "DELETE" });
        setState(data.state);
      }),
    [withBusy],
  );

  const approveAsWallet = useCallback(
    (scheduleId: string) =>
      withBusy(`wallet-${scheduleId}`, async () => {
        if (!connector || !address) throw new Error("No wallet is connected.");
        const prepared = await postJson(
          `/api/security/orders/${encodeURIComponent(scheduleId)}/approve-wallet/prepare`,
        );
        const provider = (await connector.getProvider()) as { request: (args: unknown) => Promise<string> };
        const signature = await provider.request({
          method: "eth_sign",
          params: [address, `0x${prepared.bodyBytesHex}`],
        });
        const data = await postJson(`/api/security/orders/${encodeURIComponent(scheduleId)}/approve-wallet/submit`, {
          nodeAccountId: prepared.nodeAccountId,
          transactionId: prepared.transactionId,
          signatureHex: signature,
        });
        setState(data.state);
      }),
    [withBusy, connector, address],
  );

  return {
    state,
    setupSteps,
    isSettingUp,
    busy,
    message,
    runSetup,
    send,
    propose,
    approve,
    remove,
    approveAsWallet,
  };
}
