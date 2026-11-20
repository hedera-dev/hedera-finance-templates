// Server-only: builds the single consolidated view the page polls. Every fact about the chain
// here is read from the two tokens and the settlement contract on every call — desk memory
// supplies only what the chain does not record, like which demo account is which party.
import { cashAbi, securityAbi, settlementAbi, stablecoinAbi } from "./abi";
import { getOperatorConfig, getPublicClient, retryTransient } from "./clients";
import {
  CASH_UNITS_PER_DOLLAR,
  DEFAULT_PRICE,
  DEFAULT_QUANTITY,
  DEFAULT_SETTLEMENT_DELAY_MINUTES,
  MAX_SETTLEMENT_DELAY_MINUTES,
  PARTITION,
} from "./constants";
import { getDeskState, partyForAddress } from "./deskState";
import type { CashRecord, PartyRecord, SecurityRecord } from "./deskState";
import { getAddress } from "viem";
import type { Address } from "viem";
import type { DeskView, PartyView, TradeState, TradeView, WalletState } from "~~/services/dvp/types";

/** A read that failed has made no claim: the page shows `Unknown` rather than a stale number. */
const UNAVAILABLE = "unavailable" as const;

async function readOr<T>(run: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
  try {
    return await retryTransient(run);
  } catch {
    return UNAVAILABLE;
  }
}

/** Whole units from the stablecoin's 2 decimals, which is how the page quotes cash. */
function cashWhole(units: bigint | typeof UNAVAILABLE): string | typeof UNAVAILABLE {
  if (units === UNAVAILABLE) return UNAVAILABLE;
  return (units / CASH_UNITS_PER_DOLLAR).toString();
}

