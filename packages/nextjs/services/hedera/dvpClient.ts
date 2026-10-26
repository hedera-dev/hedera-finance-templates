/**
 * Client-side fetch wrappers for the DvP API routes. No Hedera SDK import here — just JSON
 * over fetch, so this module is safe to use from any client component.
 */
import type { SetupEvent, SetupStepId } from "~~/services/hedera/setupSteps";
import type {
  AuditEntrySnapshot,
  BuyerChoice,
  MarketSnapshot,
  SettlementMode,
  WalletRole,
} from "~~/services/hedera/types";

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request to ${url} failed`);
  return data as T;
}

export type ConfigResponse = { operatorConfigured: boolean; missingEnvVars: string[] };

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/hedera/dvp/config");
  return res.json();
}

export async function fetchMarket(): Promise<MarketSnapshot | null> {
  const res = await fetch("/api/hedera/dvp/market");
  const data = await res.json();
  return data.market ?? null;
}

export async function fetchAuditLog(): Promise<{ entries: AuditEntrySnapshot[]; topicId: string | null }> {
  const res = await fetch("/api/hedera/dvp/audit");
  return res.json();
}

/** Thrown when setup fails; `step` is the step that was running, for the progress list. */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly step: SetupStepId | null,
  ) {
    super(message);
  }
}

/**
 * Runs setup, calling `onStep` for every progress line the server streams, and resolves with the
 * new market once the last step is done.
 */
export async function setupMarket(
  onStep: (event: Extract<SetupEvent, { type: "step" }>) => void,
): Promise<MarketSnapshot> {
  const res = await fetch("/api/hedera/dvp/market", { method: "POST" });
  if (!res.ok || !res.body) throw new SetupError(`Setup request failed (${res.status})`, null);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffered += value;
    const lines = buffered.split("\n");
    buffered = done ? "" : (lines.pop() ?? "");
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as SetupEvent;
      if (event.type === "step") onStep(event);
      else if (event.type === "done") return event.market;
      else throw new SetupError(event.error, event.step);
    }
    if (done) throw new SetupError("Setup ended without a result", null);
  }
}

export async function proposeTrade(
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
  settlementMode: SettlementMode,
  settlementDelayMinutes?: number,
): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade", {
    quantity,
    price,
    buyerChoice,
    settlementMode,
    settlementDelayMinutes,
  });
  return market;
}

export async function signTrade(scheduleId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/sign", { scheduleId });
  return market;
}

export async function cancelTrade(scheduleId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/cancel", { scheduleId });
  return market;
}

export async function prepareWalletSellerPropose(
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
  settlementMode: SettlementMode,
  settlementDelayMinutes?: number,
): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/trade/wallet-seller", {
    stage: "prepare",
    quantity,
    price,
    buyerChoice,
    settlementMode,
    settlementDelayMinutes,
  });
  return transaction;
}

/** The server records the terms it prepared, not anything sent here. */
export async function completeWalletSellerPropose(transactionId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/wallet-seller", {
    stage: "complete",
    transactionId,
  });
  return market;
}

export async function prepareWalletBuyerSign(scheduleId: string): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/trade/wallet-buyer", {
    stage: "prepare",
    scheduleId,
  });
  return transaction;
}

export async function completeWalletBuyerSign(scheduleId: string, transactionId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/wallet-buyer", {
    stage: "complete",
    scheduleId,
    transactionId,
  });
  return market;
}

export async function prepareWalletSellerCancel(scheduleId: string): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/trade/wallet-seller-cancel", {
    stage: "prepare",
    scheduleId,
  });
  return transaction;
}

export async function completeWalletSellerCancel(scheduleId: string, transactionId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/wallet-seller-cancel", {
    stage: "complete",
    scheduleId,
    transactionId,
  });
  return market;
}

/** Null when the wallet already associated both tokens while onboarding for the other role. */
export async function prepareOnboardWallet(role: WalletRole, accountId: string): Promise<string | null> {
  const { transaction } = await postJson<{ transaction: string | null }>("/api/hedera/dvp/wallet/onboard", {
    stage: "prepare",
    role,
    accountId,
  });
  return transaction;
}

export async function completeOnboardWallet(
  role: WalletRole,
  accountId: string,
  transactionId: string | null,
): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/wallet/onboard", {
    stage: "complete",
    role,
    accountId,
    transactionId,
  });
  return market;
}
