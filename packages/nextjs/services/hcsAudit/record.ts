// Reading a record request off the wire, and nothing else: no SDK, no server state.
// Kept apart from `_lib/actions.ts` so the validation that guards the topic can be
// tested on its own — it is the boundary between a request and a published entry.
import {
  DECISION_EVENTS,
  DECISION_OUTCOMES,
  type DecisionEvent,
  type DecisionOutcome,
  MAX_REASON_LENGTH,
  type TokenAction,
} from "./types";

export const TOKEN_ACTIONS: readonly TokenAction[] = ["grant_kyc", "transfer", "freeze", "unfreeze"];

/** The fields that say why an entry exists and who stands behind it. */
export type EntryContext = { reason: string | null; authority: string | null; evidence: string | null };

export type ActionRequest = {
  kind: "action";
  action: TokenAction;
  amount: number | null;
  account?: unknown;
  context: EntryContext;
};

/** A decision taken off chain. Nothing is performed; the entry *is* the record. */
export type DecisionRequest = {
  kind: "decision";
  event: DecisionEvent;
  outcome: DecisionOutcome;
  account?: unknown;
  context: EntryContext;
};

export type RecordRequest = ActionRequest | DecisionRequest;

/** A request as it arrives: `kind` says which of the two it is, the rest is unchecked. */
export type RecordBody = {
  kind?: unknown;
  action?: unknown;
  event?: unknown;
  outcome?: unknown;
  amount?: unknown;
  account?: unknown;
  reason?: unknown;
  authority?: unknown;
  evidence?: unknown;
};

function parseAccountId(raw: unknown, field: string): string {
  const id = String(raw).trim();
  if (!/^0\.0\.\d+$/.test(id)) throw new Error(`${field} must look like 0.0.1234.`);
  return id;
}

const blank = (raw: unknown): boolean => raw === undefined || raw === null || String(raw).trim() === "";

/**
 * Reads the three context fields off a request.
 *
 * `evidence` is a hash and only ever a hash: the browser digests the document and
 * sends the digest, so the document itself never reaches this server, let alone the
 * topic. Anything that is not a SHA-256 hex digest is refused rather than published.
 */
function parseContext(body: RecordBody | null): EntryContext {
  const reason = blank(body?.reason) ? null : String(body?.reason).trim();
  if (reason !== null && reason.length > MAX_REASON_LENGTH) {
    throw new Error(`Reason must be at most ${MAX_REASON_LENGTH} characters.`);
  }

  const authority = blank(body?.authority) ? null : parseAccountId(body?.authority, "Authority");

  const evidence = blank(body?.evidence) ? null : String(body?.evidence).trim().toLowerCase();
  if (evidence !== null && !/^[0-9a-f]{64}$/.test(evidence)) {
    throw new Error("Evidence must be a SHA-256 hash as 64 hex characters.");
  }

  return { reason, authority, evidence };
}

/**
 * Turns a request into one of the two kinds of record, or throws.
 *
 * `kind` is the discriminator the desk sends and the only one read here: sniffing
 * which fields happen to be present would let a request with both an action and a
 * decision event be taken for whichever the check looked at first.
 */
export function parseRecordRequest(body: RecordBody | null): RecordRequest {
  const context = parseContext(body);

  if (body?.kind === "decision") {
    const event = body.event as DecisionEvent;
    if (!DECISION_EVENTS.includes(event)) throw new Error("Unknown decision.");
    const outcome = body.outcome as DecisionOutcome;
    if (!DECISION_OUTCOMES.includes(outcome)) throw new Error("A decision must record PASSED or REFUSED.");
    // Enforced here as well as in the verifier, so the desk never publishes an entry
    // its own regulator feed would call broken.
    if (!context.evidence) throw new Error("A decision needs the document behind it.");
    if (!context.authority) throw new Error("A decision needs the authority that approved it.");
    return { kind: "decision", event, outcome, account: body?.account, context };
  }

  const action = body?.action as TokenAction | undefined;
  if (!action || !TOKEN_ACTIONS.includes(action)) throw new Error("Unknown action.");
  if (action !== "transfer") return { kind: "action", action, amount: null, account: body?.account, context };
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Transfer amount must be a positive whole number.");
  }
  return { kind: "action", action, amount, account: body?.account, context };
}
