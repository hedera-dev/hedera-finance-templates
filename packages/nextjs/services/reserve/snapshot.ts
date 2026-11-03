// Server-only: everything the page shows about the chain, read from the chain.
import { priceFeedAbi, securityAbi } from "./abi";
import { getOperator } from "./clients";
import { MISSING_CONFIG_MESSAGE } from "./config";
import { BTC_USD_FEED, ROLES } from "./constants";
import { type Desk, state } from "./desk";
import { computeFigures, formatCoverage, formatDuration, formatFeedUsd, formatFixed, formatUsd18 } from "./math";
import { read } from "./rpc";
import type { Address } from "viem";
import { hexToString } from "viem";
import type { AssetTerms, DeskView, HolderView, ReserveSnapshot, ReserveStatus, RoleView } from "~~/types/reserve";

/** A read that failed is `null` here, and is shown as unavailable, never as zero. */
async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

type PriceRound = { answer: bigint; updatedAt: bigint; decimals: number };

export async function readPrice(): Promise<PriceRound | null> {
  return safe(async () => {
    const [round, decimals] = await Promise.all([
      read<readonly [bigint, bigint, bigint, bigint, bigint]>(BTC_USD_FEED, priceFeedAbi, "latestRoundData"),
      read<number>(BTC_USD_FEED, priceFeedAbi, "decimals"),
    ]);
    return { answer: round[1], updatedAt: round[3], decimals: Number(decimals) };
  });
}

const ROLE_ROWS: { key: RoleView["key"]; name: string; role: string }[] = [
  { key: "admin", name: "Admin role (DEFAULT_ADMIN_ROLE)", role: ROLES.admin },
  { key: "issuer", name: "Issuer role", role: ROLES.issuer },
  { key: "agent", name: "Agent role", role: ROLES.agent },
  { key: "controlList", name: "Control-list role", role: ROLES.controlList },
];

async function readTerms(asset: Address): Promise<AssetTerms | null> {
  return safe(async () => {
    const [metadata, nominal, decimals, currency, maxSupply] = await Promise.all([
      read<{ info: { name: string; symbol: string; isin: string } }>(asset, securityAbi, "getERC20Metadata"),
      read<bigint>(asset, securityAbi, "getNominalValue"),
      read<number>(asset, securityAbi, "getNominalValueDecimals"),
      read<`0x${string}`>(asset, securityAbi, "getNominalValueCurrency"),
      read<bigint>(asset, securityAbi, "getMaxSupply"),
    ]);
    return {
      name: metadata.info.name,
      symbol: metadata.info.symbol,
      isin: metadata.info.isin,
      currency: hexToString(currency).replace(/\0/g, ""),
      faceValue: `${formatFixed(nominal, Number(decimals))} ${hexToString(currency).replace(/\0/g, "")}`,
      maxSupply: maxSupply.toString(),
    };
  });
}

