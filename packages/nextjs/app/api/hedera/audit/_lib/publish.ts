/**
 * Getting entries onto the topic, in order, exactly once.
 *
 * An action happens on chain before its entry can exist: the entry has to carry
 * that transaction's id and result. So the entry cannot be written first, and a
 * publish that fails after the action has run would leave an action with no
 * entry — which is the one thing this trail promises cannot happen.
 *
 * Instead every entry is queued the moment its action returns, and the queue is
 * drained separately: `prev` is read inside the serialized flush, a submission
 * keeps one fixed transaction id across retries so a lost response cannot
 * publish it twice, and `lastHash` advances only once bytes are confirmed on the
 * topic. A HashPack publisher may take the head entry and submit it itself; if
 * it does not, the Issuer publishes the same entry instead.
 *
 * Ported from the DvP template's `services/hedera/audit.ts`, which solved the
 * same three problems for its settlement log.
 */
import {
  AccountId,
  Client,
  TopicMessageSubmitTransaction,
  TransactionId,
  TransactionReceiptQuery,
} from "@hiero-ledger/sdk";
import { getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { type Desk, type QueuedEntry, getDesk } from "~~/app/api/hedera/audit/_lib/state";
import { serializeEntry, sha256Hex } from "~~/services/hcsAudit/entry";
import { fetchMirrorTransaction, fetchRecentTopicMessages } from "~~/services/hcsAudit/mirror";
import type { AuditEntry, EntryFields } from "~~/services/hcsAudit/types";

/** A transaction id is valid for about two minutes; past that the network will never take it. */
const TRANSACTION_VALID_MS = 125_000;

/** How long to wait for the mirror node to index a wallet's submission before giving up on this attempt. */
const MIRROR_POLL_ATTEMPTS = 6;
const MIRROR_POLL_INTERVAL_MS = 2000;

/** How many of a topic's newest messages are searched for a wallet's submission. */
const RECENT_MESSAGE_WINDOW = 25;

function transactionIdExpired(transactionId: string): boolean {
  const validStart = transactionId.split("@")[1]?.split("?")[0];
  if (!validStart) return true;
  const [seconds, nanos = "0"] = validStart.split(".");
  const startedAt = Number(seconds) * 1000 + Number(nanos) / 1e6;
  return !Number.isFinite(startedAt) || Date.now() - startedAt > TRANSACTION_VALID_MS;
}

/** A reservation only holds the chain while the wallet's transaction could still be accepted. */
function reservationIsLive(queued: QueuedEntry): boolean {
  return queued.wallet !== null && !transactionIdExpired(queued.wallet.transactionId);
}

/**
 * Takes an entry back from a wallet that did not confirm it, and says whether the
 * Issuer still has to publish it.
 *
 * The reservation being dead does not mean the message never landed: a confirm can
 * fail because the mirror node was slow, or the browser went away, while the
 * submission itself succeeded. Republishing the same bytes would then put the entry
 * on the topic twice, and every `prev` after it would be wrong. So the topic is
 * asked first, and a message that did land is adopted — the chain advances to it
 * exactly as a successful confirm would have.
 */
async function takeBackFromWallet(desk: Desk, queued: QueuedEntry): Promise<boolean> {
  const reservation = queued.wallet;
  queued.wallet = null;
  if (!reservation || !desk.topicId) return true;

  const recent = await fetchRecentTopicMessages(desk.topicId, RECENT_MESSAGE_WINDOW).catch(() => []);
  if (!recent.some(message => sameBytes(message.message, reservation.bytes))) return true;

  queued.published = reservation.entry;
  desk.lastHash = await sha256Hex(reservation.bytes);
  desk.entries.shift();
  return false;
}

/** The entry as it would be published right now: `prev` is whatever the chain is at. */
function entryAt(desk: Desk, queued: QueuedEntry): AuditEntry {
  return { v: 1, ...queued.fields, prev: desk.lastHash };
}

/** Queues an entry. Nothing is on the topic, and the chain has not moved, until a flush. */
export function queueEntry(desk: Desk, fields: EntryFields): QueuedEntry {
  const queued: QueuedEntry = { fields, transactionId: null, wallet: null, published: null };
  desk.entries.push(queued);
  ensureReconciler();
  return queued;
}

export function headEntry(desk: Desk): QueuedEntry | undefined {
  return desk.entries[0];
}

async function transactionStatus(client: Client, transactionId: TransactionId): Promise<string | null> {
  try {
    const receipt = await new TransactionReceiptQuery()
      .setTransactionId(transactionId)
      .setValidateStatus(false)
      .execute(client);
    return receipt.status.toString();
  } catch {
    return null;
  }
}

/**
 * Submits one entry as the Issuer, which is always an authorised publisher.
 *
 * The id is generated once and kept: if the submission landed but the response
 * was lost, resubmitting it is refused as a duplicate, so the network is asked
 * what happened rather than publishing the entry a second time.
 */
async function submitAsIssuer(client: Client, desk: Desk, queued: QueuedEntry, bytes: Uint8Array): Promise<void> {
  if (!desk.topicId) throw new Error("No audit topic configured.");
  const operatorId = client.operatorAccountId;
  if (!operatorId) throw new Error("Operator account id is not available on the client.");

  if (queued.transactionId && transactionIdExpired(queued.transactionId)) queued.transactionId = null;
  const transactionId = queued.transactionId
    ? TransactionId.fromString(queued.transactionId)
    : TransactionId.generate(operatorId);
  queued.transactionId = transactionId.toString();

  try {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(desk.topicId)
      .setMessage(bytes)
      .setTransactionId(transactionId)
      .execute(client);
    await response.getReceipt(client);
  } catch (error) {
    const status = await transactionStatus(client, transactionId);
    if (status !== "SUCCESS") {
      // A recorded failure is final for this id; anything else may still be in flight,
      // so the id is kept and the next flush resubmits it unchanged.
      if (status !== null) queued.transactionId = null;
      throw error;
    }
  }
}

/**
 * Publishes queued entries as the Issuer, oldest first, advancing the chain after
 * each confirmed submission. Serialized on `desk.publishQueue`, so a flush racing
 * another flush cannot build two entries on one `prev`.
 */
export function flushEntries(client: Client, desk: Desk): Promise<void> {
  const task = desk.publishQueue.then(async () => {
    while (desk.topicId && desk.entries.length > 0) {
      const queued = desk.entries[0];
      // Held for a wallet signature: leave it alone until it lands or its id expires.
      if (reservationIsLive(queued)) return;
      if (queued.wallet && !(await takeBackFromWallet(desk, queued))) continue;
      const entry = entryAt(desk, queued);
      const bytes = serializeEntry(entry);
      await submitAsIssuer(client, desk, queued, bytes);
      queued.published = entry;
      desk.lastHash = await sha256Hex(bytes);
      desk.entries.shift();
    }
  });
  // Swallowed on the stored queue so one failure cannot jam every later entry; the
  // caller still sees it through the returned promise, and the reconciler retries.
  desk.publishQueue = task.catch(() => undefined);
  return task;
}

/**
 * Queues an entry and tries to publish it now. A failure here is a retry, never a
 * lost entry: the reconciler keeps trying until it lands.
 *
 * The returned entry is the one that reached the topic when the flush got that far,
 * and otherwise the one it will be chained at if nothing is published before it.
 */
export async function publishEntry(client: Client, desk: Desk, fields: EntryFields): Promise<AuditEntry> {
  const queued = queueEntry(desk, fields);
  const optimistic = entryAt(desk, queued);
  try {
    await flushEntries(client, desk);
  } catch (error) {
    console.error("[audit] entry queued for retry", fields.event, fields.tx, error);
  }
  return queued.published ?? optimistic;
}

/**
 * Hands the head entry to a wallet to sign and pay for.
 *
 * The chain is reserved at these exact bytes: nothing else may advance it while the
 * reservation is live, because the `prev` the wallet is signing has to stay true.
 */
export function prepareEntryForWallet(
  client: Client,
  desk: Desk,
  queued: QueuedEntry,
  walletAccountId: string,
): { entry: AuditEntry; transactionBytes: string } {
  if (!desk.topicId) throw new Error("No audit topic configured.");
  // Only the head can be signed: `prev` is fixed into the bytes the wallet signs, so
  // an entry with anything queued in front of it does not yet know what it chains to.
  if (headEntry(desk) !== queued) throw new Error("Another entry has to be published first.");
  if (reservationIsLive(queued)) throw new Error("An entry is already awaiting a signature.");

  const entry = entryAt(desk, queued);
  const bytes = serializeEntry(entry);
  const transactionId = TransactionId.generate(AccountId.fromString(walletAccountId));
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(desk.topicId)
    .setMessage(bytes)
    .setTransactionId(transactionId)
    .freezeWith(client);

  queued.wallet = { accountId: walletAccountId, transactionId: transactionId.toString(), entry, bytes };
  return { entry, transactionBytes: Buffer.from(transaction.toBytes()).toString("base64") };
}

function sameBytes(base64: string, bytes: Uint8Array): boolean {
  return Buffer.from(base64, "base64").equals(Buffer.from(bytes));
}

/**
 * Confirms a wallet's submission really is the entry this server prepared, and
 * really is on the topic, before advancing the chain.
 *
 * Three things are checked that a successful transaction from that account alone
 * does not establish: that the id is the exact one frozen into the prepared
 * transaction, that the transaction was a message submit to this topic, and that
 * the bytes sitting on the topic are the prepared bytes. Without the last two, the
 * chain could advance to a hash of bytes that are not on the topic at all, and
 * every later entry's `prev` would be wrong.
 *
 * A failure never discards the entry. The reservation is dropped so the Issuer
 * publishes it instead, or kept while the mirror node may still be catching up.
 */
export async function confirmWalletEntry(desk: Desk, transactionId: string): Promise<{ entry: AuditEntry }> {
  if (!desk.topicId) throw new Error("No audit topic configured.");
  const queued = headEntry(desk);
  const reservation = queued?.wallet;
  if (!queued || !reservation || reservation.transactionId !== transactionId) {
    throw new Error("No entry was prepared by this server for that transaction.");
  }

  let mirrorTx = null;
  for (let attempt = 0; attempt < MIRROR_POLL_ATTEMPTS && !mirrorTx; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, MIRROR_POLL_INTERVAL_MS));
    mirrorTx = await fetchMirrorTransaction(transactionId);
  }

  if (!mirrorTx) {
    // Still indexing, or never submitted. The entry stays reserved either way: when the
    // id expires, the flush checks the topic and then either adopts the message or
    // publishes the entry as the Issuer.
    throw new Error("Could not find the submitted transaction on the mirror node yet; it will be retried.");
  }
  if (mirrorTx.name !== "CONSENSUSSUBMITMESSAGE" || mirrorTx.entity_id !== desk.topicId) {
    await takeBackFromWallet(desk, queued);
    throw new Error("Submitted transaction does not match the expected audit topic message.");
  }
  if (mirrorTx.result !== "SUCCESS") {
    await takeBackFromWallet(desk, queued);
    throw new Error(`Submission failed on-chain: ${mirrorTx.result}. The Issuer will publish the entry instead.`);
  }

  const recent = await fetchRecentTopicMessages(desk.topicId, RECENT_MESSAGE_WINDOW);
  if (!recent.some(message => sameBytes(message.message, reservation.bytes))) {
    // Reservation kept: the bytes may simply not be indexed yet, and taking the entry
    // back now could publish it a second time.
    throw new Error("The entry this server prepared is not on the topic yet; it will be retried.");
  }

  desk.lastHash = await sha256Hex(reservation.bytes);
  desk.entries.shift();
  return { entry: reservation.entry };
}

