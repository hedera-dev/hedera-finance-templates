// Server-only: the tour's three attempts to get around the token's keys. Each is a real transaction, so each refusal
// is the network's own answer, with an id anyone can look up.
import { buildInnerTransaction, sendToHolder, statusCodeOf } from "~~/services/security/actions";
import { addHistory, getDeskState, getHolder, getOfficer } from "~~/services/security/deskState";
import { getTokenRelationship } from "~~/services/security/mirrorNode";
import { getSdkClient } from "~~/services/security/sdkClient";

export type AttackType = "send-no-kyc" | "send-frozen" | "one-officer";

export class AttackRefused extends Error {}

async function frozenNow(holderAccountId: string, tokenId: string) {
  const relationship = await getTokenRelationship(holderAccountId, tokenId);
  if (!relationship) throw new AttackRefused("The holder's state could not be read just now. Try again.");
  return relationship.freezeStatus === "FROZEN";
}

/**
 * An admin transaction signed by Officer 1 alone. The token's keys are a 2-of-3 list, so the network refuses it: the
 * operator's signature pays the fee, and a payer's signature counts for nothing towards the token's keys.
 */
async function actAlone(): Promise<{ result: string; transactionId: string }> {
  const state = getDeskState();
  const holder = getHolder("A");
  const officer1 = getOfficer("1");
  if (!state.token || !holder || !officer1?.privateKey) throw new AttackRefused("The desk is not set up yet.");

  // Undo a freeze if there is one, so a mistake in the keys would show as the court order being reversed.
  const action = (await frozenNow(holder.accountId, state.token.tokenId)) ? "unfreeze" : "freeze";
  const client = await getSdkClient();
  const tx = buildInnerTransaction(action, state.token.tokenId, holder.accountId).freezeWith(client);
  await tx.sign(officer1.privateKey);

  let result = "SUCCESS";
  let transactionId = tx.transactionId?.toString() ?? "";
  try {
    const response = await tx.execute(client);
    transactionId = response.transactionId.toString();
    await response.getReceipt(client);
  } catch (error) {
    result = statusCodeOf(error) ?? "UNKNOWN_ERROR";
  }
  addHistory({
    action: `${action === "freeze" ? "Freeze" : "Unfreeze"} ${holder.label}, signed by Officer 1 alone`,
    reference: null,
    result,
    transactionId,
    linkKind: "transaction",
  });
  return { result, transactionId };
}

export async function runAttack(type: AttackType) {
  const state = getDeskState();
  if (!state.token) throw new AttackRefused("The desk is not set up yet.");
  if (type === "send-no-kyc") return sendToHolder("B");
  if (type === "send-frozen") {
    const holder = getHolder("A");
    if (!holder || !(await frozenNow(holder.accountId, state.token.tokenId)))
      throw new AttackRefused("Holder A is not frozen. Carry out a freeze order first.");
    return sendToHolder("A");
  }
  return actAlone();
}
