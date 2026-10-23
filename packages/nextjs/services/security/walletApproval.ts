import { AccountId, ScheduleSignTransaction, TransactionId } from "@hiero-ledger/sdk";
import { requireOperator } from "~~/services/security/actions";
import { getOfficer, getPending } from "~~/services/security/deskState";
import { getFirstNetworkNodeAccountId } from "~~/services/security/mirrorNode";
import { getSdkClient } from "~~/services/security/sdkClient";

/**
 * Lets the connected wallet, when it is Officer 3, approve a pending order by signing with its
 * own key instead of a server-held one. The desk never has this key, so the flow is a two-step
 * handshake: `prepare` builds and freezes the exact `ScheduleSignTransaction` the wallet must
 * sign and hands back its signable body bytes; `submit` rebuilds the identical transaction from
 * the same node/transaction id and attaches the signature the wallet produced.
 *
 * Hedera signs an ECDSA key over `keccak256(bodyBytes)` with no other framing — the same thing
 * the (legacy, now widely disabled) `eth_sign` JSON-RPC method does. A wallet that still allows
 * raw `eth_sign` produces a signature that validates here; most modern wallets refuse it, which
 * is why this path is not part of what the checker verifies.
 */

function requireWalletOfficer() {
  const officer3 = getOfficer("3");
  if (!officer3?.isWallet || !officer3.accountId) throw new Error("The wallet is not Officer 3 for this desk.");
  return officer3;
}

export async function prepareWalletApproval(scheduleId: string) {
  if (!getPending(scheduleId)) throw new Error("This desk did not create that order.");
  requireWalletOfficer();
  const operator = await requireOperator();
  const client = await getSdkClient();

  const nodeAccountId = await getFirstNetworkNodeAccountId();
  const transactionId = TransactionId.generate(operator.accountId);

  const tx = new ScheduleSignTransaction()
    .setScheduleId(scheduleId)
    .setNodeAccountIds([AccountId.fromString(nodeAccountId)])
    .setTransactionId(transactionId)
    .freezeWith(client);

  const [signable] = tx.signableNodeBodyBytesList;
  return {
    nodeAccountId,
    transactionId: transactionId.toString(),
    bodyBytesHex: Buffer.from(signable.signableTransactionBodyBytes).toString("hex"),
  };
}

export async function submitWalletApproval(
  scheduleId: string,
  nodeAccountId: string,
  transactionId: string,
  signatureHex: string,
) {
  if (!getPending(scheduleId)) throw new Error("This desk did not create that order.");
  const officer3 = requireWalletOfficer();
  const client = await getSdkClient();

  const tx = new ScheduleSignTransaction()
    .setScheduleId(scheduleId)
    .setNodeAccountIds([AccountId.fromString(nodeAccountId)])
    .setTransactionId(TransactionId.fromString(transactionId))
    .freezeWith(client);

  // Hedera's compact ECDSA signature is 64 bytes (r || s); `eth_sign` returns 65 (r || s || v).
  const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex").subarray(0, 64);
  tx.addSignature(officer3.publicKey, signatureBytes);

  await (await tx.execute(client)).getReceipt(client);
}
