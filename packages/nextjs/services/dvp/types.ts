// The shapes the page and the server routes agree on. Nothing here holds a key.

export type PartyId = "seller" | "buyer" | "unverified";

export type TradeState = "AWAITING PLEDGES" | "WAITING FOR THE TIME" | "READY" | "SETTLED" | "CANCELLED" | "EXPIRED";

/** `unavailable` is a read that failed: the page shows `Unknown` rather than a stale number. */
export type Unavailable = "unavailable";

export type PartyView = {
  id: PartyId;
  label: string;
  address: string;
  accountId: string | null;
  isWallet: boolean;
  kyc: boolean | Unavailable;
  securityFree: string | Unavailable;
  securityHeld: string | Unavailable;
  cashFree: string | Unavailable;
  cashHeld: string | Unavailable;
};

export type TradeView = {
  tradeId: number;
  seller: PartyId | null;
  buyer: PartyId | null;
  sellerAddress: string;
  buyerAddress: string;
  quantity: string;
  price: string;
  /** Unix seconds, or 0 for "as soon as both legs are pledged". */
  notBefore: number;
  securityPledged: boolean;
  cashPledged: boolean;
  state: TradeState;
  /** What the contract itself says about settling right now, so the page's buttons match it. */
  settleable: boolean;
  canCancel: boolean;
};

export type HistoryKind = "propose" | "pledge" | "settle" | "cancel" | "attack" | "other";

export type HistoryView = {
  at: string;
  action: string;
  reference: string | null;
  result: string;
  txHash: string | null;
  kind: HistoryKind;
};

export type MarketView = {
  security: { address: string; contractId: string; symbol: string } | null;
  cash: { proxyAddress: string; proxyContractId: string; tokenAddress: string; tokenId: string; symbol: string } | null;
  settlement: { address: string; contractId: string } | null;
};

export type WalletState =
  | { kind: "none" }
  | { kind: "buyer"; address: string }
  | { kind: "spectator"; address: string };

export type DeskView = {
  configured: boolean;
  configError: string | null;
  missing: string[];
  setupComplete: boolean;
  market: MarketView;
  parties: PartyView[];
  trades: TradeView[];
  history: HistoryView[];
  wallet: WalletState;
  /** The ticket's own limits, so the page never offers terms the contract would refuse. */
  defaults: {
    quantity: string;
    price: string;
    maxDelayMinutes: number;
    defaultDelayMinutes: number;
  };
};

export type ActionResult = {
  ok: boolean;
  txHash: string | null;
  error: string | null;
  errorName: string | null;
};
