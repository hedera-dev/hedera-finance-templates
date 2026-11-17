import {
  Client,
  PrecheckStatusError,
  ReceiptStatusError,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenUnfreezeTransaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import type { Desk } from "~~/app/api/hedera/audit/_lib/state";
import {
  ACTION_EVENT,
  DECISION_EVENTS,
  DECISION_OUTCOMES,
  type DecisionEvent,
  type DecisionOutcome,
  type EntryFields,
  MAX_REASON_LENGTH,
  type TokenAction,
} from "~~/services/hcsAudit/types";

export type ActionOutcome = { tx: string; result: string };

/**
 * Both `PrecheckStatusError` and `ReceiptStatusError` (the two ways the SDK
 * surfaces a non-SUCCESS network result) carry `.status` and `.transactionId`.
 * We want those regardless of success or failure: a refused action is still
 * logged, with the network's result code.
 */
function outcomeFromError(error: unknown): ActionOutcome {
  if (error instanceof ReceiptStatusError || error instanceof PrecheckStatusError) {
    return { tx: error.transactionId.toString(), result: error.status.toString() };
  }
  throw error;
}

export async function grantKyc(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenGrantKycTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function freezeHolder(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenFreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function unfreezeHolder(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenUnfreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function transferToHolder(
  client: Client,
  tokenId: string,
  issuerAccountId: string,
  holderAccountId: string,
  amount: number,
): Promise<ActionOutcome> {
  try {
    const response = await new TransferTransaction()
      .addTokenTransfer(tokenId, issuerAccountId, -amount)
      .addTokenTransfer(tokenId, holderAccountId, amount)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

/**
 * The account an action applies to: the demo holder unless the caller names another testnet
 * account. The issuer cannot target itself (it is the token's treasury and key holder).
 */
export function resolveTarget(raw: unknown, holderAccountId: string, issuerAccountId: string): string {
  if (raw === undefined || raw === null || String(raw).trim() === "") return holderAccountId;
  const id = String(raw).trim();
  if (!/^0\.0\.\d+$/.test(id)) throw new Error("Target account must look like 0.0.1234.");
  if (id === issuerAccountId) throw new Error("The issuer cannot be the target of its own token actions.");
  return id;
}

export const TOKEN_ACTIONS: readonly TokenAction[] = ["grant_kyc", "transfer", "freeze", "unfreeze"];

/**
 * The one place a token action is read off a request and performed.
 *
 * Both the Issuer route and the HashPack route go through it, so the two can never
 * drift on what they validate or in what order they touch the network: the action
 * happens, and its entry is queued from the same outcome.
 */
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

/** The fields that say why an entry exists and who stands behind it. */
export type EntryContext = { reason: string | null; authority: string | null; evidence: string | null };

export type RecordBody = {
  action?: string;
  event?: string;
  outcome?: string;
  amount?: number;
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

/**
 * Reads the three context fields off a request.
 *
 * `evidence` is a hash and only ever a hash: the browser digests the document and
 * sends the digest, so the document itself never reaches this server, let alone the
 * topic. Anything that is not a SHA-256 hex digest is refused rather than published.
 */
function parseContext(body: RecordBody | null): EntryContext {
  const rawReason = body?.reason;
  const reason =
    rawReason === undefined || rawReason === null || String(rawReason).trim() === "" ? null : String(rawReason).trim();
  if (reason !== null && reason.length > MAX_REASON_LENGTH) {
    throw new Error(`Reason must be at most ${MAX_REASON_LENGTH} characters.`);
  }

  const rawAuthority = body?.authority;
  const authority =
    rawAuthority === undefined || rawAuthority === null || String(rawAuthority).trim() === ""
      ? null
      : parseAccountId(rawAuthority, "Authority");

  const rawEvidence = body?.evidence;
  const evidence =
    rawEvidence === undefined || rawEvidence === null || String(rawEvidence).trim() === ""
      ? null
      : String(rawEvidence).trim().toLowerCase();
  if (evidence !== null && !/^[0-9a-f]{64}$/.test(evidence)) {
    throw new Error("Evidence must be a SHA-256 hash as 64 hex characters.");
  }

  return { reason, authority, evidence };
}

export function parseRecordRequest(body: RecordBody | null): RecordRequest {
  const context = parseContext(body);

  if (body?.event !== undefined) {
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

/**
 * Produces the entry that records a request, performing it on chain first when
 * there is anything to perform.
 *
 * A decision does nothing on chain by definition, so it returns immediately: the
 * entry is the only artefact it ever has. Both kinds come back as the same
 * `EntryFields` and go through the same publish queue.
 */
export async function performRecord(
  client: Client,
  desk: Desk & { tokenId: string; holderAccountId: string },
  issuerAccountId: string,
  request: RecordRequest,
): Promise<EntryFields> {
  const account = resolveTarget(request.account, desk.holderAccountId, issuerAccountId);
  const tokenId = desk.tokenId;

  if (request.kind === "decision") {
    return {
      event: request.event,
      token: tokenId,
      account,
      amount: null,
      tx: null,
      result: request.outcome,
      ...request.context,
    };
  }

  let outcome: ActionOutcome;
  if (request.action === "transfer") {
    outcome = await transferToHolder(client, tokenId, issuerAccountId, account, request.amount as number);
  } else if (request.action === "grant_kyc") {
    outcome = await grantKyc(client, tokenId, account);
  } else if (request.action === "freeze") {
    outcome = await freezeHolder(client, tokenId, account);
  } else {
    outcome = await unfreezeHolder(client, tokenId, account);
  }

  return {
    event: ACTION_EVENT[request.action],
    token: tokenId,
    account,
    amount: request.amount,
    tx: outcome.tx,
    result: outcome.result,
    ...request.context,
  };
}
