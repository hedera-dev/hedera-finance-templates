/**
 * Desk state (stablecoin id, demo investors, current bond) lives in server memory, as allowed
 * by the spec. Kept on `globalThis` so it survives Next.js dev-server module reloads.
 */

export type DemoInvestor = {
  id: "A" | "B";
  label: "Investor A" | "Investor B";
  accountId: string;
  evmAddress: `0x${string}`;
  defaultUnits: number;
};

export type Stablecoin = {
  tokenId: string;
  evmAddress: `0x${string}`;
  decimals: number;
  symbol: string;
};

/** The bonds the tour issued, one per chapter, so its step follows the chain rather than the tab. */
export type TourBonds = { main?: `0x${string}`; miss?: `0x${string}` };

export type DeskState = {
  stablecoin?: Stablecoin;
  investors: DemoInvestor[];
  /** Raw ECDSA hex by investor id, for the tour's attacks. Never sent to the browser. */
  investorKeys: Partial<Record<DemoInvestor["id"], string>>;
  currentBond?: `0x${string}`;
  bonds: `0x${string}`[];
  tourBonds: TourBonds;
};

const KEY = "__couponDeskState__" as const;

export function getDeskState(): DeskState {
  const g = globalThis as unknown as Record<string, DeskState>;
  if (!g[KEY]) g[KEY] = { investors: [], investorKeys: {}, bonds: [], tourBonds: {} };
  return g[KEY];
}

export function setStablecoin(stablecoin: Stablecoin) {
  getDeskState().stablecoin = stablecoin;
}

export function setInvestors(investors: DemoInvestor[]) {
  getDeskState().investors = investors;
}

export function setCurrentBond(address: `0x${string}`, tourRole?: keyof TourBonds) {
  const state = getDeskState();
  state.currentBond = address;
  if (!isKnownBond(address)) state.bonds.push(address);
  if (tourRole) state.tourBonds[tourRole] = address;
}

/** True for a bond this desk issued. Addresses from a URL are not otherwise trustworthy. */
export function isKnownBond(address: string): boolean {
  return getDeskState().bonds.some(known => known.toLowerCase() === address.toLowerCase());
}

/**
 * The bond a route was asked to act on, or an error naming why not.
 *
 * Every bond route takes its address from the URL and hands it to the operator's key. Without
 * this, `fund` would send stablecoin and HBAR to any address asked for — and the HBAR amount
 * is read from that address's own `couponCount`, so a contract could name its own price.
 */
export function requireKnownBond(address: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("That is not a valid bond address.");
  if (!isKnownBond(address)) throw new Error("That address is not a bond this desk issued.");
  return address as `0x${string}`;
}
