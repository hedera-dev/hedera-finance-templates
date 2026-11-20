// Server-only: the tour's attempts to get around the token's roles. Each is a real transaction,
// so each refusal is the token's own answer with a hash anyone can look up.
import { tokenAbi } from "./abi";
import { approveOnBoard, attemptSend } from "./actions";
import { getPublicClient, retryTransient } from "./clients";
import { GAS_ATTACK } from "./constants";
import { addHistory, getDeskState, getHolder, getOfficer, requireToken } from "./deskState";
import { simulateAndSend } from "./tx";
import type { Address } from "viem";

export type AttackType = "send-no-kyc" | "send-frozen" | "one-officer" | "one-officer-board";
export const ATTACK_TYPES: AttackType[] = ["send-no-kyc", "send-frozen", "one-officer", "one-officer-board"];

/** An attack that cannot run on the desk as it stands: the page says so, and it does not count. */
export class AttackRefused extends Error {}

/** ATS freezes an address by taking it off the control list, which on this token is a whitelist. */
async function isFrozen(token: Address, account: Address): Promise<boolean> {
  const listed = await retryTransient(() =>
    getPublicClient().readContract({ address: token, abi: tokenAbi, functionName: "isInControlList", args: [account] }),
  );
  return !listed;
}

/**
 * Officer 1 calls `setAddressFrozen` on the token directly. The board holds `ROLE_FREEZE_MANAGER`
 * and the officer holds nothing, so the token's own access control refuses it. The transaction is
 * sent rather than only simulated, so the refusal is on the ledger.
 */
async function actAlone() {
  const token = requireToken();
  const holder = getHolder("A");
  const officer1 = getOfficer("1");
  if (!holder || !officer1?.privateKey) throw new AttackRefused("The desk is not set up yet.");

  // Asks for the opposite of the holder's current state, so a mistake in the roles would show up
  // as the court order being undone rather than as nothing happening.
  const frozen = await isFrozen(token.address, holder.address);
  const outcome = await simulateAndSend(
    token.address,
    tokenAbi,
    "setAddressFrozen",
    [holder.address, !frozen],
    GAS_ATTACK,
    { signer: { privateKey: officer1.privateKey }, sendRefusal: true },
  );

  const action = `${frozen ? "Unfreeze" : "Freeze"} ${holder.label}, by Officer 1 alone, straight at the token`;
  const result = outcome.ok ? "SUCCESS" : outcome.errorName;
  const txHash = outcome.ok ? outcome.txHash : (outcome.txHash ?? "");
  addHistory({ action, reference: null, result, txHash, kind: "other" });
  return { result, txHash };
}

/**
 * Officer 1 tries to approve the order Officer 1 proposed. The board counts distinct officers,
 * not approvals, so it refuses: one officer cannot reach two however many times they press.
 */
async function approveOwnOrder() {
  const pending = getDeskState().pending[0];
  if (!pending) throw new AttackRefused("There is no order waiting. Propose one first.");

  const outcome = await approveOnBoard(pending.proposalId, "1", true);
  const result = outcome.ok ? "SUCCESS" : outcome.errorName;
  const txHash = outcome.ok ? outcome.txHash : (outcome.txHash ?? "");
  addHistory({
    action: `Approve order ${pending.proposalId} as Officer 1, who proposed it`,
    reference: pending.reference,
    result,
    txHash,
    kind: "approve",
  });
  return { result, txHash };
}

export async function runAttack(type: AttackType) {
  requireToken();
  if (type === "send-no-kyc") {
    const outcome = await attemptSend("B");
    return recordSend("B", outcome);
  }
  if (type === "send-frozen") {
    const token = requireToken();
    const holder = getHolder("A");
    if (!holder) throw new AttackRefused("The desk is not set up yet.");
    if (!(await isFrozen(token.address, holder.address))) {
      throw new AttackRefused("Holder A is not frozen. Carry out a freeze order first.");
    }
    const outcome = await attemptSend("A");
    return recordSend("A", outcome);
  }
  if (type === "one-officer") return actAlone();
  return approveOwnOrder();
}

function recordSend(holderId: "A" | "B", outcome: Awaited<ReturnType<typeof attemptSend>>) {
  const holder = getHolder(holderId);
  const result = outcome.ok ? "SUCCESS" : outcome.errorName;
  const txHash = outcome.ok ? outcome.txHash : (outcome.txHash ?? "");
  addHistory({ action: `Send 10 to ${holder?.label ?? holderId}`, reference: null, result, txHash, kind: "other" });
  return { result, txHash };
}
