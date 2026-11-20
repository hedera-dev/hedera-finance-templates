/**
 * DTOs returned by the desk's API routes. Deliberately free of any server-only import (no viem
 * clients, no key material, no `node:fs`) so this file is also safe to import from client
 * components.
 */

export type OrderAction = "freeze" | "unfreeze" | "redeem" | "revokeKyc" | "pause" | "unpause";
export type HolderId = "A" | "B";
export type OfficerId = "1" | "2" | "3";

export type ConfigStatus = { configured: boolean; missing: string[] };

/** The four compliance roles the board holds. */
export type RoleName = "KYC" | "Freeze" | "Controller" | "Pause";

/**
 * One role, as read from the token. `heldByBoard` and `heldByAnyOfficer` are separate reads
 * because the claim worth making is both: the board can act, and no officer can.
 */
export type TokenRoleRow = { name: RoleName; heldByBoard: boolean; heldByAnyOfficer: boolean };

export type TokenView = {
  contractId: string;
  address: string;
  symbol: string;
  status: "ACTIVE" | "PAUSED" | "unavailable";
  supply: string;
  roles: TokenRoleRow[] | "unavailable";
};

export type OfficerView = {
  id: OfficerId;
  label: string;
  address: string;
  /** Null when the mirror node has not indexed the address yet. */
  accountId: string | null;
  isWallet: boolean;
};

export type BoardView = {
  contractId: string;
  address: string;
  officers: OfficerView[];
  approvalsRequired: number;
};

export type HolderView = {
  id: HolderId;
  label: string;
  accountId: string | null;
  address: string;
  kyc: "GRANTED" | "NOT_GRANTED" | "Unknown";
  frozen: "FROZEN" | "NOT_FROZEN" | "Unknown";
  balance: string;
};

export type PendingView = {
  /** The board's own proposal id, as a decimal string. */
  proposalId: string;
  action: OrderAction;
  actionLabel: string;
  holderLabel: string | null;
  reference: string;
  /** "unknown" when the board could not be read just now; never a guessed number. */
  approvals: number | "unknown";
  /** Which officers have approved, by label, so the page can say who is still missing. */
  approvedBy: string[];
  expiresAtMs: number;
  /** The transaction that proposed the order. */
  proposeTxHash: string;
};

export type HistoryView = {
  id: string;
  timestampMs: number;
  action: string;
  reference: string | null;
  /** `SUCCESS`, or the name of the error the contract returned. */
  result: string;
  /** Empty when the action never reached the chain. */
  txHash: string;
  kind: "propose" | "approve" | "withdraw" | "other";
};

/** `unknown` is a connected wallet whose role the desk could not check, which is not the same as not being an officer. */
export type WalletState =
  | { kind: "not-connected" }
  | { kind: "not-officer" }
  | { kind: "unknown" }
  | { kind: "officer3"; address: string; accountId: string | null };

export type DeskStateView = {
  config: ConfigStatus;
  setupComplete: boolean;
  token: TokenView | null;
  board: BoardView | null;
  holders: HolderView[];
  pending: PendingView[];
  history: HistoryView[];
  wallet: WalletState;
};
