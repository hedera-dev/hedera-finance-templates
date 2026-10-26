import { base64ToBytes, parseEntryBytes, sha256Hex } from "./entry";
import { MIRROR_BASE_URL, type MirrorTopicMessage, type MirrorTransaction, fetchMirrorTransaction } from "./mirror";
import { type AuditEntry, EVENT_TRANSACTION_NAME, ZERO_HASH } from "./types";

export type FeedStatus = "VERIFIED" | "BROKEN" | "EMPTY";

export type FeedRow = {
  sequenceNumber: number;
  consensusTimestamp: string;
  payerAccountId: string;
  entry: AuditEntry | null;
  checks: { sequence: boolean; chain: boolean; transaction: boolean };
};

export type FeedResult = {
  status: FeedStatus;
  brokenAt?: { sequenceNumber: number; reason: string };
  rows: FeedRow[];
};

/**
 * Re-derives and checks the audit trail exactly as the regulator must: no
 * state is trusted except what the mirror node reports. Messages must be
 * oldest-first and contiguous from sequence 1.
 */
export async function verifyFeed(messages: MirrorTopicMessage[], baseUrl = MIRROR_BASE_URL): Promise<FeedResult> {
  if (messages.length === 0) return { status: "EMPTY", rows: [] };

  const rows: FeedRow[] = [];
  let prevBytes: Uint8Array | null = null;
  let brokenAt: { sequenceNumber: number; reason: string } | undefined;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const expectedSequence = i + 1;
    const sequenceOk = msg.sequence_number === expectedSequence;

    const bytes = base64ToBytes(msg.message);
    const entry = parseEntryBytes(bytes);

    const expectedPrev = prevBytes ? await sha256Hex(prevBytes) : ZERO_HASH;
    const chainOk = entry !== null && entry.prev === expectedPrev;

    let txOk = false;
    let txReason = "referenced transaction result does not match the entry";
    if (entry) {
      const mirrorTx = await fetchMirrorTransaction(entry.tx, baseUrl);
      const mismatch = transactionMismatch(entry, mirrorTx);
      txOk = mismatch === null;
      if (mismatch) txReason = mismatch;
    }

    rows.push({
      sequenceNumber: msg.sequence_number,
      consensusTimestamp: msg.consensus_timestamp,
      payerAccountId: msg.payer_account_id,
      entry,
      checks: { sequence: sequenceOk, chain: chainOk, transaction: txOk },
    });

    if (!brokenAt && !(sequenceOk && entry !== null && chainOk && txOk)) {
      const reason = !sequenceOk
        ? `expected sequence ${expectedSequence}, got ${msg.sequence_number}`
        : entry === null
          ? "message is not a valid audit entry"
          : !chainOk
            ? "prev does not match the hash of the previous message"
            : txReason;
      brokenAt = { sequenceNumber: msg.sequence_number, reason };
    }

    prevBytes = bytes;
  }

  return { status: brokenAt ? "BROKEN" : "VERIFIED", brokenAt, rows };
}

/**
 * Why an entry's `tx` does not back up what the entry claims, or null when it does.
 *
 * The result code alone is not enough: an authorised publisher could log
 * `freeze` / `SUCCESS` against any successful transaction on the network and the
 * trail would look verified. So the transaction has to be of the type that event
 * implies, against this entry's own token and account.
 */
function transactionMismatch(entry: AuditEntry, mirrorTx: MirrorTransaction | null): string | null {
  if (!mirrorTx) return `referenced transaction ${entry.tx} is not on the mirror node`;
  if (mirrorTx.result !== entry.result) return "referenced transaction result does not match the entry";

  const expectedName = EVENT_TRANSACTION_NAME[entry.event];
  if (mirrorTx.name !== expectedName) {
    return `${entry.event} must reference a ${expectedName}, not a ${mirrorTx.name}`;
  }

  // Token-scoped transactions name the token they act on; a transfer names none, so
  // its own legs are what tie it to this token, account and amount.
  if (expectedName !== "CRYPTOTRANSFER") {
    if (mirrorTx.entity_id !== entry.token) {
      return `referenced transaction acts on ${mirrorTx.entity_id ?? "no token"}, not ${entry.token}`;
    }
    return null;
  }

  // A refused transfer moved nothing, so there are no legs to check.
  if (entry.result !== "SUCCESS") return null;
  const credited = (mirrorTx.token_transfers ?? []).some(
    leg => leg.token_id === entry.token && leg.account === entry.account && leg.amount === entry.amount,
  );
  if (!credited) {
    return `referenced transfer does not credit ${entry.amount} of ${entry.token} to ${entry.account}`;
  }
  return null;
}
