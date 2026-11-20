// Server-only: what the desk does to a trade. Every one of these is one or two transactions and
// nothing else; the page's own view of a trade always comes back from the chain afterwards.
import { securityAbi, settlementAbi, settlementCallAbi, stablecoinAbi } from "./abi";
import { requireOperator, retryTransient } from "./clients";
import {
  CASH_UNITS_PER_DOLLAR,
  GAS_CANCEL,
  GAS_CREATE_HOLD,
  GAS_PLEDGE,
  GAS_PROPOSE,
  GAS_SETTLE,
  HOLD_LIFETIME_SECONDS,
  MAX_SETTLEMENT_DELAY_MINUTES,
  PARTITION,
} from "./constants";
import {
  addHistory,
  partyForAddress,
  requireCash,
  requireParty,
  requireSecurity,
  requireSettlement,
} from "./deskState";
import { simulateAndSend } from "./tx";
import type { WriteOutcome } from "./tx";
import { decodeEventLog, encodeFunctionData } from "viem";
import type { Address, Hex, TransactionReceipt } from "viem";
import type { PartyId } from "~~/services/dvp/types";

export type ProposeInput = { buyer: PartyId; quantity: bigint; price: bigint; delayMinutes: number | null };

/** The terms, checked here so the page never sends the contract something it would refuse. */
export function validateTerms(input: ProposeInput) {
  if (input.quantity <= 0n) throw new Error("The quantity has to be a positive whole number of units.");
  if (input.price <= 0n) throw new Error("The price has to be a positive whole number.");
  if (input.buyer !== "buyer" && input.buyer !== "unverified") throw new Error(`${input.buyer} is not a buyer.`);
  if (input.delayMinutes !== null) {
    if (!Number.isInteger(input.delayMinutes) || input.delayMinutes < 1) {
      throw new Error("A settlement delay has to be a whole number of minutes, at least 1.");
    }
    if (input.delayMinutes > MAX_SETTLEMENT_DELAY_MINUTES) {
      throw new Error(`A settlement delay of more than ${MAX_SETTLEMENT_DELAY_MINUTES} minutes is out of range.`);
    }
  }
}

/** Cash is quoted in whole units on the page and held in the stablecoin's 2 decimals on-chain. */
export const toCashUnits = (whole: bigint) => whole * CASH_UNITS_PER_DOLLAR;

export async function proposeTrade(input: ProposeInput): Promise<{ tradeId: number; outcome: WriteOutcome }> {
  validateTerms(input);
  const settlement = requireSettlement();
  const seller = requireParty("seller");
  const buyer = requireParty(input.buyer);

  const notBefore = input.delayMinutes === null ? 0n : BigInt(Math.floor(Date.now() / 1000) + input.delayMinutes * 60);

  // The id the contract will assign, read before the call so the trade can be named in history.
  const tradeId = Number(
    await retryTransient(() =>
      requireOperator().publicClient.readContract({
        address: settlement.address,
        abi: settlementAbi,
        functionName: "nextTradeId",
      }),
    ),
  );

  const outcome = await simulateAndSend(
    settlement.address,
    settlementAbi,
    "propose",
    [buyer.address, input.quantity, toCashUnits(input.price), notBefore],
    GAS_PROPOSE,
    { signer: seller.privateKey ? { privateKey: seller.privateKey } : "operator" },
  );

  addHistory({
    action: `Seller proposed ${input.quantity} ${requireSecurity().symbol} for ${input.price} to the ${buyer.label}`,
    reference: `trade ${tradeId}`,
    result: outcome.ok ? "SUCCESS" : outcome.errorName,
    txHash: outcome.txHash ?? null,
    kind: "propose",
  });
  return { tradeId, outcome };
}

type TradeOnChain = {
  seller: Address;
  buyer: Address;
  quantity: bigint;
  price: bigint;
  notBefore: bigint;
  securityHoldId: bigint;
  cashHoldId: bigint;
  state: number;
};

