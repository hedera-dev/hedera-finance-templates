import type { Address, Hex } from "viem";
import type { HolderId, OfficerId, OrderAction } from "~~/services/security/types";

export type OfficerRecord = {
  id: OfficerId;
  isWallet: boolean;
  address: Address;
  /** Filled in once the mirror node has indexed the address; the page shows it when it has. */
  accountId: string | null;
  /** Null only for a wallet officer: the desk never holds a wallet's private key. */
  privateKey: Hex | null;
};

export type HolderRecord = {
  id: HolderId;
  label: string;
  address: Address;
  accountId: string | null;
  privateKey: Hex;
};

export type TokenRecord = {
  address: Address;
  contractId: string;
  symbol: string;
};

export type BoardRecord = {
  address: Address;
  contractId: string;
};

export type PendingProposal = {
  /** The board's proposal id, as a decimal string. */
  proposalId: string;
  action: OrderAction;
  holderId: HolderId | null;
  reference: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** The transaction that proposed it, so the page can link the order to the ledger. */
  proposeTxHash: string;
};

export type HistoryEntry = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  txHash: string;
  /** What kind of step this was, so the tour can tell a proposal from the approval that carried it. */
  kind: "propose" | "approve" | "withdraw" | "other";
};

type DeskState = {
  officers: OfficerRecord[];
  token: TokenRecord | null;
  board: BoardRecord | null;
  holders: HolderRecord[];
  pending: PendingProposal[];
  history: HistoryEntry[];
};

/**
 * Desk state lives in server memory, as the spec allows: officer and holder identities, the token
 * and board addresses, which order a proposal carries, and case references. It is never the source
 * for anything the page claims about the chain — KYC, frozen state, balances, supply, the paused
 * flag, who holds which role, how many officers have approved all come from the token and the
 * board on every read.
 *
 * Anchored on `globalThis` because Next.js bundles each `app/api/.../route.ts` separately; a plain
 * module-level variable would not be shared across routes (or across dev-server reloads).
 */
declare global {
  var __securityDeskState: DeskState | undefined;
}

function initialState(): DeskState {
  return { officers: [], token: null, board: null, holders: [], pending: [], history: [] };
}

const state: DeskState = (globalThis.__securityDeskState ??= initialState());

export function getDeskState(): DeskState {
  return state;
}

export function resetDesk() {
  Object.assign(state, initialState());
}

export function setOfficers(officers: OfficerRecord[]) {
  state.officers = officers;
}

export function getOfficer(id: OfficerId): OfficerRecord | undefined {
  return state.officers.find(o => o.id === id);
}

/** An officer the desk can sign for, which is every officer but a wallet one. */
export function requireSigningOfficer(id: OfficerId) {
  const officer = getOfficer(id);
  if (!officer?.privateKey) throw new Error(`Officer ${id} is not an officer this desk can sign for.`);
  return { ...officer, privateKey: officer.privateKey };
}

export function setToken(token: TokenRecord) {
  state.token = token;
}

export function requireToken(): TokenRecord {
  if (!state.token) throw new Error("Set up the desk first: there is no token yet.");
  return state.token;
}

export function setBoard(board: BoardRecord) {
  state.board = board;
}

export function requireBoard(): BoardRecord {
  if (!state.board) throw new Error("Set up the desk first: there is no officer board yet.");
  return state.board;
}

export function addHolder(holder: HolderRecord) {
  if (state.holders.some(h => h.id === holder.id)) return;
  state.holders.push(holder);
}

export function getHolder(id: HolderId): HolderRecord | undefined {
  return state.holders.find(h => h.id === id);
}

export function requireHolder(id: HolderId): HolderRecord {
  const holder = getHolder(id);
  if (!holder) throw new Error(`This desk did not create holder ${id}.`);
  return holder;
}

export function addPending(entry: PendingProposal) {
  state.pending.push(entry);
}

export function getPending(proposalId: string): PendingProposal | undefined {
  return state.pending.find(p => p.proposalId === proposalId);
}

/** Refuses a proposal this desk did not create, as the spec requires of every route that acts on one. */
export function requirePending(proposalId: string): PendingProposal {
  const pending = getPending(proposalId);
  if (!pending) throw new Error(`This desk did not propose order ${proposalId}.`);
  return pending;
}

export function removePending(proposalId: string) {
  state.pending = state.pending.filter(p => p.proposalId !== proposalId);
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "timestampMs">) {
  // Anchored on the shared state (not a plain module variable) for the same reason `state` is:
  // Next.js bundles each route separately, so a module-level counter would restart at 0 per route
  // and hand out colliding ids the moment two different API routes each add a history entry.
  const id = `h${state.history.length + 1}`;
  state.history.unshift({ ...entry, id, timestampMs: Date.now() });
}
