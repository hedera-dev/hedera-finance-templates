// Server-only: everything the page shows about the chain, read from the chain. A read that fails comes back as
// `null`, which the page shows as unavailable: never as a number, never as a status it cannot stand behind.
import { billAbi, cashAbi, feedAbi, repoAbi, reserveAbi, stablecoinAbi } from "./abi";
import { getOperator } from "./clients";
import {
  HAIRCUT_BPS,
  LIQUIDATION_THRESHOLD_BPS,
  PARTITION,
  REPO_RATE_BPS,
  ROLES,
  ROLE_LABELS,
  TERM_DAYS,
  ZERO_ADDRESS,
} from "./constants";
import { type Desk, getDesk, state } from "./desk";
import { BPS, CASH_SCALE, formatBps, formatFixed, formatUsd8, plainCash } from "./math";
import { read } from "./rpc";
import type { Address } from "viem";
import type { DeskView, LoanStatus, Snapshot, WalletView } from "~~/types/repo";

type Round = readonly [bigint, bigint, bigint, bigint, bigint];
type Hold = readonly [bigint, bigint, Address, Address, `0x${string}`, `0x${string}`, number];
type Loan = {
  borrower: Address;
  collateral: bigint;
  holdId: bigint;
  principal: bigint;
  openedAt: bigint;
  termDays: bigint;
  openPrice8: bigint;
  state: number;
};
export type RepoPosition = {
  state: number;
  rawPrice: bigint;
  updatedAt: bigint;
  priceUsable: boolean;
  value8: bigint;
  principal: bigint;
  interest: bigint;
  debt: bigint;
  ltvBps: bigint;
  liquidationPrice8: bigint;
  termRemainingDays: bigint;
  termElapsed: boolean;
};

/** A read that may fail: `null` rather than a throw, so one bad read never blanks the whole page. */
const attempt = <T>(run: () => Promise<T>): Promise<T | null> => run().catch(() => null);

// Slow-moving reads are cached so a one-second refresh stays light on the relay. A failed refresh keeps the last
// good value, and a value that was never read stays `null`.
const slow = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T | null> {
  const hit = slow.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await attempt(run);
  if (value !== null) {
    slow.set(key, { at: Date.now(), value });
    return value;
  }
  return (hit?.value as T | undefined) ?? null;
}

export const priceText = (price8: bigint) => formatUsd8(price8);

/** The loan's status from what was read. `UNKNOWN` whenever the reads cannot support another answer. */
export function statusOf(input: { loanId: bigint | null; position: RepoPosition | null }): {
  status: LoanStatus;
  note: string;
} {
  if (input.loanId === null) {
    return { status: "NO LOAN", note: "No loan yet. Pledge bills, then borrow against the pledge." };
  }
  const p = input.position;
  if (!p) return { status: "UNKNOWN", note: "The loan could not be read, so no claim is made about it." };
  if (p.state === 2) return { status: "REPAID", note: "Repaid. The hold was released and the bills are free again." };
  if (p.state === 3) {
    return {
      status: "LIQUIDATED",
      note: "Liquidated. The bills moved to the lender, the destination fixed at pledge time.",
    };
  }
  if (p.state !== 1) return { status: "UNKNOWN", note: "The loan could not be read, so no claim is made about it." };
  if (p.termElapsed) {
    return {
      status: "LIQUIDATABLE",
      note: "The term has ended unpaid. Anyone may take the collateral; this path reads no price. Repaying still gets the bills back until someone does.",
    };
  }
  if (!p.priceUsable) {
    return {
      status: "UNKNOWN",
      note: "The price is zero, negative or stale, so no figure here can be stood behind. New credit is blocked and price liquidation is refused; term liquidation is not.",
    };
  }
  // Exact cross-multiplication, as the contract does it: the rounded-up LTV shown on the page is not the test.
  const debt8 = p.debt * CASH_SCALE;
  if (p.value8 > 0n && debt8 * BPS >= BigInt(LIQUIDATION_THRESHOLD_BPS) * p.value8) {
    return {
      status: "LIQUIDATABLE",
      note: "The LTV is at or above the threshold. Repaying part of the principal cures it; otherwise the lender may take the collateral.",
    };
  }
  if (debt8 * BPS > (BPS - BigInt(HAIRCUT_BPS)) * p.value8) {
    return {
      status: "MARGIN CALL",
      note: "The LTV is above the borrowing limit but under the liquidation threshold. Repaying part of the principal cures it. Nothing is seized automatically.",
    };
  }
  return { status: "OPEN", note: "Healthy: the debt is within what the collateral supports after the haircut." };
}

