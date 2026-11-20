// Server-only: the desk's actions. Every compliance action takes the same route — one officer
// proposes a call on the board, a second approves it, and the board makes the call in that
// approving transaction. Nothing here decides whether the call is allowed: the token does.
import { boardCallAbi, tokenAbi } from "./abi";
import { getPublicClient, requireOperator, retryTransient } from "./clients";
import {
  GAS_ATTACK,
  GAS_BOARD_APPROVE,
  GAS_BOARD_CANCEL,
  GAS_BOARD_PROPOSE,
  GAS_TRANSFER,
  SEND_AMOUNT,
} from "./constants";
import {
  addHistory,
  addPending,
  getHolder,
  removePending,
  requireBoard,
  requirePending,
  requireSigningOfficer,
  requireToken,
} from "./deskState";
import { ORDER_NEEDS_HOLDER, actionLabel, encodeOrder } from "./orders";
import { simulateAndSend } from "./tx";
import type { WriteOutcome } from "./tx";
import { decodeEventLog, encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";
import type { HolderId, OfficerId, OrderAction } from "~~/services/security/types";

export { actionLabel, encodeGrantKyc, encodeOrder, ORDER_NEEDS_HOLDER } from "./orders";

type EventLog = { address: string; data: Hex; topics: readonly Hex[] };

/**
 * The board's proposal id, read from the `Proposed` event rather than predicted. A simulation
 * returns the id too, but it is computed against the state at simulation time: anything else
 * proposing in between would change it.
 */
function proposalIdFromLogs(logs: readonly EventLog[], board: Address): bigint {
  for (const log of logs) {
    if (log.address.toLowerCase() !== board.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: boardCallAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Proposed") continue;
      return (decoded.args as unknown as { id: bigint }).id;
    } catch {
      // Not the event we are looking for; an approval in the same transaction emits others.
    }
  }
  throw new Error("The board emitted no Proposed event, so the desk cannot name the order it just made.");
}

/** Proposes a call on the board. The proposing officer's own approval is the first of the two. */
async function proposeCall(target: Address, data: Hex, officerId: OfficerId) {
  const board = requireBoard();
  const officer = requireSigningOfficer(officerId);
  const outcome = await simulateAndSend(board.address, boardCallAbi, "propose", [target, data], GAS_BOARD_PROPOSE, {
    signer: { privateKey: officer.privateKey },
  });
  if (!outcome.ok) return outcome;
  return { ...outcome, proposalId: proposalIdFromLogs(outcome.logs, board.address) };
}

/** Approves a proposal, which is what makes the call when it is the second distinct approval. */
export async function approveOnBoard(proposalId: string, officerId: OfficerId) {
  const board = requireBoard();
  const officer = requireSigningOfficer(officerId);
  return simulateAndSend(board.address, boardCallAbi, "approve", [BigInt(proposalId)], GAS_BOARD_APPROVE, {
    signer: { privateKey: officer.privateKey },
  });
}

/**
 * Proposes and approves in one go, with the two officers the desk holds. Used by setup, where
 * the two-officer rule is not what is being demonstrated but still has to be obeyed.
 */
export async function carryOrderNow(target: Address, data: Hex) {
  const proposed = await proposeCall(target, data, "1");
  if (!proposed.ok) throw new Error(proposed.error);
  const approved = await approveOnBoard(proposed.proposalId.toString(), "2");
  if (!approved.ok) throw new Error(approved.error);
  return approved.txHash;
}

export type OrderResult = { result: string; txHash: string; proposalId?: string };

/** Officer 1 proposes a court order, and nothing more happens. */
export async function proposeOrder(
  action: OrderAction,
  holderId: HolderId | null,
  reference: string,
): Promise<OrderResult> {
  const token = requireToken();
  const holder = holderId ? getHolder(holderId) : undefined;
  if (ORDER_NEEDS_HOLDER[action] && !holder) throw new Error(`A ${action} order needs a holder this desk created.`);

  // A redemption names an amount, so it is read now: the order says what it will take.
  const balance = action === "redeem" && holder ? await readBalance(token.address, holder.address) : 0n;
  const data = encodeOrder(action, holder?.address ?? null, balance);

  const proposed = await proposeCall(token.address, data, "1");
  const label = actionLabel(action, holder?.label ?? null);
  if (!proposed.ok) {
    addHistory({
      action: `Propose: ${label}`,
      reference,
      result: proposed.errorName,
      txHash: proposed.txHash ?? "",
      kind: "propose",
    });
    return { result: proposed.errorName, txHash: proposed.txHash ?? "" };
  }

  const proposalId = proposed.proposalId.toString();
  const { expiresAt } = await readProposal(proposalId);
  addPending({
    proposalId,
    action,
    holderId: holderId ?? null,
    reference,
    createdAtMs: Date.now(),
    expiresAtMs: Number(expiresAt) * 1000,
    proposeTxHash: proposed.txHash,
  });
  addHistory({ action: `Proposed: ${label}`, reference, result: "SUCCESS", txHash: proposed.txHash, kind: "propose" });
  return { result: "SUCCESS", txHash: proposed.txHash, proposalId };
}

/** The second officer's approval, which carries the order out — or does not, if the token refuses. */
export async function approveOrder(proposalId: string, officerId: OfficerId = "2"): Promise<OrderResult> {
  const pending = requirePending(proposalId);
  const holder = pending.holderId ? getHolder(pending.holderId) : undefined;
  const label = actionLabel(pending.action, holder?.label ?? null);
  const officerLabel = `Officer ${officerId}`;

  const outcome = await approveOnBoard(proposalId, officerId);
  if (!outcome.ok) {
    // The approval reverted as a whole, so the proposal is still pending and can be tried again.
    addHistory({
      action: `${label} — approval by ${officerLabel} refused`,
      reference: pending.reference,
      result: outcome.errorName,
      txHash: outcome.txHash ?? "",
      kind: "approve",
    });
    return { result: outcome.errorName, txHash: outcome.txHash ?? "" };
  }

  removePending(proposalId);
  addHistory({
    action: `${label} — approved by ${officerLabel}`,
    reference: pending.reference,
    result: "SUCCESS",
    txHash: outcome.txHash,
    kind: "approve",
  });
  return { result: "SUCCESS", txHash: outcome.txHash };
}

/** Records an approval the wallet officer signed in the browser; the chain already has it. */
export async function recordWalletApproval(proposalId: string, txHash: string): Promise<OrderResult> {
  const pending = requirePending(proposalId);
  const holder = pending.holderId ? getHolder(pending.holderId) : undefined;
  const label = actionLabel(pending.action, holder?.label ?? null);

  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") {
    addHistory({
      action: `${label} — approval by Officer 3 refused`,
      reference: pending.reference,
      result: "Error",
      txHash,
      kind: "approve",
    });
    return { result: "Error", txHash };
  }

  removePending(proposalId);
  addHistory({
    action: `${label} — approved by Officer 3 (wallet)`,
    reference: pending.reference,
    result: "SUCCESS",
    txHash,
    kind: "approve",
  });
  return { result: "SUCCESS", txHash };
}

