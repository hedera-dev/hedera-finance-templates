import {
  Client,
  PrecheckStatusError,
  ReceiptStatusError,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenUnfreezeTransaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import type { Desk } from "~~/app/api/hedera/audit/_lib/state";
import { ACTION_EVENT, type EntryFields, type TokenAction } from "~~/services/hcsAudit/types";

export type ActionOutcome = { tx: string; result: string };

/**
 * Both `PrecheckStatusError` and `ReceiptStatusError` (the two ways the SDK
 * surfaces a non-SUCCESS network result) carry `.status` and `.transactionId`.
 * We want those regardless of success or failure: a refused action is still
 * logged, with the network's result code.
 */
function outcomeFromError(error: unknown): ActionOutcome {
  if (error instanceof ReceiptStatusError || error instanceof PrecheckStatusError) {
    return { tx: error.transactionId.toString(), result: error.status.toString() };
  }
  throw error;
}

export async function grantKyc(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenGrantKycTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function freezeHolder(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenFreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function unfreezeHolder(client: Client, tokenId: string, holderAccountId: string): Promise<ActionOutcome> {
  try {
    const response = await new TokenUnfreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(holderAccountId)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

export async function transferToHolder(
  client: Client,
  tokenId: string,
  issuerAccountId: string,
  holderAccountId: string,
  amount: number,
): Promise<ActionOutcome> {
  try {
    const response = await new TransferTransaction()
      .addTokenTransfer(tokenId, issuerAccountId, -amount)
      .addTokenTransfer(tokenId, holderAccountId, amount)
      .execute(client);
    const receipt = await response.getReceipt(client);
    return { tx: response.transactionId.toString(), result: receipt.status.toString() };
  } catch (error) {
    return outcomeFromError(error);
  }
}

/**
 * The account an action applies to: the demo holder unless the caller names another testnet
 * account. The issuer cannot target itself (it is the token's treasury and key holder).
 */
export function resolveTarget(raw: unknown, holderAccountId: string, issuerAccountId: string): string {
  if (raw === undefined || raw === null || String(raw).trim() === "") return holderAccountId;
  const id = String(raw).trim();
  if (!/^0\.0\.\d+$/.test(id)) throw new Error("Target account must look like 0.0.1234.");
  if (id === issuerAccountId) throw new Error("The issuer cannot be the target of its own token actions.");
  return id;
}

export const TOKEN_ACTIONS: readonly TokenAction[] = ["grant_kyc", "transfer", "freeze", "unfreeze"];

/**
 * The one place a token action is read off a request and performed.
 *
 * Both the Issuer route and the HashPack route go through it, so the two can never
 * drift on what they validate or in what order they touch the network: the action
 * happens, and its entry is queued from the same outcome.
 */
export type ActionRequest = { action: TokenAction; amount: number | null; account?: unknown };

export function parseActionRequest(
  body: { action?: string; amount?: number; account?: unknown } | null,
): ActionRequest {
  const action = body?.action as TokenAction | undefined;
  if (!action || !TOKEN_ACTIONS.includes(action)) throw new Error("Unknown action.");
  if (action !== "transfer") return { action, amount: null, account: body?.account };
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Transfer amount must be a positive whole number.");
  }
  return { action, amount, account: body?.account };
}

/** Performs the action on chain and returns the entry that records it, unchained. */
export async function performAction(
  client: Client,
  desk: Desk & { tokenId: string; holderAccountId: string },
  issuerAccountId: string,
  request: ActionRequest,
): Promise<EntryFields> {
  const account = resolveTarget(request.account, desk.holderAccountId, issuerAccountId);
  const tokenId = desk.tokenId;

  let outcome: ActionOutcome;
  if (request.action === "transfer") {
    outcome = await transferToHolder(client, tokenId, issuerAccountId, account, request.amount as number);
  } else if (request.action === "grant_kyc") {
    outcome = await grantKyc(client, tokenId, account);
  } else if (request.action === "freeze") {
    outcome = await freezeHolder(client, tokenId, account);
  } else {
    outcome = await unfreezeHolder(client, tokenId, account);
  }

  return {
    event: ACTION_EVENT[request.action],
    token: tokenId,
    account,
    amount: request.amount,
    tx: outcome.tx,
    result: outcome.result,
  };
}
