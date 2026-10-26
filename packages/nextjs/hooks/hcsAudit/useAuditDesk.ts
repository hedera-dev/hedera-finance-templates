"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AuditEntry,
  DeskState,
  Publisher,
  SetupEvent,
  SetupStepId,
  SigningMode,
  TokenAction,
} from "~~/services/hcsAudit/types";

export type StepState = { status: "pending" | "active" | "done" | "failed"; id?: string; error?: string };

const STEP_IDS: SetupStepId[] = ["topic", "token", "holder", "associate"];

function initialSteps(): Record<SetupStepId, StepState> {
  return {
    topic: { status: "pending" },
    token: { status: "pending" },
    holder: { status: "pending" },
    associate: { status: "pending" },
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request to ${url} failed.`);
  return data as T;
}

export function useAuditDesk() {
  const [desk, setDesk] = useState<DeskState | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [deskLoaded, setDeskLoaded] = useState(false);

  const [steps, setSteps] = useState<Record<SetupStepId, StepState>>(initialSteps());
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);

  const [signingMode, setSigningMode] = useState<SigningMode>("issuer");
  const [busyAction, setBusyAction] = useState<TokenAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastEntry, setLastEntry] = useState<AuditEntry | null>(null);

  const [authorizing, setAuthorizing] = useState(false);
  const [authorizeError, setAuthorizeError] = useState<string | null>(null);

  const [forging, setForging] = useState(false);
  const [forgeResult, setForgeResult] = useState<string | null>(null);

  const refreshDesk = useCallback(async () => {
    try {
      const res = await fetch("/api/hedera/audit/state", { cache: "no-store" });
      const data = (await res.json()) as DeskState;
      setDesk(data);
      setDeskError(null);
    } catch (e) {
      setDeskError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeskLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshDesk();
  }, [refreshDesk]);

  const runSetup = useCallback(async () => {
    setSetupRunning(true);
    setSetupError(null);
    setJustCompleted(false);
    setSteps(initialSteps());

    try {
      const res = await fetch("/api/hedera/audit/setup", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Setup failed to start.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            const event = JSON.parse(line) as SetupEvent;
            if (event.type === "step") {
              setSteps(prev => ({
                ...prev,
                [event.step]: event.status === "active" ? { status: "active" } : event,
              }));
            } else if (event.type === "complete") {
              setDesk({
                configured: true,
                network: "testnet",
                topicId: event.topicId,
                tokenId: event.tokenId,
                holderAccountId: event.holderAccountId,
                publishers: [],
              });
              setJustCompleted(true);
              refreshDesk();
            } else if (event.type === "error") {
              setSetupError(event.message);
            }
          }
          newlineIndex = buffer.indexOf("\n");
        }
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e));
    } finally {
      setSetupRunning(false);
    }
  }, [refreshDesk]);

  const performIssuerAction = useCallback(async (action: TokenAction, amount?: number, account?: string) => {
    setBusyAction(action);
    setActionError(null);
    try {
      const data = await postJson<{ entry: AuditEntry }>("/api/hedera/audit/action", { action, amount, account });
      setLastEntry(data.entry);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  }, []);

  const performHashPackAction = useCallback(
    async (
      action: TokenAction,
      walletAccountId: string,
      signAndSubmit: (bytes: string) => Promise<{ transactionId: string }>,
      amount?: number,
      account?: string,
    ) => {
      setBusyAction(action);
      setActionError(null);
      try {
        const prepared = await postJson<{ entry: AuditEntry; transactionBytes: string }>(
          "/api/hedera/audit/action/prepare",
          {
            action,
            amount,
            account,
            walletAccountId,
          },
        );
        try {
          const { transactionId } = await signAndSubmit(prepared.transactionBytes);
          const confirmed = await postJson<{ entry: AuditEntry }>("/api/hedera/audit/action/confirm", {
            transactionId,
          });
          setLastEntry(confirmed.entry);
        } catch (signError) {
          // The token action already happened on chain, so its entry still has to be
          // published; declining the signature hands it back to the Issuer.
          await postJson("/api/hedera/audit/action/confirm", { cancelled: true }).catch(() => undefined);
          const reason = signError instanceof Error ? signError.message : String(signError);
          throw new Error(`${reason} — the entry was published by the Issuer instead.`);
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const authorize = useCallback(async (walletAccountId: string) => {
    setAuthorizing(true);
    setAuthorizeError(null);
    try {
      const data = await postJson<{ publishers: Publisher[] }>("/api/hedera/audit/authorize", { walletAccountId });
      setDesk(prev => (prev ? { ...prev, publishers: data.publishers } : prev));
    } catch (e) {
      setAuthorizeError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthorizing(false);
    }
  }, []);

  const forge = useCallback(async () => {
    setForging(true);
    setForgeResult(null);
    try {
      const res = await fetch("/api/hedera/audit/forge", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setForgeResult(`Could not even attempt it: ${data.error}`);
      } else if (data.added) {
        setForgeResult(`Unexpected: the network accepted it (${data.resultCode}).`);
      } else {
        setForgeResult(`${data.resultCode} — nothing was added to the trail.`);
      }
    } catch (e) {
      setForgeResult(e instanceof Error ? e.message : String(e));
    } finally {
      setForging(false);
    }
  }, []);

  return {
    desk,
    deskError,
    deskLoaded,
    refreshDesk,
    steps,
    stepIds: STEP_IDS,
    setupRunning,
    setupError,
    justCompleted,
    runSetup,
    signingMode,
    setSigningMode,
    busyAction,
    actionError,
    lastEntry,
    performIssuerAction,
    performHashPackAction,
    authorizing,
    authorizeError,
    authorize,
    forging,
    forgeResult,
    forge,
  };
}
