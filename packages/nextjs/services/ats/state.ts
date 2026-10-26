// Server-only: the desk's in-memory state (bond, demo/wallet investors, activity log). Kept in
// server memory per the spec; it need not survive a restart. Stashed on `globalThis` so Next's
// dev-mode module reloading can't give route handlers separate copies of the singleton.
import type { Address } from "viem";

export type ActivityEntry = {
  id: string;
  time: string;
  action: string;
  result: string;
  txHash?: string;
};

export type InvestorLabel = "Investor A" | "Investor B" | "Your wallet";

export type InvestorRecord = {
  label: InvestorLabel;
  address: Address;
  hederaAccountId: string | null;
};

export type BondRecord = {
  address: Address;
  contractId: string;
  name: string;
  symbol: string;
  isin: string;
  currency: string;
  faceValue: number;
  startingDateIso: string;
  maturityDateIso: string;
  maxSupply: number;
};

export type DeskState = {
  bond: BondRecord | null;
  investors: InvestorRecord[];
  activity: ActivityEntry[];
};

const GLOBAL_KEY = "__atsBondDesk__";

function createDesk(): DeskState {
  return { bond: null, investors: [], activity: [] };
}

function getStash(): DeskState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DeskState };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createDesk();
  return g[GLOBAL_KEY];
}

export function getDesk(): DeskState {
  return getStash();
}

/** Issuing again resets the desk entirely to the freshly-deployed bond. */
export function resetDesk(bond: BondRecord): DeskState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DeskState };
  g[GLOBAL_KEY] = { bond, investors: [], activity: [] };
  return g[GLOBAL_KEY];
}

export function addInvestor(investor: InvestorRecord): void {
  const desk = getStash();
  const existingIndex = desk.investors.findIndex(i => i.address.toLowerCase() === investor.address.toLowerCase());
  if (existingIndex >= 0) {
    desk.investors[existingIndex] = investor;
  } else {
    desk.investors.push(investor);
  }
}

/**
 * Records the connected wallet, replacing any wallet recorded before it. The desk follows one
 * wallet at a time and the row is labelled `Your wallet`; keeping an older one left two rows
 * with that label, only one of which was yours.
 */
export function setWalletInvestor(investor: InvestorRecord): void {
  const desk = getStash();
  desk.investors = desk.investors.filter(
    i => i.label !== "Your wallet" || i.address.toLowerCase() === investor.address.toLowerCase(),
  );
  addInvestor(investor);
}

export function findInvestor(address: string): InvestorRecord | undefined {
  return getStash().investors.find(i => i.address.toLowerCase() === address.toLowerCase());
}

let activitySeq = 0;

export function addActivity(entry: Omit<ActivityEntry, "id" | "time">): ActivityEntry {
  const desk = getStash();
  const full: ActivityEntry = { ...entry, id: `${Date.now()}-${activitySeq++}`, time: new Date().toISOString() };
  desk.activity.unshift(full);
  return full;
}
