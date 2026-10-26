/**
 * The HCS audit trail: one entry per event in a trade's life, chained by the SHA-256 of the
 * previous entry's exact message bytes so the log can be verified independently from the mirror
 * node, without trusting this server.
 */
import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionId,
  TransactionReceiptQuery,
} from "@hiero-ledger/sdk";
import { createHash } from "node:crypto";
import { fetchTopicMessages, mirrorTimestampToIso } from "~~/services/hedera/mirror";
import type { Market } from "~~/services/hedera/store";
import type { AuditEntrySnapshot } from "~~/services/hedera/types";

export const GENESIS_HASH = "0".repeat(64);

export type AuditEvent = "proposed" | "signed" | "settled" | "rejected" | "cancelled" | "expired";

type AuditMessage = {
  v: 1;
  event: AuditEvent;
  schedule: string;
  quantity: number;
  price: number;
  seller: string;
  buyer: string;
  tx: string | null;
  result: string | null;
  prev: string;
};

export type AuditFields = Omit<AuditMessage, "v" | "prev">;
export type PendingAuditEvent = { fields: AuditFields; transactionId: string | null };

function transactionIdExpired(transactionId: string): boolean {
  const validStart = transactionId.split("@")[1]?.split("?")[0];
  if (!validStart) return true;
  const [seconds, nanos = "0"] = validStart.split(".");
  const startedAt = Number(seconds) * 1000 + Number(nanos) / 1e6;
  return !Number.isFinite(startedAt) || Date.now() - startedAt > 125_000;
}

/** Creates the market's audit topic, submit key held by the operator. */
export async function createAuditTopic(client: Client): Promise<string> {
  const operatorKey = client.operatorPublicKey;
  if (!operatorKey) throw new Error("Operator key is not available on the client");
  const receipt = await (
    await new TopicCreateTransaction().setSubmitKey(operatorKey).setTopicMemo("DvP audit log").execute(client)
  ).getReceipt(client);
  if (!receipt.topicId) throw new Error("Topic creation did not return a topic id");
  return receipt.topicId.toString();
}

/**
 * Flushes queued entries and advances the `prev` hash after each confirmed HCS submission.
 * Calls serialize through `market.auditQueue`, so concurrent events stay in order.
 */
export function flushAuditEvents(client: Client, market: Market): Promise<void> {
  const task = market.auditQueue.then(async () => {
    while (market.auditTopicId && market.pendingAuditEvents.length > 0) {
      const pending = market.pendingAuditEvents[0];
      const message: AuditMessage = { v: 1, prev: market.auditPrevHash, ...pending.fields };
      const bytes = Buffer.from(JSON.stringify(message), "utf8");
      const operatorId = client.operatorAccountId;
      if (!operatorId) throw new Error("Operator account id is not available on the client");
      const wasSubmitted = pending.transactionId != null;
      const transactionId = pending.transactionId
        ? TransactionId.fromString(pending.transactionId)
        : TransactionId.generate(operatorId);
      pending.transactionId = transactionId.toString();

      let confirmed = false;
      let failedStatus: string | null = null;
      if (wasSubmitted) {
        try {
          const receipt = await new TransactionReceiptQuery()
            .setTransactionId(transactionId)
            .setValidateStatus(false)
            .execute(client);
          confirmed = receipt.status.toString() === "SUCCESS";
          if (!confirmed) {
            failedStatus = receipt.status.toString();
            pending.transactionId = null;
          }
        } catch {
          // Not indexed yet (or never submitted); submit the exact queued transaction below.
          if (pending.transactionId && transactionIdExpired(pending.transactionId)) {
            failedStatus = "TRANSACTION_EXPIRED";
            pending.transactionId = null;
          }
        }
      }
      if (failedStatus) throw new Error(`Queued audit submission failed with ${failedStatus}; retrying with a new id.`);
      if (!confirmed) {
        try {
          await (
            await new TopicMessageSubmitTransaction()
              .setTopicId(market.auditTopicId)
              .setMessage(bytes)
              .setTransactionId(transactionId)
              .execute(client)
          ).getReceipt(client);
        } catch (submitError) {
          const receipt = await new TransactionReceiptQuery()
            .setTransactionId(transactionId)
            .setValidateStatus(false)
            .execute(client)
            .catch(() => null);
          if (receipt?.status.toString() !== "SUCCESS") throw submitError;
        }
      }
      market.auditPrevHash = createHash("sha256").update(bytes).digest("hex");
      market.pendingAuditEvents.shift();
    }
  });
  market.auditQueue = task.catch(() => undefined);
  return task;
}

/** Queues an entry and tries it now; the reconciler retries it after transient HCS failures. */
export async function publishAuditEvent(client: Client, market: Market, fields: AuditFields): Promise<void> {
  market.pendingAuditEvents.push({ fields, transactionId: null });
  try {
    await flushAuditEvents(client, market);
  } catch (error) {
    console.error("[dvp audit] queued for retry", fields.event, fields.schedule, error);
  }
}

/** Reads the market's audit entries from the mirror node, newest first. */
export async function fetchAuditLog(topicId: string): Promise<AuditEntrySnapshot[]> {
  const messages = await fetchTopicMessages(topicId);
  const entries: AuditEntrySnapshot[] = [];
  for (const m of messages) {
    try {
      const parsed = JSON.parse(m.message) as AuditMessage;
      entries.push({
        sequenceNumber: m.sequenceNumber,
        consensusTime: mirrorTimestampToIso(m.consensusTimestamp),
        event: parsed.event,
        schedule: parsed.schedule,
        result: parsed.result,
        tx: parsed.tx,
      });
    } catch {
      // Not one of ours (shouldn't happen - the topic is only ever written by this app) - skip it.
    }
  }
  return entries.reverse();
}