export async function readTrade(tradeId: number): Promise<TradeOnChain> {
  const settlement = requireSettlement();
  return (await retryTransient(() =>
    requireOperator().publicClient.readContract({
      address: settlement.address,
      abi: settlementAbi,
      functionName: "getTrade",
      args: [BigInt(tradeId)],
    }),
  )) as TradeOnChain;
}

/** Every pledge expires, and this is when: late enough to outlast the trade, short enough to unwind. */
function holdExpiry(notBefore: bigint): bigint {
  const base = BigInt(Math.floor(Date.now() / 1000)) + BigInt(HOLD_LIFETIME_SECONDS);
  return notBefore > base ? notBefore + BigInt(HOLD_LIFETIME_SECONDS) : base;
}

/** The hold id the token assigned, from its own event. */
function holdIdFromLogs(
  logs: TransactionReceipt["logs"],
  token: Address,
  abi: typeof securityAbi | typeof stablecoinAbi,
) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "HeldByPartition" && decoded.eventName !== "HoldCreated") continue;
      return (decoded.args as unknown as { holdId: bigint }).holdId;
    } catch {
      // Not the event we are looking for; the token emits others.
    }
  }
  return null;
}

/**
 * The Seller's side: one transaction creates the hold on the security, a second records it
 * against the trade. The second needs no permission — the hold itself is the proof — so the desk
 * submits it, and a wallet seller would only ever have to sign the first.
 */
export async function pledgeSecurity(tradeId: number): Promise<WriteOutcome> {
  const security = requireSecurity();
  const settlement = requireSettlement();
  const seller = requireParty("seller");
  const trade = await readTrade(tradeId);

  const hold = {
    amount: trade.quantity,
    expirationTimestamp: holdExpiry(trade.notBefore),
    escrow: settlement.address,
    to: trade.buyer,
    data: "0x" as Hex,
  };
  const created = await simulateAndSend(
    security.address,
    securityAbi,
    "createHoldByPartition",
    [PARTITION, hold],
    GAS_CREATE_HOLD,
    { signer: seller.privateKey ? { privateKey: seller.privateKey } : "operator" },
  );
  if (!created.ok) {
    addHistory({
      action: "Seller pledged the security",
      reference: `trade ${tradeId}`,
      result: created.errorName,
      txHash: created.txHash ?? null,
      kind: "pledge",
    });
    return created;
  }

  const holdId = holdIdFromLogs(created.logs, security.address, securityAbi);
  if (holdId === null) throw new Error("The security hold was created but the token emitted no hold event.");

  const recorded = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "lockSecurity",
    [BigInt(tradeId), holdId],
    GAS_PLEDGE,
  );
  addHistory({
    action: `Seller pledged ${trade.quantity} ${security.symbol}, held for the buyer`,
    reference: `trade ${tradeId}`,
    result: recorded.ok ? "SUCCESS" : recorded.errorName,
    txHash: recorded.txHash ?? created.txHash,
    kind: "pledge",
  });
  return recorded;
}

/** The Buyer's side, the same way round: create the hold on the cash, then record it. */
export async function pledgeCash(tradeId: number): Promise<WriteOutcome> {
  const cash = requireCash();
  const settlement = requireSettlement();
  const trade = await readTrade(tradeId);
  const buyer = partyForAddress(trade.buyer);
  if (!buyer) throw new Error("This desk does not know the buyer of that trade.");
  if (!buyer.privateKey) throw new Error("That trade's buyer is a connected wallet; it pledges its own cash.");

  const created = await simulateAndSend(
    cash.proxyAddress,
    stablecoinAbi,
    "createHold",
    [
      {
        amount: trade.price,
        expirationTimestamp: holdExpiry(trade.notBefore),
        escrow: settlement.address,
        to: trade.seller,
        data: "0x" as Hex,
      },
    ],
    GAS_CREATE_HOLD,
    { signer: { privateKey: buyer.privateKey } },
  );
  if (!created.ok) {
    addHistory({
      action: `${buyer.label} pledged the cash`,
      reference: `trade ${tradeId}`,
      result: created.errorName,
      txHash: created.txHash ?? null,
      kind: "pledge",
    });
    return created;
  }

  const holdId = holdIdFromLogs(created.logs, cash.proxyAddress, stablecoinAbi);
  if (holdId === null) throw new Error("The cash hold was created but the stablecoin emitted no hold event.");

  const recorded = await recordCashPledge(tradeId, holdId, buyer.label);
  return recorded;
}

