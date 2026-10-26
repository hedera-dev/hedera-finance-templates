/**
 * DTOs returned by the desk's API routes. Deliberately free of any server-only import (no SDK,
 * no key material) so this file is also safe to import from client components.
 */

export type OrderAction = "freeze" | "unfreeze" | "wipe" | "pause" | "unpause";
export type HolderId = "A" | "B";

export type ConfigStatus = { configured: boolean; missing: string[] };

export type TokenKeyName = "KYC" | "Freeze" | "Wipe" | "Pause" | "Admin";
export type TokenKeyRow = { name: TokenKeyName; isThreshold: boolean };

export type TokenView = {
  tokenId: string;
  symbol: string;
  status: "ACTIVE" | "PAUSED" | "unavailable";
  supply: string;
  keys: TokenKeyRow[] | "unavailable";
};

export type HolderView = {
  id: HolderId;
  label: string;
  accountId: string;
  kyc: "GRANTED" | "NOT_GRANTED" | "Unknown";
  frozen: "FROZEN" | "NOT_FROZEN" | "Unknown";
  balance: string;
};

export type PendingView = {
  /** A real Hedera ScheduleId (`0.0.<num>`) — see the comment atop `actions.ts` for what it schedules. */
  scheduleId: string;
  action: OrderAction;
  actionLabel: string;
  holderLabel: string | null;
  reference: string;
  signatureCount: number;
  expiresAtMs: number;
};

export type HistoryView = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  transactionId: string;
  linkKind: "transaction" | "schedule";
};

export type WalletState = { kind: "not-connected" } | { kind: "not-officer" } | { kind: "officer3"; accountId: string };

export type DeskStateView = {
  config: ConfigStatus;
  setupComplete: boolean;
  token: TokenView | null;
  holders: HolderView[];
  pending: PendingView[];
  history: HistoryView[];
  wallet: WalletState;
};