/** Withdraws a proposal. Only the officer who proposed it can, which is Officer 1 on this desk. */
export async function cancelOrder(proposalId: string): Promise<OrderResult> {
  const pending = requirePending(proposalId);
  const board = requireBoard();
  const officer = requireSigningOfficer("1");
  const holder = pending.holderId ? getHolder(pending.holderId) : undefined;
  const label = actionLabel(pending.action, holder?.label ?? null);

  const outcome = await simulateAndSend(board.address, boardCallAbi, "cancel", [BigInt(proposalId)], GAS_BOARD_CANCEL, {
    signer: { privateKey: officer.privateKey },
  });
  if (!outcome.ok) {
    addHistory({
      action: `${label} — withdrawal refused`,
      reference: pending.reference,
      result: outcome.errorName,
      txHash: outcome.txHash ?? "",
      kind: "withdraw",
    });
    return { result: outcome.errorName, txHash: outcome.txHash ?? "" };
  }

  removePending(proposalId);
  addHistory({
    action: `${label} — withdrawn`,
    reference: pending.reference,
    result: "SUCCESS",
    txHash: outcome.txHash,
    kind: "withdraw",
  });
  return { result: "SUCCESS", txHash: outcome.txHash };
}

/** The issuer sends a holder 10 units. Sent even when refused, so the refusal is on the ledger. */
export async function sendToHolder(holderId: HolderId): Promise<OrderResult> {
  const token = requireToken();
  const holder = getHolder(holderId);
  if (!holder) throw new Error(`This desk did not create holder ${holderId}.`);

  const outcome = await simulateAndSend(
    token.address,
    tokenAbi,
    "transfer",
    [holder.address, SEND_AMOUNT],
    GAS_TRANSFER,
    { sendRefusal: true },
  );
  const action = `Send ${SEND_AMOUNT} to ${holder.label}`;
  if (!outcome.ok) {
    addHistory({ action, reference: null, result: outcome.errorName, txHash: outcome.txHash ?? "", kind: "other" });
    return { result: outcome.errorName, txHash: outcome.txHash ?? "" };
  }
  addHistory({ action, reference: null, result: "SUCCESS", txHash: outcome.txHash, kind: "other" });
  return { result: "SUCCESS", txHash: outcome.txHash };
}

