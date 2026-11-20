import type { Address, Hex } from "viem";
import type { HistoryKind, PartyId } from "~~/services/dvp/types";

export type PartyRecord = {
  id: PartyId;
  label: string;
  address: Address;
  /** Filled in once the mirror node has indexed the address; the page shows it when it has. */
  accountId: string | null;
  /** Null only for the wallet buyer: the desk never holds a wallet's private key. */
  privateKey: Hex | null;
  isWallet: boolean;
};

export type SecurityRecord = {
  address: Address;
  contractId: string;
  symbol: string;
};

export type CashRecord = {
  /** The Stablecoin Studio proxy: roles, minting and holds happen here. */
  proxyAddress: Address;
  proxyContractId: string;
  /** The HTS token behind it: balances and association happen here. */
  tokenAddress: Address;
  tokenId: string;
  symbol: string;
};

export type SettlementRecord = {
  address: Address;
  contractId: string;
};

export type HistoryEntry = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  result: string;
  txHash: string | null;
  kind: HistoryKind;
};

type DeskState = {
  parties: PartyRecord[];
  security: SecurityRecord | null;
  cash: CashRecord | null;
  settlement: SettlementRecord | null;
  history: HistoryEntry[];
};

/**
 * Desk state lives in server memory, as the spec allows: which demo account is which party, their
 * keys, and the three addresses setup produced. It is never the source for anything the page
 * claims about the chain — balances, held amounts, KYC, which legs are pledged and each trade's
 * state all come from the two tokens and the settlement contract on every read. Trades are not
 * kept here at all: the contract numbers them and holds every term.
 *
 * Anchored on `globalThis` because Next.js bundles each `app/api/.../route.ts` separately; a plain
 * module-level variable would not be shared across routes (or across dev-server reloads).
 */
declare global {
  var __dvpDeskState: DeskState | undefined;
}

function initialState(): DeskState {
  return { parties: [], security: null, cash: null, settlement: null, history: [] };
}

const state: DeskState = (globalThis.__dvpDeskState ??= initialState());

export function getDeskState(): DeskState {
  return state;
}

export function resetDesk() {
  Object.assign(state, initialState());
}

export function setParties(parties: PartyRecord[]) {
  state.parties = parties;
}

export function getParty(id: PartyId): PartyRecord | undefined {
  return state.parties.find(p => p.id === id);
}

export function requireParty(id: PartyId): PartyRecord {
  const party = getParty(id);
  if (!party) throw new Error(`Set up the market first: there is no ${id} yet.`);
  return party;
}

/** A party the desk can sign for, which is every party but a wallet buyer. */
export function requireSigningParty(id: PartyId) {
  const party = requireParty(id);
  if (!party.privateKey) throw new Error(`The ${party.label} is a connected wallet; it signs for itself.`);
  return { ...party, privateKey: party.privateKey };
}

/** Which party an address belongs to, for labelling what the contract reports. */
export function partyForAddress(address: string): PartyRecord | undefined {
  return state.parties.find(p => p.address.toLowerCase() === address.toLowerCase());
}

export function setSecurity(security: SecurityRecord) {
  state.security = security;
}

export function requireSecurity(): SecurityRecord {
  if (!state.security) throw new Error("Set up the market first: there is no security yet.");
  return state.security;
}

export function setCash(cash: CashRecord) {
  state.cash = cash;
}

export function requireCash(): CashRecord {
  if (!state.cash) throw new Error("Set up the market first: there is no stablecoin yet.");
  return state.cash;
}

export function setSettlement(settlement: SettlementRecord) {
  state.settlement = settlement;
}

export function requireSettlement(): SettlementRecord {
  if (!state.settlement) throw new Error("Set up the market first: there is no settlement contract yet.");
  return state.settlement;
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "timestampMs">) {
  // Anchored on the shared state (not a plain module variable) for the same reason `state` is:
  // Next.js bundles each route separately, so a module-level counter would restart at 0 per route
  // and hand out colliding ids the moment two different API routes each add a history entry.
  const id = `h${state.history.length + 1}`;
  state.history.unshift({ ...entry, id, timestampMs: Date.now() });
}
