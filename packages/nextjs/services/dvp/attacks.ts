// Server-only: the tour's "Break it" attacks. Each one is a real transaction, sent even though it
// is going to be refused, so the reader can follow it to HashScan and read the network's own
// record of the refusal rather than this app's word for it.
import { securityAbi, settlementAbi, settlementCallAbi } from "./abi";
import { pledgeCash, pledgeSecurity, proposeTrade, readTrade } from "./actions";
import { requireOperator } from "./clients";
import { GAS_ATTACK, GAS_SETTLE, PARTITION } from "./constants";
import { addHistory, requireParty, requireSecurity, requireSettlement } from "./deskState";
import { simulateAndSend } from "./tx";

export type AttackType = "settle-one-leg" | "settle-no-kyc" | "seller-reclaims" | "settle-twice";

export type AttackResult = {
  type: AttackType;
  /** `refused` is the outcome the template claims; `accepted` would be a finding. */
  outcome: "refused" | "accepted" | "blocked";
  errorName: string | null;
  error: string | null;
  txHash: string | null;
  /** Why it could not be tried, when it could not. */
  blocked: string | null;
  tradeId: number | null;
};

const ATTACK_LABELS: Record<AttackType, string> = {
  "settle-one-leg": "Settle with only one leg pledged",
  "settle-no-kyc": "Settle to a buyer who was never verified",
  "seller-reclaims": "Take the pledged security back mid-trade",
  "settle-twice": "Settle a trade that has already settled",
};

/** The small trade the first three attacks are tried on, so each stands on its own. */
const ATTACK_QUANTITY = 10n;
const ATTACK_PRICE = 1_000n;

function result(type: AttackType, outcome: AttackResult["outcome"], extra: Partial<AttackResult> = {}): AttackResult {
  const attack = {
    type,
    outcome,
    errorName: null,
    error: null,
    txHash: null,
    blocked: null,
    tradeId: null,
    ...extra,
  };
  addHistory({
    action: ATTACK_LABELS[type],
    reference: attack.tradeId === null ? null : `trade ${attack.tradeId}`,
    result: outcome === "refused" ? (attack.errorName ?? "REFUSED") : outcome === "blocked" ? "NOT TRIED" : "ACCEPTED",
    txHash: attack.txHash,
    kind: "attack",
  });
  return attack;
}

export async function runAttack(type: AttackType): Promise<AttackResult> {
  switch (type) {
    case "settle-one-leg":
      return settleOneLeg();
    case "settle-no-kyc":
      return settleWithoutKyc();
    case "seller-reclaims":
      return sellerReclaims();
    case "settle-twice":
      return settleTwice();
  }
}

/** Half a trade is not a trade: the contract will not move one leg without the other. */
async function settleOneLeg(): Promise<AttackResult> {
  const settlement = requireSettlement();
  const { tradeId, outcome } = await proposeTrade({
    buyer: "buyer",
    quantity: ATTACK_QUANTITY,
    price: ATTACK_PRICE,
    delayMinutes: null,
  });
  if (!outcome.ok) return result("settle-one-leg", "blocked", { blocked: outcome.error, tradeId });

  const pledged = await pledgeSecurity(tradeId);
  if (!pledged.ok) return result("settle-one-leg", "blocked", { blocked: pledged.error, tradeId });

  const attempt = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "settle",
    [BigInt(tradeId)],
    GAS_SETTLE,
    { sendRefusal: true },
  );
  return result("settle-one-leg", attempt.ok ? "accepted" : "refused", {
    errorName: attempt.ok ? null : attempt.errorName,
    error: attempt.ok ? null : attempt.error,
    txHash: attempt.txHash ?? null,
    tradeId,
  });
}

/**
 * The template's own point. Both legs are pledged, so the cash is there and the security is
 * there — and the security still cannot land on a buyer the token never verified, which means the
 * cash does not move either.
 */