async function readDesk(desk: Desk): Promise<DeskView> {
  const [price, quantity, supply, nominal, nominalDecimals, terms, roleMembers, holderReads] = await Promise.all([
    readPrice(),
    safe(() => read<bigint>(desk.collateral.address, securityAbi, "balanceOf", [desk.reserve.address])),
    safe(() => read<bigint>(desk.asset.address, securityAbi, "totalSupply")),
    safe(() => read<bigint>(desk.asset.address, securityAbi, "getNominalValue")),
    safe(async () => Number(await read<number>(desk.asset.address, securityAbi, "getNominalValueDecimals"))),
    readTerms(desk.asset.address),
    Promise.all(
      ROLE_ROWS.map(row =>
        safe(() => read<Address[]>(desk.asset.address, securityAbi, "getRoleMembers", [row.role, 0n, 100n])),
      ),
    ),
    Promise.all(
      desk.holders.map(async holder => ({
        allowlisted: await safe(() =>
          read<boolean>(desk.asset.address, securityAbi, "isInControlList", [holder.address]),
        ),
        balance: await safe(() => read<bigint>(desk.asset.address, securityAbi, "balanceOf", [holder.address])),
      })),
    ),
  ]);

  // Work out the figures only from reads that succeeded.
  let status: ReserveStatus = "UNKNOWN";
  let statusReason: string | null = null;
  let value: string | null = null;
  let liability: string | null = null;
  let coverage: string | null = null;
  let headroom: string | null = null;
  let priceText: string | null = null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (price) {
    const age = nowSeconds - Number(price.updatedAt);
    if (price.answer <= 0n) {
      statusReason = `The price feed answered ${price.answer}, which is not positive. The gate refuses to issue on it.`;
    } else {
      priceText = formatFeedUsd(price.answer, price.decimals);
      if (age > desk.maxPriceAge) {
        statusReason = `The price feed last updated ${formatDuration(age)} ago, older than the ${formatDuration(desk.maxPriceAge)} the gate was deployed with. The gate refuses to issue on it.`;
      }
    }
  } else {
    statusReason = "The price feed could not be read.";
  }

  const unliable = supply === null || nominal === null || nominalDecimals === null;
  if (supply !== null && nominal !== null && nominalDecimals !== null) {
    liability = formatUsd18(supply * nominal * 10n ** BigInt(18 - nominalDecimals));
  }
  if (!statusReason && quantity === null) statusReason = "The reserve balance could not be read.";
  if (!statusReason && unliable) statusReason = "The asset's supply or face value could not be read.";

  if (!statusReason && price && quantity !== null && supply !== null && nominal !== null && nominalDecimals !== null) {
    try {
      const figures = computeFigures({
        quantity,
        priceAnswer: price.answer,
        priceDecimals: price.decimals,
        nominalValue: nominal,
        nominalValueDecimals: nominalDecimals,
        supply,
      });
      status = figures.status;
      value = formatUsd18(figures.reserveValue);
      headroom = figures.headroom.toString();
      coverage = figures.liability === 0n ? null : formatCoverage(figures.reserveValue, figures.liability);
    } catch (error) {
      statusReason = error instanceof Error ? error.message : "The figures could not be computed.";
    }
  }

  const holders: HolderView[] = desk.holders.map((holder, index) => ({
    label: holder.label,
    address: holder.address,
    kind: holder.kind,
    allowlisted: holderReads[index].allowlisted,
    balance: holderReads[index].balance === null ? null : holderReads[index].balance.toString(),
  }));

  return {
    operatorAddress: desk.operator,
    maxPriceAge: desk.maxPriceAge,
    reserve: {
      account: desk.reserve.address,
      collateralAddress: desk.collateral.address,
      collateralContractId: desk.collateral.contractId,
      quantity: quantity === null ? null : quantity.toString(),
      priceFeedAddress: BTC_USD_FEED,
      reserveFeedAddress: desk.reserveFeed.address,
      price: priceText,
      priceUpdatedAt: price ? Number(price.updatedAt) : null,
      value,
    },
    asset: {
      address: desk.asset.address,
      contractId: desk.asset.contractId,
      gateAddress: desk.gate.address,
      terms,
      supply: supply === null ? null : supply.toString(),
      liability,
      coverage,
      headroom,
      status,
      statusReason,
    },
    roles: ROLE_ROWS.map((row, index) => ({ ...row, members: roleMembers[index] })),
    holders,
  };
}

let cached: { at: number; promise: Promise<ReserveSnapshot> } | null = null;

/** The page polls every few seconds from several tabs; concurrent pollers share one read of the chain. */
export function getSnapshot(): Promise<ReserveSnapshot> {
  if (cached && Date.now() - cached.at < 1_500) return cached.promise;
  const promise = buildSnapshot();
  cached = { at: Date.now(), promise };
  return promise;
}

export function invalidateSnapshot() {
  cached = null;
}

async function buildSnapshot(): Promise<ReserveSnapshot> {
  const operator = getOperator();
  const { setup, activity, desk } = state();
  const base = {
    setup: {
      running: setup.running,
      steps: setup.steps.map(step => ({ ...step })),
      error: setup.error,
      completedAt: setup.completedAt,
    },
    activity: activity.map(entry => ({ ...entry })),
  };
  if (!operator.ok) {
    return {
      config: { ok: false, error: operator.error || MISSING_CONFIG_MESSAGE },
      ...base,
      desk: null,
      readError: null,
    };
  }
  const config = { ok: true as const, operatorAddress: operator.operator.account.address };
  if (!desk) return { config, ...base, desk: null, readError: null };
  try {
    return { config, ...base, desk: await readDesk(desk), readError: null };
  } catch (error) {
    return {
      config,
      ...base,
      desk: null,
      readError: error instanceof Error ? error.message : "The chain could not be read.",
    };
  }
}
