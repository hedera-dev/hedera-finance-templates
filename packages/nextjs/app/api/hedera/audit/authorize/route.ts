import { NextResponse } from "next/server";
import { KeyList, PublicKey, TopicUpdateTransaction } from "@hiero-ledger/sdk";
import { getOperator, getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { getDesk, requireSetUp } from "~~/app/api/hedera/audit/_lib/state";
import { fetchAccountPublicKey } from "~~/services/hcsAudit/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicKeyFromMirror(type: string, hex: string): PublicKey {
  if (type === "ECDSA_SECP256K1") return PublicKey.fromStringECDSA(hex);
  if (type === "ED25519") return PublicKey.fromStringED25519(hex);
  return PublicKey.fromString(hex);
}

/**
 * Adds a wallet to the topic's submit key: a threshold-1 key list of the issuer's
 * key and every wallet authorised so far. Signed with the topic's admin key (the
 * issuer's), on the server — the wallet never needs to touch this.
 *
 * Cumulative on purpose. Setting the key to the issuer plus only the newest wallet
 * silently took the right to publish away from an earlier one while `#publishers`
 * went on listing it, so the page claimed a publisher the network would have
 * refused.
 */
export async function POST(req: Request) {
  if (!hasOperatorEnv()) {
    return NextResponse.json({ error: "No operator configured." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { walletAccountId?: string } | null;
  const walletAccountId = body?.walletAccountId;
  if (!walletAccountId) {
    return NextResponse.json({ error: "Missing walletAccountId." }, { status: 400 });
  }

  const desk = getDesk();
  try {
    requireSetUp(desk);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  const topicId = desk.topicId;
  const { accountId: operatorId, key: operatorKey } = getOperator();

  if (walletAccountId === operatorId.toString()) {
    return NextResponse.json(
      { error: "The operator account already publishes to the trail; it doesn't need authorising." },
      { status: 400 },
    );
  }
  if (walletAccountId === desk.holderAccountId) {
    return NextResponse.json(
      { error: "The holder is the account being audited, and cannot authorise itself to publish." },
      { status: 400 },
    );
  }

  const walletKeyInfo = await fetchAccountPublicKey(walletAccountId);
  if (!walletKeyInfo) {
    return NextResponse.json(
      { error: `Could not read a public key for ${walletAccountId} from the mirror node.` },
      { status: 400 },
    );
  }

  let walletPublicKey: PublicKey;
  try {
    walletPublicKey = publicKeyFromMirror(walletKeyInfo.type, walletKeyInfo.key);
  } catch {
    return NextResponse.json({ error: `Unsupported key type for ${walletAccountId}.` }, { status: 400 });
  }

  const client = getOperatorClient();
  const walletKeys = desk.walletPublisherKeys.some(p => p.accountId === walletAccountId)
    ? desk.walletPublisherKeys
    : [...desk.walletPublisherKeys, { accountId: walletAccountId, publicKey: walletPublicKey }];
  const newSubmitKey = new KeyList([operatorKey.publicKey, ...walletKeys.map(p => p.publicKey)], 1);

  try {
    const response = await new TopicUpdateTransaction().setTopicId(topicId).setSubmitKey(newSubmitKey).execute(client);
    await response.getReceipt(client);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  // Only after the network accepted the new key, so the list never claims more than
  // the topic allows.
  desk.walletPublisherKeys = walletKeys;
  if (!desk.publishers.some(p => p.accountId === walletAccountId)) {
    desk.publishers.push({ accountId: walletAccountId, role: "hashpack" });
  }

  return NextResponse.json({ publishers: desk.publishers });
}