/**
 * Gives the head entry back to the Issuer: the wallet did not sign it. The entry is
 * not discarded — its action already happened, so it still has to reach the topic.
 */
export async function releaseWalletEntry(desk: Desk): Promise<void> {
  const queued = headEntry(desk);
  if (queued?.wallet) await takeBackFromWallet(desk, queued);
}

const RECONCILE_INTERVAL_MS = 4000;

declare global {
  var __hcsAuditReconciler: ReturnType<typeof setInterval> | undefined;
}

/**
 * Retries whatever is still queued. Without it, an entry whose publish failed would
 * wait for the next action — and a trail that is only repaired when someone presses
 * a button is not a trail that cannot skip anything.
 */
async function reconcile(): Promise<void> {
  const desk = getDesk();
  if (!desk.topicId || desk.entries.length === 0 || !hasOperatorEnv()) return;
  try {
    // Never closed: `getOperatorClient` hands out one client for the whole process,
    // and closing it breaks every later transaction with a message about freezing.
    await flushEntries(getOperatorClient(), desk);
  } catch (error) {
    console.error("[audit] retry failed", error);
  }
}

/**
 * Started by the first queued entry rather than when this module loads: Next imports
 * every route module during the build to collect its metadata, in a worker that has
 * to exit, and a live interval there fails the build with "Failed to collect page
 * data". Unref'd too, so it never holds a process open by itself.
 */
function ensureReconciler(): void {
  if (globalThis.__hcsAuditReconciler) return;
  const timer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  timer.unref?.();
  globalThis.__hcsAuditReconciler = timer;
}
