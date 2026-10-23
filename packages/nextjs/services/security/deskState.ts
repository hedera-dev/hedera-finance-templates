import type { PrivateKey, PublicKey } from "@hiero-ledger/sdk";

export type OfficerId = "1" | "2" | "3";
export type HolderId = "A" | "B";
export type OrderAction = "freeze" | "unfreeze" | "wipe" | "pause" | "unpause";

export type OfficerRecord = {
  id: OfficerId;
  isWallet: boolean;
  /** Set only for a wallet officer — the account the mirror node reports the key for. */
  accountId: string | null;
  publicKey: PublicKey;
  /** Null only for a wallet officer: the desk never holds a wallet's private key. */
  privateKey: PrivateKey | null;
};

export type HolderRecord = {
  id: HolderId;
  label: string;
  accountId: string;
};

export type TokenRecord = {
  tokenId: string;
  symbol: string;
};

export type PendingApproval = {
  scheduleId: string;
  action: OrderAction;
  holderId: HolderId | null;
  reference: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** The transaction id the wrapped transaction will execute under once the schedule triggers. */
  scheduledTransactionId: string;
};

export type HistoryEntry = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  transactionId: string;
  linkKind: "transaction" | "schedule";
};

type DeskState = {
  officers: OfficerRecord[];
  token: TokenRecord | null;
  holders: HolderRecord[];
  pending: PendingApproval[];
  history: HistoryEntry[];
};

/**
 * Desk state lives in server memory, as the spec allows: officer and holder identities, the
 * token id, pending schedule ids, and case references. It is never the source for anything the
 * page claims about the chain (KYC, frozen state, balances, supply, pause status, signature
 * counts) — the mirror node is, on every read.
 *
 * Anchored on `globalThis` because Next.js bundles each `app/api/.../route.ts` separately; a
 * plain module-level variable would not be shared across routes (or across dev-server reloads).
 */
declare global {
  var __securityDeskState: DeskState | undefined;
}

function initialState(): DeskState {
  return { officers: [], token: null, holders: [], pending: [], history: [] };
}

const state: DeskState = (globalThis.__securityDeskState ??= initialState());

export function getDeskState(): DeskState {
  return state;
}

export function setOfficers(officers: OfficerRecord[]) {
  state.officers = officers;
}

export function getOfficer(id: OfficerId): OfficerRecord | undefined {
  return state.officers.find(o => o.id === id);
}

export function setToken(token: TokenRecord) {
  state.token = token;
}

export function addHolder(holder: HolderRecord) {
  if (state.holders.some(h => h.id === holder.id)) return;
  state.holders.push(holder);
}

export function getHolder(id: HolderId): HolderRecord | undefined {
  return state.holders.find(h => h.id === id);
}

export function addPending(entry: PendingApproval) {
  state.pending.push(entry);
}

export function getPending(scheduleId: string): PendingApproval | undefined {
  return state.pending.find(p => p.scheduleId === scheduleId);
}

export function removePending(scheduleId: string) {
  state.pending = state.pending.filter(p => p.scheduleId !== scheduleId);
}

let historySeq = 0;

export function addHistory(entry: Omit<HistoryEntry, "id" | "timestampMs">) {
  state.history.unshift({ ...entry, id: `h${++historySeq}`, timestampMs: Date.now() });
}
