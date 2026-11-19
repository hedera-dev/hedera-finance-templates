import { NextResponse } from "next/server";
import {
  Client,
  PrecheckStatusError,
  type PrivateKey,
  ReceiptStatusError,
  TopicMessageSubmitTransaction,
  TransactionId,
} from "@hiero-ledger/sdk";
import { ensureOutsider, forgedEntry } from "~~/app/api/hedera/audit/_lib/attacks";
import { hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { getDesk, requireSetUp } from "~~/app/api/hedera/audit/_lib/state";
import { serializeEntry } from "~~/services/hcsAudit/entry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attempts to submit a message to the audit topic from an account that is
 * not an authorised publisher. The network itself is the thing being
 * tested here, not our code: this must always fail with INVALID_SIGNATURE,
 * and must never change the topic's message count.
 */
export async function POST() {
  if (!hasOperatorEnv()) {
    return NextResponse.json({ error: "No operator configured." }, { status: 400 });
  }

  const desk = getDesk();
  try {
    requireSetUp(desk);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
  const topicId = desk.topicId;

  let outsiderAccountId: string;
  let outsiderKey: PrivateKey;
  try {
    ({ accountId: outsiderAccountId, key: outsiderKey } = await ensureOutsider(desk));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  const forged = forgedEntry(desk);

  // Critical: freezing or executing with a client whose operator is the real
  // issuer would have the SDK silently co-sign with the issuer's key (that's
  // what `Client.execute`/`freezeWith` do for *any* transaction, regardless of
  // its payer). To genuinely test "an unauthorised account, and nothing else",
  // this submission must be frozen and executed on a client whose only
  // operator is the outsider.
  const outsiderClient = Client.forTestnet().setOperator(outsiderAccountId, outsiderKey);
  try {
    const transaction = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(serializeEntry(forged))
      .setTransactionId(TransactionId.generate(outsiderAccountId))
      .freezeWith(outsiderClient);
    const response = await transaction.execute(outsiderClient);
    await response.getReceipt(outsiderClient);
    // Should never happen on testnet: the network accepted an unauthorised publisher.
    return NextResponse.json({ resultCode: "SUCCESS", added: true });
  } catch (error) {
    if (error instanceof ReceiptStatusError || error instanceof PrecheckStatusError) {
      return NextResponse.json({ resultCode: error.status.toString(), added: false });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    outsiderClient.close();
  }
}