async function buildPartyView(party: PartyRecord, security: SecurityRecord, cash: CashRecord): Promise<PartyView> {
  const client = getPublicClient();

  const [securityFree, securityHeld, cashFree, cashHeld, kycStatus] = await Promise.all([
    readOr(() =>
      client.readContract({
        address: security.address,
        abi: securityAbi,
        functionName: "balanceOf",
        args: [party.address],
      }),
    ),
    readOr(() =>
      client.readContract({
        address: security.address,
        abi: securityAbi,
        functionName: "getHeldAmountForByPartition",
        args: [PARTITION, party.address],
      }),
    ),
    readOr(() =>
      client.readContract({
        address: cash.tokenAddress,
        abi: cashAbi,
        functionName: "balanceOf",
        args: [party.address],
      }),
    ),
    readOr(() =>
      client.readContract({
        address: cash.proxyAddress,
        abi: stablecoinAbi,
        functionName: "getHeldAmountFor",
        args: [party.address],
      }),
    ),
    readOr(() =>
      client.readContract({
        address: security.address,
        abi: securityAbi,
        functionName: "getKycStatusFor",
        args: [party.address],
      }),
    ),
  ]);

  const heldCash = cashHeld === UNAVAILABLE ? UNAVAILABLE : BigInt(cashHeld);
  // The HTS balance is what the account can still move; held units are reported separately by the
  // stablecoin proxy, which is where the hold lives.
  return {
    id: party.id,
    label: party.label,
    address: party.address,
    accountId: party.accountId,
    isWallet: party.isWallet,
    kyc: kycStatus === UNAVAILABLE ? UNAVAILABLE : Number(kycStatus) === 1,
    securityFree: securityFree === UNAVAILABLE ? UNAVAILABLE : securityFree.toString(),
    securityHeld: securityHeld === UNAVAILABLE ? UNAVAILABLE : securityHeld.toString(),
    cashFree: cashWhole(cashFree === UNAVAILABLE ? UNAVAILABLE : BigInt(cashFree)),
    cashHeld: cashWhole(heldCash),
  };
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

async function buildTradeViews(settlement: Address, security: Address): Promise<TradeView[]> {
  const client = getPublicClient();
  const next = await readOr(() =>
    client.readContract({ address: settlement, abi: settlementAbi, functionName: "nextTradeId" }),
  );
  if (next === UNAVAILABLE) return [];

  const ids = Array.from({ length: Number(next) - 1 }, (_, i) => i + 1);
  const views = await Promise.all(
    ids.map(async tradeId => {
      const trade = (await readOr(() =>
        client.readContract({
          address: settlement,
          abi: settlementAbi,
          functionName: "getTrade",
          args: [BigInt(tradeId)],
        }),
      )) as TradeOnChain | typeof UNAVAILABLE;
      if (trade === UNAVAILABLE) return null;

      const settleable = await readOr(() =>
        client.readContract({
          address: settlement,
          abi: settlementAbi,
          functionName: "isSettleable",
          args: [BigInt(tradeId)],
        }),
      );

      const securityPledged = trade.securityHoldId !== 0n;
      const cashPledged = trade.cashHoldId !== 0n;
      const state = await tradeState(trade, securityPledged, cashPledged, settleable === true, security, client);

      return {
        tradeId,
        seller: partyForAddress(trade.seller)?.id ?? null,
        buyer: partyForAddress(trade.buyer)?.id ?? null,
        sellerAddress: trade.seller,
        buyerAddress: trade.buyer,
        quantity: trade.quantity.toString(),
        price: (trade.price / CASH_UNITS_PER_DOLLAR).toString(),
        notBefore: Number(trade.notBefore),
        securityPledged,
        cashPledged,
        state,
        settleable: settleable === true,
        canCancel: trade.state === 1,
      } satisfies TradeView;
    }),
  );
  return views.filter((view): view is TradeView => view !== null).reverse();
}

/**
 * The trade's state, as the chain has it. `EXPIRED` is the one that cannot be read from the
 * settlement contract alone: an open trade whose pledges have outlived their holds can no longer
 * settle, and each party reclaims their own units from the token instead.
 */
async function tradeState(
  trade: TradeOnChain,
  securityPledged: boolean,
  cashPledged: boolean,
  settleable: boolean,
  security: Address,
  client: ReturnType<typeof getPublicClient>,
): Promise<TradeState> {
  if (trade.state === 2) return "SETTLED";
  if (trade.state === 3) return "CANCELLED";
  if (!securityPledged || !cashPledged) return "AWAITING PLEDGES";

  const hold = await readOr(() =>
    client.readContract({
      address: security,
      abi: securityAbi,
      functionName: "getHoldForByPartition",
      args: [{ partition: PARTITION, tokenHolder: trade.seller, holdId: trade.securityHoldId }],
    }),
  );
  if (hold !== UNAVAILABLE) {
    const expiry = Number((hold as readonly unknown[])[1]);
    if (expiry * 1000 < Date.now()) return "EXPIRED";
  }
  // Both legs are in, so what is left is the clock: a trade with a settlement time is not
  // awaiting anything from its parties.
  return settleable ? "READY" : "WAITING FOR THE TIME";
}

function buildWalletState(walletEvmAddress?: string): WalletState {
  if (!walletEvmAddress) return { kind: "none" };
  const address = getAddress(walletEvmAddress);
  const party = getDeskState().parties.find(p => p.isWallet && p.address === address);
  return party ? { kind: "buyer", address } : { kind: "spectator", address };
}

export async function buildDeskView(walletEvmAddress?: string): Promise<DeskView> {
  const defaults = {
    quantity: DEFAULT_QUANTITY.toString(),
    price: DEFAULT_PRICE.toString(),
    maxDelayMinutes: MAX_SETTLEMENT_DELAY_MINUTES,
    defaultDelayMinutes: DEFAULT_SETTLEMENT_DELAY_MINUTES,
  };
  const operator = getOperatorConfig();
  if (!operator.configured) {
    return {
      configured: false,
      configError: operator.error,
      missing: operator.missing,
      setupComplete: false,
      market: { security: null, cash: null, settlement: null },
      parties: [],
      trades: [],
      history: [],
      wallet: buildWalletState(walletEvmAddress),
      defaults,
    };
  }

  const state = getDeskState();
  const built = Boolean(state.security && state.cash && state.settlement);

  const [parties, trades] = await Promise.all([
    built
      ? Promise.all(state.parties.map(party => buildPartyView(party, state.security!, state.cash!)))
      : Promise.resolve([]),
    built ? buildTradeViews(state.settlement!.address, state.security!.address) : Promise.resolve([]),
  ]);

  // The last setup step deals out the starting position, so a market where nobody holds anything
  // is one whose setup did not finish: the tour stays on Set up rather than offering a trade
  // nobody could pledge.
  const seller = parties.find(p => p.id === "seller");
  const setupComplete =
    state.parties.length === 3 &&
    built &&
    seller !== undefined &&
    seller.securityFree !== UNAVAILABLE &&
    seller.securityFree !== "0";

  return {
    configured: true,
    configError: null,
    missing: [],
    setupComplete,
    market: {
      security: state.security
        ? { address: state.security.address, contractId: state.security.contractId, symbol: state.security.symbol }
        : null,
      cash: state.cash
        ? {
            proxyAddress: state.cash.proxyAddress,
            proxyContractId: state.cash.proxyContractId,
            tokenAddress: state.cash.tokenAddress,
            tokenId: state.cash.tokenId,
            symbol: state.cash.symbol,
          }
        : null,
      settlement: state.settlement
        ? { address: state.settlement.address, contractId: state.settlement.contractId }
        : null,
    },
    parties,
    trades,
    history: state.history.slice(0, 50).map(({ timestampMs, action, reference, result, txHash, kind }) => ({
      at: new Date(timestampMs).toISOString(),
      action,
      reference,
      result,
      txHash,
      kind,
    })),
    wallet: buildWalletState(walletEvmAddress),
    defaults,
  };
}
