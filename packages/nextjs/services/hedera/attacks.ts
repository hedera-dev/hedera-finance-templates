// Server-only: the tour's three attempts to get around delivery-versus-payment. Each is a real transaction, so each
// refusal is the network's own answer, with an id anyone can look up on HashScan.
import { PrivateKey, ScheduleDeleteTransaction } from "@hiero-ledger/sdk";
import { getOperatorClient } from "~~/services/hedera/client";
import { cancelTradeDemo, getSnapshot, proposeTradeDemo, signTradeDemo } from "~~/services/hedera/dvp";
import { fetchPartyBalances } from "~~/services/hedera/mirror";
import { getMarket } from "~~/services/hedera/store";
import { BUYER_INITIAL_PAYMENT, type BuyerChoice, type MarketSnapshot } from "~~/services/hedera/types";

export const ATTACK_TYPES = ["no-kyc", "short-payment", "buyer-cancels"] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];

/** The attack cannot run on the market as it stands; nothing was sent. */
export class AttackRefused extends Error {}

export type AttackResult = {
  ok: boolean;
  result: string;
  /** A consensus timestamp or a dashed transaction id: either completes a HashScan transaction link. */
  transaction: string | null;
  market: MarketSnapshot;
};

const QUANTITY = 10;
/** Five times the most stablecoin setup ever gives the Buyer, so the payment leg cannot be met. */
export const OVER_PRICE = BUYER_INITIAL_PAYMENT * 5;

/** "0.0.1234@1700000000.123456789" -> "0.0.1234-1700000000-123456789", the form HashScan's links take. */
const dashed = (transactionId: string) => transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");

/** Proposes and signs one trade with the demo parties: the network executes it at once, both legs or neither. */
async function settle(buyerChoice: BuyerChoice, price: number): Promise<AttackResult> {
  const market = getMarket()!;
  const seller = await fetchPartyBalances(market.seller.accountId, market.securityTokenId, market.paymentTokenId);
  // Short of security, the trade would fail on the Seller's side instead of the one the attack is about.
  if (seller.security < BigInt(QUANTITY))
    throw new AttackRefused(`The Seller has fewer than ${QUANTITY} security left to sell. Set up a fresh market.`);

  const { scheduleId } = (await proposeTradeDemo(QUANTITY, price, buyerChoice, "onSignature")).trades[0];
  const after = await signTradeDemo(scheduleId);
  const trade = after.trades.find(t => t.scheduleId === scheduleId)!;
  return {
    ok: trade.status === "SETTLED",
    result: trade.settlementResult ?? trade.status,
    transaction: trade.executedAt,
    market: after,
  };
}

/** The Buyer tries to delete a schedule whose admin key is the Seller's; the desk then cancels it as the Seller. */
async function buyerCancels(): Promise<AttackResult> {
  const market = getMarket()!;
  const { scheduleId } = (await proposeTradeDemo(QUANTITY, QUANTITY * 100, "buyer", "onSignature")).trades[0];
  const client = getOperatorClient();
  let result: string;
  let transaction: string;
  try {
    const tx = new ScheduleDeleteTransaction().setScheduleId(scheduleId).freezeWith(client);
    await tx.sign(PrivateKey.fromStringECDSA(market.buyer.privateKey));
    const response = await tx.execute(client);
    transaction = dashed(response.transactionId.toString());
    result = (await response.getReceiptQuery().setValidateStatus(false).execute(client)).status.toString();
  } finally {
    client.close();
  }
  // Refused, the trade is still pending: withdraw it properly so it does not wait out its 30 minutes.
  const after = result === "SUCCESS" ? null : await cancelTradeDemo(scheduleId);
  return { ok: result === "SUCCESS", result, transaction, market: after ?? (await getSnapshot())! };
}

export async function runAttack(type: AttackType): Promise<AttackResult> {
  if (!getMarket()) throw new AttackRefused("Set up the market first.");
  if (type === "no-kyc") return settle("unverifiedBuyer", QUANTITY * 100);
  if (type === "short-payment") return settle("buyer", OVER_PRICE);
  return buyerCancels();
}
