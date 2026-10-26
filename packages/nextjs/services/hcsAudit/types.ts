// Shared, isomorphic domain types for the HCS audit trail. No secrets, no SDK
// imports here: this file is imported by both server routes and the browser
// (the regulator feed reads the mirror node directly from the client).

export type AuditEvent = "issue" | "grant_kyc" | "transfer" | "freeze" | "unfreeze";

export const AUDIT_EVENTS: readonly AuditEvent[] = ["issue", "grant_kyc", "transfer", "freeze", "unfreeze"];

/** The exact shape of every HCS audit message, field order matters for hashing. */
export type AuditEntry = {
  v: 1;
  event: AuditEvent;
  token: string;
  account: string | null;
  amount: number | null;
  tx: string;
  result: string;
  prev: string;
};

/** Everything in an entry except the two fields the chain itself owns. */
export type EntryFields = Omit<AuditEntry, "v" | "prev">;

/**
 * The mirror node transaction type each event must reference. Checked by the
 * regulator's feed: without it an entry could claim `freeze` while pointing at
 * any successful transaction at all, and the feed would still call it verified.
 */
export const EVENT_TRANSACTION_NAME: Record<AuditEvent, string> = {
  issue: "TOKENCREATION",
  grant_kyc: "TOKENGRANTKYC",
  transfer: "CRYPTOTRANSFER",
  freeze: "TOKENFREEZE",
  unfreeze: "TOKENUNFREEZE",
};

export const ZERO_HASH = "0".repeat(64);

export type TokenAction = "grant_kyc" | "transfer" | "freeze" | "unfreeze";

export const ACTION_EVENT: Record<TokenAction, AuditEvent> = {
  grant_kyc: "grant_kyc",
  transfer: "transfer",
  freeze: "freeze",
  unfreeze: "unfreeze",
};

export type SigningMode = "issuer" | "hashpack";

export type Publisher = {
  accountId: string;
  role: "issuer" | "hashpack";
};

/** Setup progress step ids, in the order they must complete. */
export type SetupStepId = "topic" | "token" | "holder" | "associate";

export type SetupStepStatus = "pending" | "active" | "done" | "failed";

export type SetupEvent =
  | { type: "step"; step: SetupStepId; status: "active" }
  | { type: "step"; step: SetupStepId; status: "done"; id?: string }
  | { type: "step"; step: SetupStepId; status: "failed"; error: string }
  | { type: "complete"; topicId: string; tokenId: string; holderAccountId: string }
  | { type: "error"; message: string };

export type DeskState = {
  configured: boolean;
  network: "testnet";
  topicId: string | null;
  tokenId: string | null;
  holderAccountId: string | null;
  publishers: Publisher[];
};