/** A send with a gas limit sized for a refusal, for the tour's attacks. */
export async function attemptSend(holderId: HolderId): Promise<WriteOutcome> {
  const token = requireToken();
  const holder = getHolder(holderId);
  if (!holder) throw new Error(`This desk did not create holder ${holderId}.`);
  return simulateAndSend(token.address, tokenAbi, "transfer", [holder.address, SEND_AMOUNT], GAS_ATTACK, {
    sendRefusal: true,
  });
}

export async function readBalance(token: Address, account: Address): Promise<bigint> {
  return retryTransient(() =>
    getPublicClient().readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [account] }),
  );
}

export type ProposalState = {
  target: Address;
  expiresAt: bigint;
  proposer: Address;
  approvals: number;
  executed: boolean;
  cancelled: boolean;
};

/** One proposal, as the board reports it. */
export async function readProposal(proposalId: string): Promise<ProposalState> {
  const board = requireBoard();
  const [target, , expiresAt, proposer, approvals, executed, cancelled] = await retryTransient(() =>
    getPublicClient().readContract({
      address: board.address,
      abi: boardCallAbi,
      functionName: "getProposal",
      args: [BigInt(proposalId)],
    }),
  );
  return { target, expiresAt, proposer, approvals: Number(approvals), executed, cancelled };
}

/** Which of the three officers have approved a proposal, so the page can say who is missing. */
export async function readApprovedBy(proposalId: string, officers: Address[]): Promise<boolean[]> {
  const board = requireBoard();
  const client = getPublicClient();
  return Promise.all(
    officers.map(officer =>
      retryTransient(() =>
        client.readContract({
          address: board.address,
          abi: boardCallAbi,
          functionName: "approvedBy",
          args: [BigInt(proposalId), officer],
        }),
      ),
    ),
  );
}

/** The calldata the wallet officer's browser sends to the board, prepared server-side. */
export function prepareWalletApproval(proposalId: string) {
  requirePending(proposalId);
  const board = requireBoard();
  return {
    to: board.address,
    data: encodeFunctionData({ abi: boardCallAbi, functionName: "approve", args: [BigInt(proposalId)] }),
  };
}

/** Kept so callers do not have to import the operator module to know who the issuer is. */
export const issuerAddress = (): Address => requireOperator().account.address;