async function walletView(desk: Desk, address: string): Promise<WalletView | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const wallet = address as Address;
  const [allowlisted, balance, held] = await Promise.all([
    attempt(() => read<boolean>(desk.bill.address, billAbi, "isInControlList", [wallet])),
    attempt(() => read<bigint>(desk.bill.address, billAbi, "balanceOf", [wallet])),
    attempt(() => read<bigint>(desk.bill.address, billAbi, "getHeldAmountForByPartition", [PARTITION, wallet])),
  ]);
  return {
    address: wallet,
    added: desk.wallets.some(candidate => candidate.toLowerCase() === wallet.toLowerCase()),
    allowlisted,
    balance: balance === null ? null : balance.toString(),
    held: held === null ? null : held.toString(),
  };
}

async function buildDesk(desk: Desk): Promise<DeskView> {
  const borrower = desk.activeBorrower;
  const loanId = desk.loanId;

  const [
    round,
    days,
    rate,
    held,
    free,
    lenderCash,
    borrowerCash,
    loan,
    position,
    hold,
    terms,
    maturity,
    controlList,
    roles,
    reserve,
    reserveDecimals,
  ] = await Promise.all([
    attempt(() => read<Round>(desk.feed.address, feedAbi, "latestRoundData")),
    attempt(() => read<bigint>(desk.feed.address, feedAbi, "daysRemaining")),
    attempt(() => read<bigint>(desk.feed.address, feedAbi, "discountRateBps")),
    attempt(() => read<bigint>(desk.bill.address, billAbi, "getHeldAmountForByPartition", [PARTITION, borrower])),
    attempt(() => read<bigint>(desk.bill.address, billAbi, "balanceOf", [borrower])),
    attempt(() => read<bigint>(desk.token.address, cashAbi, "balanceOf", [desk.operator])),
    attempt(() => read<bigint>(desk.token.address, cashAbi, "balanceOf", [borrower])),
    loanId === null
      ? Promise.resolve(null)
      : attempt(() => read<Loan>(desk.repo.address, repoAbi, "getLoan", [loanId])),
    loanId === null
      ? Promise.resolve(null)
      : attempt(() => read<RepoPosition>(desk.repo.address, repoAbi, "position", [loanId])),
    desk.holdId === null
      ? Promise.resolve(null)
      : attempt(() =>
          read<Hold>(desk.bill.address, billAbi, "getHoldForByPartition", [
            { partition: PARTITION, tokenHolder: borrower, holdId: desk.holdId },
          ]),
        ),
    cached("terms", 60_000, () =>
      read<{ info: { name: string; symbol: string; isin: string } }>(
        desk.bill.address,
        billAbi,
        "getERC20Metadata",
      ).then(async metadata => {
        const [nominal, decimals] = await Promise.all([
          read<bigint>(desk.bill.address, billAbi, "getNominalValue"),
          read<number>(desk.bill.address, billAbi, "getNominalValueDecimals"),
        ]);
        return { metadata, nominal, decimals: Number(decimals) };
      }),
    ),
    cached("maturity", 60_000, () => read<bigint>(desk.bill.address, billAbi, "getMaturityDate")),
    cached("controlList", 15_000, () =>
      read<boolean>(desk.bill.address, billAbi, "isInControlList", [desk.repo.address]),
    ),
    cached("roles", 15_000, async () => {
      const held: string[] = [];
      for (const [key, role] of Object.entries(ROLES)) {
        const has = await read<boolean>(desk.bill.address, billAbi, "hasRole", [role, desk.repo.address]);
        if (has) held.push(ROLE_LABELS[key as keyof typeof ROLES]);
      }
      return held;
    }),
    cached("reserve", 10_000, () =>
      read<readonly [bigint, bigint]>(desk.stablecoin.address, stablecoinAbi, "getReserveAmount"),
    ),
    desk.reserve
      ? cached("reserveDecimals", 600_000, () => read<number>(desk.reserve!.address, reserveAbi, "decimals"))
      : Promise.resolve(null),
  ]);

  // ---- the price
  const answer = round ? round[1] : null;
  const priceOk = answer !== null && answer > 0n;
  const price8 = priceOk ? answer : null;
  const priceUpdatedAt = round ? Number(round[3]) : null;

  // ---- the position
  const collateral = held ?? null;
  const value8 = price8 !== null && collateral !== null ? price8 * collateral : null;
  const capacity8 = value8 !== null ? (value8 * (BPS - BigInt(HAIRCUT_BPS))) / BPS : null;

  const loanOpen = position?.state === 1;
  const hasLoan = loanId !== null;
  const { status, note } = statusOf({ loanId, position });

  const debtUnits = hasLoan ? (position ? position.debt : null) : 0n;
  const principalUnits = hasLoan ? (position ? position.principal : null) : 0n;
  const interestUnits = hasLoan ? (position ? position.interest : null) : 0n;
  const debt8 = debtUnits !== null ? debtUnits * CASH_SCALE : null;

  let ltv: string | null = null;
  if (!hasLoan) ltv = value8 !== null || collateral === 0n ? "0.00%" : null;
  else if (position && position.state !== 0 && position.value8 > 0n) ltv = formatBps(position.ltvBps);

  let headroom: string | null = null;
  if (capacity8 !== null && debt8 !== null) {
    headroom = plainCash((capacity8 > debt8 ? capacity8 - debt8 : 0n) / CASH_SCALE);
    if (loanOpen && !position?.priceUsable) headroom = null;
  }

  let accretion: string | null = null;
  let carry: string | null = null;
  let carryNote: string | null = null;
  if (loan && loanOpen && price8 !== null && interestUnits !== null) {
    const gained = (price8 - loan.openPrice8) * loan.collateral;
    const cost = interestUnits * CASH_SCALE;
    accretion = formatUsd8(gained);
    const difference = gained - cost;
    carry = formatUsd8(difference);
    carryNote =
      difference > 0n
        ? "Accretion is larger than the interest: the bill earns more than the funding costs."
        : difference < 0n
          ? "Interest is larger than the accretion so far: the funding costs more than the bill has earned."
          : "Accretion and interest are equal so far.";
  }

  const termRemaining =
    hasLoan && position && position.state !== 0 ? position.termRemainingDays.toString() : hasLoan ? null : "0";

  // ---- the hold, as the bill reports it
  // A released or executed hold reads back as all zeroes: no escrow, expiry 0. Show that as no hold, not as 1970.
  const holdOk = hold !== null && hold[2] !== undefined && hold[2] !== ZERO_ADDRESS;
  const reserveScaleDecimals = reserveDecimals === null ? 2 : Number(reserveDecimals);

  return {
    readAt: Date.now(),
    operator: desk.operator,
    borrower: {
      address: borrower,
      kind: borrower.toLowerCase() === desk.borrower.address.toLowerCase() ? "demo" : "wallet",
    },
    demoBorrower: desk.borrower.address,
    holdId: desk.holdId === null ? null : desk.holdId.toString(),
    loanId: loanId === null ? null : loanId.toString(),
    bill: {
      address: desk.bill.address,
      contractId: desk.bill.contractId,
      terms:
        terms && maturity !== null
          ? {
              name: terms.metadata.info.name,
              symbol: terms.metadata.info.symbol,
              isin: terms.metadata.info.isin,
              faceValue: formatUsd8(terms.nominal * 10n ** BigInt(8 - terms.decimals)),
              maturityMs: Number(maturity) * 1000,
            }
          : null,
      feed: desk.feed,
      discountRateBps: rate === null ? null : rate.toString(),
      daysRemaining: days === null ? null : days.toString(),
      price: price8 === null ? null : formatUsd8(price8),
      priceUpdatedAt,
    },
    position: {
      pledged: held === null ? null : held.toString(),
      free: free === null ? null : free.toString(),
      value: value8 === null ? null : formatUsd8(value8),
      haircut: formatBps(HAIRCUT_BPS),
      capacity: capacity8 === null ? null : formatUsd8(capacity8),
      principal: principalUnits === null ? null : plainCash(principalUnits),
      interest: interestUnits === null ? null : plainCash(interestUnits),
      debt: debtUnits === null ? null : plainCash(debtUnits),
      ltv,
      threshold: formatBps(LIQUIDATION_THRESHOLD_BPS),
      liquidationPrice: loanOpen && position ? formatUsd8(position.liquidationPrice8) : null,
      headroom,
      accretion,
      carry,
      carryNote,
      termRemaining,
      status,
      statusNote: note,
      loanOpen,
      termElapsed: Boolean(position?.termElapsed),
    },
    cash: {
      proxy: desk.stablecoin,
      token: desk.token,
      reserve: desk.reserve,
      lenderCash: lenderCash === null ? null : plainCash(lenderCash),
      borrowerCash: borrowerCash === null ? null : plainCash(borrowerCash),
      reserveAmount: reserve === null ? null : formatFixed(reserve[0] < 0n ? 0n : reserve[0], reserveScaleDecimals),
    },
    encumbrance: {
      escrow: desk.repo,
      holdDestination: holdOk ? hold![3] : null,
      holdEscrow: holdOk ? hold![2] : null,
      holdExpiryMs: holdOk ? Number(hold![1]) * 1000 : null,
      holdAmount: holdOk ? hold![0].toString() : null,
      repoInControlList: controlList === null ? null : controlList ? "yes" : "no",
      repoRoles: roles === null ? null : roles.length === 0 ? "none" : roles.join(", "),
    },
    wallet: null,
    termDays: TERM_DAYS,
    repoRateBps: REPO_RATE_BPS,
  };
}

