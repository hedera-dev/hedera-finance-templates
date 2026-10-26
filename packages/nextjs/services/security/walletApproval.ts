import { Transaction } from "@hiero-ledger/sdk";
import { executeApprovedOrder } from "~~/services/security/actions";
import { getOfficer, getPending } from "~~/services/security/deskState";

/**
 * Lets the connected wallet, when it is Officer 3, approve a pending order by signing with its
 * own key instead of a server-held one. The desk never has this key, so the flow is a two-step
 * handshake: `prepare` deserializes the exact (already Officer-1-signed) transaction bytes held
 * for this order and hands back the signable body bytes for the single node it targets; `submit`
 * rebuilds the identical transaction from those same bytes and attaches the signature the wallet
 * produced, then executes it — see the comment atop `actions.ts` for why this is a direct
 * multi-signature transaction rather than a `ScheduleSignTransaction`.
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

  const tx = Transaction.fromBytes(pending.transactionBytes);
  const nodeAccountId = tx.nodeAccountIds?.[0]?.toString();
  if (!nodeAccountId) throw new Error("This order has no node account id to sign against.");

  const [signable] = tx.signableNodeBodyBytesList;
  return {
    nodeAccountId,
    transactionId: scheduleId,
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

  const tx = Transaction.fromBytes(pending.transactionBytes);
  // Hedera's compact ECDSA signature is 64 bytes (r || s); `eth_sign` returns 65 (r || s || v).
  const signatureBytes = Buffer.from(signatureHex.replace(/^0x/, ""), "hex").subarray(0, 64);
  tx.addSignature(officer3.publicKey, signatureBytes);

  return executeApprovedOrder(scheduleId, tx);
}
