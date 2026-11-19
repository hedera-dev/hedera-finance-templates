// Server-only: the tour's three attempts, by an account with no rights on the topic, to write to the trail, take it
// over, or delete it. Each is a real transaction, so each refusal is the network's own answer, with an id anyone can
// look up on HashScan.
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrecheckStatusError,
  PrivateKey,
  TopicDeleteTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TransactionId,
} from "@hiero-ledger/sdk";
import { getOperatorClient } from "~~/app/api/hedera/audit/_lib/operator";
import { type Desk, getDesk, requireSetUp } from "~~/app/api/hedera/audit/_lib/state";
import { serializeEntry } from "~~/services/hcsAudit/entry";
import { sdkTxIdToMirrorForm } from "~~/services/hcsAudit/mirror";
import type { AuditEntry } from "~~/services/hcsAudit/types";

export const ATTACK_TYPES = ["forge", "take-over", "delete-topic"] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];

export type AttackResult = {
  ok: boolean;
  result: string;
  /** The mirror node's dashed transaction id, or null when the network refused it before consensus. */
  transaction: string | null;
};

/** The account with no rights on the topic, created once per desk with 1 HBAR. */
export async function ensureOutsider(desk: Desk): Promise<{ accountId: string; key: PrivateKey }> {
  if (!desk.outsiderAccountId || !desk.outsiderKey) {
    const key = PrivateKey.generateECDSA();
    const client = getOperatorClient();
    const response = await new AccountCreateTransaction()
      .setKeyWithoutAlias(key.publicKey)
      .setInitialBalance(new Hbar(1))
      .setAccountMemo("HCS audit forgery attempt")
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.accountId) throw new Error("Could not create the outsider account.");
    desk.outsiderAccountId = receipt.accountId.toString();
    desk.outsiderKey = key;
  }
  return { accountId: desk.outsiderAccountId, key: desk.outsiderKey };
}

/** A transfer that never happened, chained to the real head of the trail so only the signature gives it away. */
export function forgedEntry(desk: Desk & { tokenId: string; holderAccountId: string }): AuditEntry {
  return {
    v: 2,
    event: "transfer",
    token: desk.tokenId,
    account: desk.holderAccountId,
    amount: 999999,
    tx: "forged",
    result: "SUCCESS",
    reason: "forged by an unauthorised account",
    authority: null,
    evidence: null,
    prev: desk.lastHash,
  };
}

export async function runAttack(type: AttackType): Promise<AttackResult> {
  const desk = getDesk();
  requireSetUp(desk);
  const outsider = await ensureOutsider(desk);

  // Frozen and executed on a client whose only operator is the outsider: the operator's client would co-sign with
  // the Issuer's key, and the attack would be testing nothing.
  const client = Client.forTestnet().setOperator(outsider.accountId, outsider.key);
  const transactionId = TransactionId.generate(outsider.accountId);
  const transaction =
    type === "forge"
      ? new TopicMessageSubmitTransaction().setTopicId(desk.topicId).setMessage(serializeEntry(forgedEntry(desk)))
      : type === "take-over"
        ? new TopicUpdateTransaction().setTopicId(desk.topicId).setSubmitKey(outsider.key.publicKey)
        : new TopicDeleteTransaction().setTopicId(desk.topicId);
  try {
    const response = await transaction.setTransactionId(transactionId).freezeWith(client).execute(client);
    const { status } = await response.getReceiptQuery().setValidateStatus(false).execute(client);
    const result = status.toString();
    return { ok: result === "SUCCESS", result, transaction: sdkTxIdToMirrorForm(transactionId.toString()) };
  } catch (error) {
    // Refused before consensus: no transaction exists to link to.
    if (error instanceof PrecheckStatusError) return { ok: false, result: error.status.toString(), transaction: null };
    throw error;
  } finally {
    client.close();
  }
}