// One read of the desk is shared by every page and tab asking within a short window.
let cache: { at: number; promise: Promise<DeskView | null>; generation: number } | null = null;
let generation = 0;
const SHARE_MS = 700;

export function invalidateSnapshot() {
  generation++;
  cache = null;
}

async function sharedDesk(): Promise<DeskView | null> {
  const desk = getDesk();
  if (!desk) return null;
  if (cache && cache.generation === generation && Date.now() - cache.at < SHARE_MS) return cache.promise;
  const promise = buildDesk(desk);
  cache = { at: Date.now(), promise, generation };
  try {
    return await promise;
  } catch (error) {
    cache = null;
    throw error;
  }
}

export async function getSnapshot(walletAddress?: string | null): Promise<Snapshot> {
  const operator = getOperator();
  const { setup, activity } = state();
  const desk = getDesk();
  let view: DeskView | null = null;
  if (desk && !setup.running) {
    const shared = await sharedDesk();
    view = shared ? { ...shared, wallet: walletAddress ? await walletView(desk, walletAddress) : null } : null;
  }
  return {
    configured: operator.ok,
    configError: operator.ok ? null : operator.error,
    setup: { ...setup, steps: setup.steps.map(step => ({ ...step })) },
    desk: view,
    activity: activity.slice(0, 100),
    serverTime: Date.now(),
  };
}
