import { AccountId, Transaction, TransactionId } from "@hiero-ledger/sdk";
import { buildFreshAdminTransaction, executeApprovedOrder, requireOperator } from "~~/services/security/actions";
import { getDeskState, getOfficer, getPending, setWalletDraft } from "~~/services/security/deskState";
import { getFirstNetworkNodeAccountId } from "~~/services/security/mirrorNode";
import { getSdkClient } from "~~/services/security/sdkClient";

/**
 * Lets the connected wallet, when it is Officer 3, approve a pending order by signing with its
 * own key instead of a server-held one. The desk never has this key, so the flow is a two-step
 * handshake: `prepare` builds the same fresh real admin transaction `approveOrder` would (current
 * balance, current moment — see the comment atop `actions.ts`), has Officer 1 sign it, and hands
 * back the signable body bytes for the single node it targets; `submit` rebuilds the identical
 * transaction from those bytes, attaches the signature the wallet produced, and hands it to
 * `executeApprovedOrder`, which completes the record schedule and executes it exactly as
 * `approveOrder` does for Officer 2.
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
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  requireWalletOfficer();
  const operator = await requireOperator();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  const officer1 = getOfficer("1");
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");

  const client = await getSdkClient();
  const nodeAccountId = await getFirstNetworkNodeAccountId();
  const transactionId = TransactionId.generate(operator.accountId);

  const inner = await buildFreshAdminTransaction(pending, state.token.tokenId);
  const frozen = inner
    .setTransactionId(transactionId)
    .setNodeAccountIds([AccountId.fromString(nodeAccountId)])
    .freeze();
  await frozen.sign(officer1.privateKey);

  // Held until `submit` arrives with the wallet's signature over these exact bytes.
  setWalletDraft(scheduleId, frozen.toBytes());

  const [signable] = frozen.signableNodeBodyBytesList;
  return {
    nodeAccountId,
    transactionId: transactionId.toString(),
    bodyBytesHex: Buffer.from(signable.signableTransactionBodyBytes).toString("hex"),
  };
}

export async function submitWalletApproval(
  scheduleId: string,
  _nodeAccountId: string,
  _transactionId: string,
  signatureHex: string,
) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  const officer3 = requireWalletOfficer();
  if (!pending.walletDraftBytes) throw new Error("Call prepare before submit.");

  const tx = Transaction.fromBytes(pending.walletDraftBytes);
  // Hedera's compact ECDSA signature is 64 bytes (r || s); `eth_sign` returns 65 (r || s || v).
  const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex").subarray(0, 64);
  tx.addSignature(officer3.publicKey, signatureBytes);
  setWalletDraft(scheduleId, undefined);

  return executeApprovedOrder(scheduleId, tx);
}
