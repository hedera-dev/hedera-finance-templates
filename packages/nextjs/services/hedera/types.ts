/**
 * Shapes shared between the DvP server logic and the client page. Pure types only —
 * safe to import from a client component, unlike `~~/services/hedera/dvp` or `store`.
 */

export type BuyerChoice = "buyer" | "unverifiedBuyer" | "wallet";
export type WalletRole = "seller" | "buyer";
export type TradeStatus = "PENDING" | "SCHEDULED" | "SETTLED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type SettlementMode = "onSignature" | "atTime";

export type PartyBalances = { security: string; payment: string };
export type PartySnapshot = { accountId: string; balances: PartyBalances };

/** What setup hands out: shared by the server (which funds) and the page (which explains it). */
export const SELLER_INITIAL_SECURITY = 200;
export const BUYER_INITIAL_PAYMENT = 20000;
export const UNVERIFIED_BUYER_INITIAL_PAYMENT = 10000;

/** A trade settling on the Buyer's signature expires this long after it is proposed. */
export const ON_SIGNATURE_EXPIRY_MINUTES = 30;

export type TradeSnapshot = {
  scheduleId: string;
  status: TradeStatus;
  settlementResult: string | null;
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  sellerIsWallet: boolean;
  buyerIsWallet: boolean;
  settlementMode: SettlementMode;
  /** ISO timestamp. For `atTime` trades this is also when the schedule is set to execute. */
  expiresAt: string;
  /** ISO timestamp the trade settles at, or null when it settles on the Buyer's signature instead. */
  settlesAt: string | null;
  /** ISO timestamp the trade was proposed at. */
  proposedAt: string;
};

export type AuditEntrySnapshot = {
  sequenceNumber: number;
  /** ISO timestamp of the entry's consensus time. */
  consensusTime: string;
  event: string;
  schedule: string;
  result: string | null;
  /** The Hedera transaction id the event is about, or null (e.g. for `expired`). */
  tx: string | null;
};

export type MarketSnapshot = {
  securityTokenId: string;
  paymentTokenId: string;
  auditTopicId: string | null;
  seller: PartySnapshot;
  buyer: PartySnapshot;
  unverifiedBuyer: PartySnapshot;
  walletSeller: PartySnapshot | null;
  walletBuyer: PartySnapshot | null;
  /** Every trade of the current market, newest first. */
  trades: TradeSnapshot[];
};