async function settleWithoutKyc(): Promise<AttackResult> {
  const settlement = requireSettlement();
  const { tradeId, outcome } = await proposeTrade({
    buyer: "unverified",
    quantity: ATTACK_QUANTITY,
    price: ATTACK_PRICE,
    delayMinutes: null,
  });
  if (!outcome.ok) return result("settle-no-kyc", "blocked", { blocked: outcome.error, tradeId });

  const security = await pledgeSecurity(tradeId);
  if (!security.ok) return result("settle-no-kyc", "blocked", { blocked: security.error, tradeId });
  const cash = await pledgeCash(tradeId);
  if (!cash.ok) return result("settle-no-kyc", "blocked", { blocked: cash.error, tradeId });

  const attempt = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "settle",
    [BigInt(tradeId)],
    GAS_SETTLE,
    { sendRefusal: true },
  );
  return result("settle-no-kyc", attempt.ok ? "accepted" : "refused", {
    errorName: attempt.ok ? null : attempt.errorName,
    error: attempt.ok ? null : attempt.error,
    txHash: attempt.txHash ?? null,
    tradeId,
  });
}

/**
 * Only the escrow can release a pledge, and the holder's own way out — reclaiming — does not open
 * until the hold expires. So the Seller cannot change its mind once the security is pledged.
 */
async function sellerReclaims(): Promise<AttackResult> {
  const security = requireSecurity();
  const seller = requireParty("seller");
  if (!seller.privateKey)
    return result("seller-reclaims", "blocked", { blocked: "This desk cannot sign as the Seller." });

  const { tradeId, outcome } = await proposeTrade({
    buyer: "buyer",
    quantity: ATTACK_QUANTITY,
    price: ATTACK_PRICE,
    delayMinutes: null,
  });
  if (!outcome.ok) return result("seller-reclaims", "blocked", { blocked: outcome.error, tradeId });

  const pledged = await pledgeSecurity(tradeId);
  if (!pledged.ok) return result("seller-reclaims", "blocked", { blocked: pledged.error, tradeId });

  const trade = await readTrade(tradeId);
  const attempt = await simulateAndSend(
    security.address,
    securityAbi,
    "reclaimHoldByPartition",
    [{ partition: PARTITION, tokenHolder: seller.address, holdId: trade.securityHoldId }],
    GAS_ATTACK,
    { signer: { privateKey: seller.privateKey }, sendRefusal: true },
  );
  return result("seller-reclaims", attempt.ok ? "accepted" : "refused", {
    errorName: attempt.ok ? null : attempt.errorName,
    error: attempt.ok ? null : attempt.error,
    txHash: attempt.txHash ?? null,
    tradeId,
  });
}

/** A settled trade is finished. Pressing settle again does not pay the seller twice. */
async function settleTwice(): Promise<AttackResult> {
  const settlement = requireSettlement();
  const settled = await findSettledTrade();
  if (settled === null) {
    return result("settle-twice", "blocked", { blocked: "Settle a trade first: there is none to settle twice." });
  }

  const attempt = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "settle",
    [BigInt(settled)],
    GAS_ATTACK,
    { sendRefusal: true },
  );
  return result("settle-twice", attempt.ok ? "accepted" : "refused", {
    errorName: attempt.ok ? null : attempt.errorName,
    error: attempt.ok ? null : attempt.error,
    txHash: attempt.txHash ?? null,
    tradeId: settled,
  });
}

/** The most recent trade the contract reports as settled. */
async function findSettledTrade(): Promise<number | null> {
  const settlement = requireSettlement();
  const next = await requireOperator().publicClient.readContract({
    address: settlement.address,
    abi: settlementAbi,
    functionName: "nextTradeId",
  });
  for (let tradeId = Number(next) - 1; tradeId >= 1; tradeId--) {
    const trade = await readTrade(tradeId);
    if (trade.state === 2) return tradeId;
  }
  return null;
}
