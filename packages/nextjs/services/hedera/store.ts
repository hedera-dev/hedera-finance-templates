/**
 * In-memory DvP market state. Server-only — demo account private keys live
 * here and must never be serialized into an API response. Surviving a
 * server restart is explicitly not required.
 */
import type { PendingAuditEvent } from "~~/services/hedera/audit";
import type { BuyerChoice, SettlementMode, TradeStatus, WalletRole } from "~~/services/hedera/types";

export type { BuyerChoice, SettlementMode, TradeStatus, WalletRole };

export type DemoParty = {
  accountId: string;
  /** Hex-encoded ECDSA private key. Never put this on an API response. */
  privateKey: string;
};

export type WalletParty = {
  accountId: string;
};

export type PendingWalletAction =
  | {
      type: "onboard";
      role: WalletRole;
      accountId: string;
      associationVerified?: boolean;
      kycGranted?: boolean;
      minted?: boolean;
      funded?: boolean;
      transactionBase64?: string;
      mintTransactionId?: string;
      fundingTransactionId?: string;
      processing?: boolean;
    }
  | {
      type: "propose";
      quantity: number;
      price: number;
      buyerChoice: BuyerChoice;
      settlementMode: SettlementMode;
      sellerAccountId: string;
      buyerAccountId: string;
      buyerIsWallet: boolean;
      expiresAt: string;
      settlesAt: string | null;
      processing?: boolean;
    }
  | {
      type: "sign";
      scheduleId: string;
      accountId: string;
      processing?: boolean;
    }
  | {
      type: "cancel";
      scheduleId: string;
      accountId: string;
      processing?: boolean;
    };

export type Trade = {
  scheduleId: string;
  scheduledTransactionId: string;
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  sellerAccountId: string;
  buyerAccountId: string;
  /** True once the seller leg was signed by a connected wallet instead of the demo seller. */
  sellerIsWallet: boolean;
  /** True once the buyer leg is to be signed by a connected wallet instead of the demo buyer. */
  buyerIsWallet: boolean;
  status: TradeStatus;
  settlementResult: string | null;
  settlementMode: SettlementMode;
  /** ISO timestamp: the schedule's explicit expiration time. */
  expiresAt: string;
  /** ISO timestamp the trade settles at, for `atTime` trades; null for `onSignature`. */
  settlesAt: string | null;
  /** ISO timestamp the trade was proposed at. */
  proposedAt: string;
  /** Internal: claims this trade for one in-flight settlement, so a race never finalizes it twice. */
  finalizing?: boolean;
};

export type Market = {
  securityTokenId: string;
  paymentTokenId: string;
  auditTopicId: string | null;
  /** Lowercase hex SHA-256 of the previous audit entry's message bytes, or 64 zeros. */
  auditPrevHash: string;
  /** Serializes audit publishes so the `prev` hash chain never races itself. */
  auditQueue: Promise<void>;
  /** Entries waiting for HCS. Retried by the reconciler until they are published in order. */
  pendingAuditEvents: PendingAuditEvent[];
  seller: DemoParty;
  buyer: DemoParty;
  unverifiedBuyer: DemoParty;
  walletSeller: WalletParty | null;
  walletBuyer: WalletParty | null;
  /** Every trade of this market, oldest first. */
  trades: Trade[];
  /** Server-prepared wallet actions, keyed by their exact Hedera transaction id. */
  pendingWalletActions: Record<string, PendingWalletAction>;
};

declare global {
  var __dvpMarket: Market | undefined;
}

export function getMarket(): Market | null {
  return globalThis.__dvpMarket ?? null;
}

export function requireMarket(): Market {
  const market = getMarket();
  if (!market) throw new Error("No market has been set up yet. Press Set up market first.");
  return market;
}

export function setMarket(market: Market): void {
  globalThis.__dvpMarket = market;
}

export function findTrade(market: Market, scheduleId: string): Trade {
  const trade = market.trades.find(t => t.scheduleId === scheduleId);
  if (!trade) throw new Error(`No trade with schedule ${scheduleId} in the current market.`);
  return trade;
}

export const SECURITY_DECIMALS = 0;
export const PAYMENT_DECIMALS = 6;
