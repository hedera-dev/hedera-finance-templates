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
  /**
   * Not a Hedera `ScheduleId` — the admin transaction's own `TransactionId` (as a string), chosen
   * when Officer 1 proposes it. See the comment atop `actions.ts` for why: the five order types
   * here cannot be carried by the Schedule Service on live Hedera today. This id is what the page
   * shows under `data-schedule`, what `#pending-approvals` links to HashScan with, and what the
   * same transaction keeps once Officer 2 (or the wallet) finishes and submits it.
   */
  scheduleId: string;
  action: OrderAction;
  holderId: HolderId | null;
  reference: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** The frozen transaction, carrying Officer 1's signature, awaiting a second before it can submit. */
  transactionBytes: Uint8Array;
};

export type HistoryEntry = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  transactionId: string;
  linkKind: "transaction";
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
 * token id, pending orders (including the partially-signed transaction bytes behind them — see
 * the comment atop `actions.ts`), and case references. It is never the source for anything the
 * page claims about the chain (KYC, frozen state, balances, supply, pause status) — the mirror
 * node is, on every read.
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

export function addHistory(entry: Omit<HistoryEntry, "id" | "timestampMs">) {
  // Anchored on the shared state (not a plain module variable) for the same reason `state` is:
  // Next.js bundles each route separately, so a module-level counter would restart at 0 per route
  // and hand out colliding ids (two different rows both `"h1"`) the moment two different API
  // routes each add a history entry.
  const id = `h${state.history.length + 1}`;
  state.history.unshift({ ...entry, id, timestampMs: Date.now() });
}
