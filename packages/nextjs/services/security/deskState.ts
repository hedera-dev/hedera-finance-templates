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
  /** A real Hedera `ScheduleId` (`0.0.<num>`) — see the comment atop `actions.ts` for what it schedules. */
  scheduleId: string;
  action: OrderAction;
  holderId: HolderId | null;
  reference: string;
  createdAtMs: number;
  expiresAtMs: number;
  /**
   * Set only while a wallet-officer approval is in flight: when the desk handed the browser the
   * schedule-signing transaction. The wallet's signature is what executes the record schedule, so
   * this is how the poll knows an executed schedule means "mid-handshake", not "order carried
   * out". Cleared when that approval finishes, either way.
   */
  walletApprovalStartedAtMs?: number;
};

export type HistoryEntry = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  transactionId: string;
  /** Whether `transactionId` is a transaction id or a schedule id — HashScan needs different paths. */
  linkKind: "transaction" | "schedule";
};

type DeskState = {
  officers: OfficerRecord[];
  token: TokenRecord | null;
  /** The account whose key is the 2-of-3 threshold KeyList, used only to carry schedules — see `actions.ts`. */
  recordAccountId: string | null;
  holders: HolderRecord[];
  pending: PendingApproval[];
  history: HistoryEntry[];
};

/**
 * Desk state lives in server memory, as the spec allows: officer and holder identities, the
 * token id, the record account id, pending orders, and case references. It is never the source
 * for anything the page claims about the chain (KYC, frozen state, balances, supply, pause
 * status, schedule signature counts) — the mirror node is, on every read.
 *
 * Anchored on `globalThis` because Next.js bundles each `app/api/.../route.ts` separately; a
 * plain module-level variable would not be shared across routes (or across dev-server reloads).
 */
declare global {
  var __securityDeskState: DeskState | undefined;
}

function initialState(): DeskState {
  return { officers: [], token: null, recordAccountId: null, holders: [], pending: [], history: [] };
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

export function setRecordAccount(accountId: string) {
  state.recordAccountId = accountId;
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

export function setWalletApprovalStarted(scheduleId: string, atMs: number | undefined) {
  const pending = getPending(scheduleId);
  if (pending) pending.walletApprovalStartedAtMs = atMs;
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "timestampMs">) {
  // Anchored on the shared state (not a plain module variable) for the same reason `state` is:
  // Next.js bundles each route separately, so a module-level counter would restart at 0 per route
  // and hand out colliding ids (two different rows both `"h1"`) the moment two different API
  // routes each add a history entry.
  const id = `h${state.history.length + 1}`;
  state.history.unshift({ ...entry, id, timestampMs: Date.now() });
}
