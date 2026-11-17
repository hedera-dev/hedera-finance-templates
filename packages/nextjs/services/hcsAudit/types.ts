// Shared, isomorphic domain types for the HCS audit trail. No secrets, no SDK
// imports here: this file is imported by both server routes and the browser
// (the regulator feed reads the mirror node directly from the client).

/** Events that record something the network did. Each one cites its transaction. */
export type LedgerEvent = "issue" | "grant_kyc" | "transfer" | "freeze" | "unfreeze";

/**
 * Events that record a decision taken off chain, which the ledger cannot hold at
 * all: a KYC review, a sanctions screening, a board approval. Nothing executes, so
 * these carry no transaction — what they carry instead is the reason, the authority
 * that approved it, and the hash of the document behind it.
 */
export type DecisionEvent = "kyc_review" | "sanctions_check" | "approval";

export type AuditEvent = LedgerEvent | DecisionEvent;

export const LEDGER_EVENTS: readonly LedgerEvent[] = ["issue", "grant_kyc", "transfer", "freeze", "unfreeze"];

export const DECISION_EVENTS: readonly DecisionEvent[] = ["kyc_review", "sanctions_check", "approval"];

export const AUDIT_EVENTS: readonly AuditEvent[] = [...LEDGER_EVENTS, ...DECISION_EVENTS];

export function isDecisionEvent(event: AuditEvent): event is DecisionEvent {
  return (DECISION_EVENTS as readonly string[]).includes(event);
}

/** What an officer concluded. Sits in `result`, where a ledger event puts the network's status. */
export type DecisionOutcome = "PASSED" | "REFUSED";

export const DECISION_OUTCOMES: readonly DecisionOutcome[] = ["PASSED", "REFUSED"];

/** The exact shape of every HCS audit message, field order matters for hashing. */
export type AuditEntry = {
  v: 2;
  event: AuditEvent;
  token: string;
  account: string | null;
  amount: number | null;
  /** The transaction the entry is about, or null for a decision event: nothing executed. */
  tx: string | null;
  /** The network's status for a ledger event, the officer's outcome for a decision. */
  result: string;
  /** Why it happened: a case reference, a ticket, the instruction behind it. */
  reason: string | null;
  /** The account the publisher says authorised it. A claim, not a proof — see `verify.ts`. */
  authority: string | null;
  /** SHA-256 of a supporting document, hashed in the browser. The document never leaves it. */
  evidence: string | null;
  prev: string;
};

/** Everything in an entry except the two fields the chain itself owns. */
export type EntryFields = Omit<AuditEntry, "v" | "prev">;

/** The free-text fields are capped so one entry stays well inside a single HCS message. */
export const MAX_REASON_LENGTH = 200;

/**
 * The mirror node transaction type each ledger event must reference. Checked by the
 * regulator's feed: without it an entry could claim `freeze` while pointing at
 * any successful transaction at all, and the feed would still call it verified.
 */
export const EVENT_TRANSACTION_NAME: Record<LedgerEvent, string> = {
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

/** What the desk asks the server to record: a token action, or a decision. */
export type RecordPayload = { reason?: string; authority?: string; evidence?: string } & (
  | { kind: "action"; action: TokenAction; amount?: number; account?: string }
  | { kind: "decision"; event: DecisionEvent; outcome: DecisionOutcome; account?: string }
);

/** Identifies which control is mid-flight: a token action id, or a decision event. */
export type BusyRecord = TokenAction | DecisionEvent;

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