/** Records a cash hold against a trade. Shared by the demo buyer and the wallet buyer. */
export async function recordCashPledge(tradeId: number, holdId: bigint, who: string): Promise<WriteOutcome> {
  const settlement = requireSettlement();
  const outcome = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "lockCash",
    [BigInt(tradeId), holdId],
    GAS_PLEDGE,
  );
  addHistory({
    action: `${who} pledged the cash, held for the seller`,
    reference: `trade ${tradeId}`,
    result: outcome.ok ? "SUCCESS" : outcome.errorName,
    txHash: outcome.txHash ?? null,
    kind: "pledge",
  });
  return outcome;
}

/** The hold the connected wallet is asked to sign, as an unsigned request for it to send itself. */
export async function prepareWalletCashHold(tradeId: number) {
  const cash = requireCash();
  const settlement = requireSettlement();
  const trade = await readTrade(tradeId);

  return {
    to: cash.proxyAddress,
    // An ordinary `createHold` call the wallet signs itself: no special signing path, and the
    // wallet pays for it.
    data: encodeFunctionData({
      abi: stablecoinAbi,
      functionName: "createHold",
      args: [
        {
          amount: trade.price,
          expirationTimestamp: holdExpiry(trade.notBefore),
          escrow: settlement.address,
          to: trade.seller,
          data: "0x" as Hex,
        },
      ],
    }),
    gas: GAS_CREATE_HOLD.toString(),
    price: (trade.price / CASH_UNITS_PER_DOLLAR).toString(),
    seller: trade.seller,
  };
}

/** After the wallet's own transaction: read the hold id out of its receipt and record the pledge. */
export async function submitWalletCashPledge(tradeId: number, txHash: Hex): Promise<WriteOutcome> {
  const operator = requireOperator();
  const cash = requireCash();
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`The wallet's hold transaction ${txHash} failed on-chain.`);

  const holdId = holdIdFromLogs(receipt.logs, cash.proxyAddress, stablecoinAbi);
  if (holdId === null) throw new Error("That transaction created no hold on this market's stablecoin.");
  return recordCashPledge(tradeId, holdId, "The connected wallet");
}

/**
 * Both legs, in one call. Anyone may press it, so the desk signs with the operator: the terms and
 * both destinations were fixed by the parties when they pledged.
 */
export async function settleTrade(tradeId: number): Promise<WriteOutcome> {
  const settlement = requireSettlement();
  const trade = await readTrade(tradeId);
  const buyer = partyForAddress(trade.buyer);

  const outcome = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "settle",
    [BigInt(tradeId)],
    GAS_SETTLE,
    // A refused settlement is worth having on the ledger: it is the template's own point.
    { sendRefusal: true },
  );
  addHistory({
    action: `Settled both legs with the ${buyer?.label ?? "buyer"}`,
    reference: `trade ${tradeId}`,
    result: outcome.ok ? "SUCCESS" : outcome.errorName,
    txHash: outcome.txHash ?? null,
    kind: "settle",
  });
  return outcome;
}

/** Either party may cancel; the contract refuses anyone else, so the caller is the party asked for. */
export async function cancelTrade(tradeId: number, by: PartyId): Promise<WriteOutcome> {
  const settlement = requireSettlement();
  const party = requireParty(by);
  if (!party.privateKey) throw new Error(`The ${party.label} is a connected wallet; it cancels for itself.`);

  const outcome = await simulateAndSend(
    settlement.address,
    settlementCallAbi,
    "cancel",
    [BigInt(tradeId)],
    GAS_CANCEL,
    { signer: { privateKey: party.privateKey } },
  );
  addHistory({
    action: `${party.label} cancelled the trade; both pledges released`,
    reference: `trade ${tradeId}`,
    result: outcome.ok ? "SUCCESS" : outcome.errorName,
    txHash: outcome.txHash ?? null,
    kind: "cancel",
  });
  return outcome;
}
