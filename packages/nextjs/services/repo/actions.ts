// Server-only: what the desk does. Every action acts with a key (the operator's, or the demo borrower's), so each one
// works only on addresses this desk created: the desk record is the allowlist. Amounts carry upper bounds.
import { billAbi, cashAbi, feedAbi, repoAbi } from "./abi";
import { getOperator, getPublicClient } from "./clients";
import {
  BILLS_ISSUED,
  CASH_UNITS_PER_USD,
  DEMO_BILL_DAYS,
  GAS_CONTROL_LIST,
  GAS_CREATE_HOLD,
  GAS_HTS_APPROVE,
  GAS_ISSUE,
  GRACE_SECONDS,
  HAIRCUT_BPS,
  HOLD_EXPIRY_MARGIN_SECONDS,
  MAX_BORROW_USD,
  MAX_PLEDGE_BILLS,
  MAX_SHOCK_BPS,
  MAX_TOP_UP_USD,
  PARTITION,
  REPO_RATE_BPS,
  SECONDS_PER_DAY,
  STALENESS_SECONDS,
  TERM_DAYS,
} from "./constants";
import { type Desk, getDesk, isRunning, logActivity } from "./desk";
import { decodeFailure } from "./errors";
import { BPS, CASH_SCALE, formatBps, formatUsd8, parseWhole, plainCash } from "./math";
import { read, simulate, withReadRetry } from "./rpc";
import { type RepoPosition, invalidateSnapshot } from "./snapshot";
import { type Executed, execute } from "./tx";
import { type Address, getAddress, isAddress, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ActionRequest, ActionResult, PreviewResult } from "~~/types/repo";

export class ActionRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const MAX_WALLETS = 3;
const NOT_PRICE_RELATED = new Set([
  "PriceStale",
  "PriceInvalid",
  "NotBorrower",
  "WrongState",
  "AmountTooLarge",
  "ZeroAmount",
  "UnknownLoan",
]);

/** The desk and the operator, or a refusal. Every action starts here. */
function context() {
  const operator = getOperator();
  if (!operator.ok) throw new ActionRefused(operator.error, 400);
  if (isRunning()) throw new ActionRefused("Setup is still running.", 409);
  const desk = getDesk();
  if (!desk) throw new ActionRefused("Set up the desk first.", 409);
  return { operator: operator.operator, desk };
}

/** The demo borrower's signer. A wallet borrower signs in its own wallet, so the server refuses to act for it. */
function demoBorrower(desk: Desk) {
  if (desk.activeBorrower.toLowerCase() !== desk.borrower.address.toLowerCase()) {
    throw new ActionRefused(
      "The wallet borrower signs its own transactions in MetaMask. Switch to the demo borrower.",
      409,
    );
  }
  return privateKeyToAccount(desk.borrower.key);
}

const refusal = (name: string, message: string, txHash?: string): ActionResult => ({
  ok: false,
  result: name,
  message,
  txHash,
});

const outcome = (done: Executed, success: string): ActionResult =>
  done.ok
    ? { ok: true, result: "SUCCESS", message: success, txHash: done.hash }
    : refusal(done.name, done.message, done.hash);

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function loanPosition(desk: Desk): Promise<RepoPosition | null> {
  if (desk.loanId === null) return null;
  try {
    return await read<RepoPosition>(desk.repo.address, repoAbi, "position", [desk.loanId]);
  } catch {
    return null;
  }
}

async function readHold(desk: Desk, borrower: Address) {
  if (desk.holdId === null) return null;
  try {
    const hold = await read<readonly [bigint, bigint, Address, Address]>(
      desk.bill.address,
      billAbi,
      "getHoldForByPartition",
      [{ partition: PARTITION, tokenHolder: borrower, holdId: desk.holdId }],
    );
    return { amount: hold[0], expiry: hold[1], escrow: hold[2], destination: hold[3] };
  } catch {
    return null;
  }
}

async function readPrice8(desk: Desk): Promise<bigint | null> {
  try {
    const round = await read<readonly [bigint, bigint, bigint, bigint, bigint]>(
      desk.feed.address,
      feedAbi,
      "latestRoundData",
    );
    return round[1] > 0n ? round[1] : null;
  } catch {
    return null;
  }
}

/** The repo contract's own pre-flight answer to a loan of `amountText` dollars, asked without sending anything. */
export async function previewOpen(amountText: unknown): Promise<PreviewResult> {
  const { operator, desk } = context();
  const label = typeof amountText === "string" ? amountText : "";
  const dollars = parseWhole(amountText, MAX_BORROW_USD);
  if (dollars === null) {
    return {
      amount: label,
      verdict: "unknown",
      reason: `Enter a whole number of dollars from 1 to ${MAX_BORROW_USD}.`,
      capacity: null,
      needs: null,
      ltv: null,
    };
  }
  const principal8 = dollars * 100n * CASH_SCALE;
  const [hold, price8] = await Promise.all([readHold(desk, desk.activeBorrower), readPrice8(desk)]);
  if (!hold || hold.amount === 0n) {
    return {
      amount: dollars.toString(),
      verdict: "unknown",
      reason: "There is no pledge to read yet. Pledge bills first.",
      capacity: null,
      needs: null,
      ltv: null,
    };
  }
  if (price8 === null) {
    return {
      amount: dollars.toString(),
      verdict: "unknown",
      reason: "The price could not be read, so no figure here can be stood behind.",
      capacity: null,
      needs: null,
      ltv: null,
    };
  }
  const value8 = price8 * hold.amount;
  const capacity8 = (value8 * (BPS - BigInt(HAIRCUT_BPS))) / BPS;
  const needs8 = (principal8 * BPS + (BPS - BigInt(HAIRCUT_BPS)) - 1n) / (BPS - BigInt(HAIRCUT_BPS));
  const ltvBps = value8 === 0n ? 0n : (principal8 * BPS + value8 - 1n) / value8;
  const figures = {
    capacity: formatUsd8(capacity8),
    needs: formatUsd8(needs8),
    ltv: formatBps(ltvBps),
  };

  const answer = await simulate({
    account: operator.account.address,
    address: desk.repo.address,
    abi: repoAbi,
    functionName: "validateOpen",
    args: [desk.activeBorrower, desk.holdId, hold.amount, dollars * CASH_UNITS_PER_USD, BigInt(TERM_DAYS)],
  });
  if (answer.ok) return { amount: dollars.toString(), verdict: "allowed", reason: null, ...figures };
  return {
    amount: dollars.toString(),
    verdict: answer.reverted ? "refused" : "unknown",
    reason: answer.message,
    ...figures,
  };
}

async function pledge(request: { amount: string }, wrongEscrow: boolean): Promise<ActionResult> {
  const { operator, desk } = context();
  const amount = parseWhole(request.amount, MAX_PLEDGE_BILLS);
  if (amount === null) throw new ActionRefused(`Enter a whole number of bills from 1 to ${MAX_PLEDGE_BILLS}.`, 400);
  const borrower = demoBorrower(desk);
  const action = wrongEscrow
    ? `Pledge ${amount} bills naming the LENDER as escrow (wrong)`
    : `Pledge ${amount} bills as collateral (hold: escrow = repo, destination = lender)`;

  if ((await loanPosition(desk))?.state === 1) {
    logActivity({ action, result: "LoanAlreadyOpen" });
    return refusal("LoanAlreadyOpen", "A loan is already open against the current pledge. Repay it first.");
  }

  // The hold's expiry is in REAL seconds: the term plus grace, converted at the demo clock, plus a margin.
  const expiry = BigInt(
    nowSeconds() + TERM_DAYS * Number(SECONDS_PER_DAY) + GRACE_SECONDS + HOLD_EXPIRY_MARGIN_SECONDS,
  );
  const hold = {
    amount,
    expirationTimestamp: expiry,
    escrow: wrongEscrow ? operator.account.address : desk.repo.address,
    to: operator.account.address,
    data: "0x" as const,
  };

  // The simulation is how the hold id is learned; the hold is the borrower's own, so nobody else is minting ids.
  let holdId: bigint;
  try {
    const simulated = await withReadRetry(() =>
      getPublicClient().simulateContract({
        account: borrower,
        address: desk.bill.address,
        abi: billAbi,
        functionName: "createHoldByPartition",
        args: [PARTITION, hold],
        gas: GAS_CREATE_HOLD,
      }),
    );
    holdId = simulated.result[1];
  } catch (error) {
    const decoded = decodeFailure(error);
    logActivity({ action, result: decoded.name });
    return refusal(decoded.name, decoded.message);
  }

  const done = await execute({
    account: borrower,
    action,
    to: desk.bill.address,
    abi: billAbi,
    functionName: "createHoldByPartition",
    args: [PARTITION, hold],
    gas: GAS_CREATE_HOLD,
  });
  invalidateSnapshot();
  if (!done.ok) return outcome(done, "");
  desk.holdId = holdId;
  desk.activeBorrower = desk.borrower.address;
  return outcome(
    done,
    wrongEscrow
      ? "Pledged. From outside it looks like any pledge, but the escrow is the lender, not the repo contract."
      : "Pledged. The bills stayed in the borrower's account.",
  );
}

async function openLoan(request: { amount: string }): Promise<ActionResult> {
  const { operator, desk } = context();
  const dollars = parseWhole(request.amount, MAX_BORROW_USD);
  if (dollars === null) throw new ActionRefused(`Enter a whole number of dollars from 1 to ${MAX_BORROW_USD}.`, 400);
  const units = dollars * CASH_UNITS_PER_USD;
  const action = `Open a loan of $${dollars} against the pledge`;

  const hold = await readHold(desk, desk.activeBorrower);
  if (!hold || desk.holdId === null) {
    logActivity({ action, result: "NoPledge" });
    return refusal("NoPledge", "There is no pledge to borrow against. Pledge bills first.");
  }

  // The repo contract's own checks, run before any gas is spent on an approval.
  const args = [desk.activeBorrower, desk.holdId, hold.amount, units, BigInt(TERM_DAYS)] as const;
  const check = await simulate({
    account: operator.account.address,
    address: desk.repo.address,
    abi: repoAbi,
    functionName: "validateOpen",
    args,
  });
  if (!check.ok) {
    logActivity({ action, result: check.name });
    return refusal(check.name, check.message);
  }
  if ((await loanPosition(desk))?.state === 1) {
    logActivity({ action, result: "LoanAlreadyOpen" });
    return refusal("LoanAlreadyOpen", "A loan is already open. Repay it first.");
  }

  const approved = await execute({
    account: operator.account,
    action: `Approve the repo contract to pull $${dollars} of the lender's stablecoin`,
    to: desk.token.address,
    abi: cashAbi,
    functionName: "approve",
    args: [desk.repo.address, units],
    gas: GAS_HTS_APPROVE,
  });
  if (!approved.ok) return outcome(approved, "");

  const done = await execute({
    account: operator.account,
    action,
    to: desk.repo.address,
    abi: repoAbi,
    functionName: "openLoan",
    args: [desk.activeBorrower, desk.holdId, hold.amount, units, BigInt(REPO_RATE_BPS), BigInt(TERM_DAYS)],
  });
  invalidateSnapshot();
  if (!done.ok) return outcome(done, "");
  const opened = parseEventLogs({ abi: repoAbi, eventName: "LoanOpened", logs: done.logs as never }).find(
    log => log.address.toLowerCase() === desk.repo.address.toLowerCase(),
  );
  if (opened) desk.loanId = opened.args.loanId as bigint;
  else desk.loanId = (await read<bigint>(desk.repo.address, repoAbi, "nextLoanId")) - 1n;
  return outcome(done, `Lent $${dollars} in one transaction, against a hold the contract read for itself.`);
}

async function repay(): Promise<ActionResult> {
  const { desk } = context();
  const borrower = demoBorrower(desk);
  const action = "Repay principal plus interest and release the collateral";
  const position = await loanPosition(desk);
  if (!position || position.state !== 1) {
    logActivity({ action, result: "WrongState" });
    return refusal("WrongState", "There is no open loan to repay.");
  }
  const cash = await read<bigint>(desk.token.address, cashAbi, "balanceOf", [borrower.address]).catch(() => null);
  if (cash !== null && cash < position.debt) {
    logActivity({ action, result: "InsufficientCash" });
    return refusal(
      "InsufficientCash",
      `The borrower holds ${plainCash(cash)} and owes ${plainCash(position.debt)}. The repayment is refused and the hold stays.`,
    );
  }
  // Interest keeps accruing between this read and the transaction, so the allowance covers the whole term.
  const remaining = position.termRemainingDays;
  const ceiling = position.debt + (position.principal * BigInt(REPO_RATE_BPS) * remaining) / 3_600_000n + 1n;

  const approved = await execute({
    account: borrower,
    action: "Approve the repo contract to pull the repayment",
    to: desk.token.address,
    abi: cashAbi,
    functionName: "approve",
    args: [desk.repo.address, ceiling],
    gas: GAS_HTS_APPROVE,
  });
  if (!approved.ok) return outcome(approved, "");

  const done = await execute({
    account: borrower,
    action,
    to: desk.repo.address,
    abi: repoAbi,
    functionName: "repay",
    args: [desk.loanId],
  });
  invalidateSnapshot();
  return outcome(done, "Repaid and released in one transaction: the bills are free again.");
}

async function topUp(request: { amount: string }): Promise<ActionResult> {
  const { desk } = context();
  const borrower = demoBorrower(desk);
  const dollars = parseWhole(request.amount, MAX_TOP_UP_USD);
  if (dollars === null) throw new ActionRefused(`Enter a whole number of dollars from 1 to ${MAX_TOP_UP_USD}.`, 400);
  const units = dollars * CASH_UNITS_PER_USD;
  const action = `Repay $${dollars} of the principal to cure`;
  if (desk.loanId === null) {
    logActivity({ action, result: "UnknownLoan" });
    return refusal("UnknownLoan", "There is no loan.");
  }

  // Without an allowance the transfer fails; anything that fails BEFORE the transfer is a real refusal.
  const probe = await simulate({
    account: borrower.address,
    address: desk.repo.address,
    abi: repoAbi,
    functionName: "topUp",
    args: [desk.loanId, units],
  });
  if (!probe.ok && NOT_PRICE_RELATED.has(probe.name)) {
    logActivity({ action, result: probe.name });
    return refusal(probe.name, probe.message);
  }

  const approved = await execute({
    account: borrower,
    action: `Approve the repo contract to pull $${dollars}`,
    to: desk.token.address,
    abi: cashAbi,
    functionName: "approve",
    args: [desk.repo.address, units],
    gas: GAS_HTS_APPROVE,
  });
  if (!approved.ok) return outcome(approved, "");

  const done = await execute({
    account: borrower,
    action,
    to: desk.repo.address,
    abi: repoAbi,
    functionName: "topUp",
    args: [desk.loanId, units],
  });
  invalidateSnapshot();
  return outcome(done, `Repaid $${dollars} of the principal. The debt and the LTV are lower.`);
}

async function liquidate(): Promise<ActionResult> {
  const { operator, desk } = context();
  const action = "Take the collateral (liquidate)";
  if (desk.loanId === null) {
    logActivity({ action, result: "UnknownLoan" });
    return refusal("UnknownLoan", "There is no loan.");
  }
  const done = await execute({
    account: operator.account,
    action,
    to: desk.repo.address,
    abi: repoAbi,
    functionName: "liquidate",
    args: [desk.loanId],
  });
  invalidateSnapshot();
  if (!done.ok) return outcome(done, "");
  const event = parseEventLogs({ abi: repoAbi, eventName: "LoanLiquidated", logs: done.logs as never }).find(
    log => log.address.toLowerCase() === desk.repo.address.toLowerCase(),
  );
  const byTerm = event?.args.byTerm;
  return outcome(
    done,
    byTerm === undefined
      ? "The bills moved to the lender."
      : byTerm
        ? "Liquidated. The trigger was the term: it ended unpaid. No price was read."
        : "Liquidated. The trigger was the price: the LTV reached the threshold on a price the contract trusted.",
  );
}

async function setFeed(
  functionName: "setDiscountRate" | "pinUpdatedAt" | "setMaturityTimestamp",
  value: bigint,
  action: string,
  success: string,
): Promise<ActionResult> {
  const { operator, desk } = context();
  const done = await execute({
    account: operator.account,
    action,
    to: desk.feed.address,
    abi: feedAbi,
    functionName,
    args: [value],
  });
  invalidateSnapshot();
  return outcome(done, success);
}

async function transferPledged(): Promise<ActionResult> {
  const { operator, desk } = context();
  const borrower = demoBorrower(desk);
  const free = await read<bigint>(desk.bill.address, billAbi, "balanceOf", [borrower.address]).catch(() => null);
  if (free === null) throw new ActionRefused("The borrower's free balance could not be read.", 502);
  // More than the free balance: the only way to reach the held units, which are not in balanceOf.
  const attempt = free + 1n;
  const done = await execute({
    account: borrower,
    action: `Borrower tries to transfer ${attempt} bills (free balance ${free})`,
    to: desk.bill.address,
    abi: billAbi,
    functionName: "transfer",
    args: [operator.account.address, attempt],
    gas: GAS_ISSUE,
  });
  invalidateSnapshot();
  return outcome(done, "The transfer went through, which should not happen.");
}

async function reclaimPledge(): Promise<ActionResult> {
  const { desk } = context();
  const borrower = demoBorrower(desk);
  if (desk.holdId === null) throw new ActionRefused("There is no pledge to reclaim.", 409);
  const done = await execute({
    account: borrower,
    action: "Borrower tries to reclaim the pledge",
    to: desk.bill.address,
    abi: billAbi,
    functionName: "reclaimHoldByPartition",
    args: [{ partition: PARTITION, tokenHolder: borrower.address, holdId: desk.holdId }],
    gas: GAS_CONTROL_LIST * 2n,
  });
  invalidateSnapshot();
  return outcome(done, "The pledge was reclaimed, which should not happen while the hold is live.");
}

/**
 * The escrow asks ATS to execute the hold to an address other than the one recorded on it. The repo contract has no
 * function that could send such a call, by design, so it is asked as the escrow with an `eth_call`: nothing is sent,
 * and ATS answers with what it would do.
 */
async function redirectPledge(): Promise<ActionResult> {
  const { desk } = context();
  const action = "Escrow tries to execute the hold to a different address (simulated as the escrow)";
  const hold = await readHold(desk, desk.activeBorrower);
  if (!hold || desk.holdId === null) throw new ActionRefused("There is no pledge to redirect.", 409);
  const elsewhere = desk.activeBorrower;
  const answer = await simulate({
    account: desk.repo.address,
    address: desk.bill.address,
    abi: billAbi,
    functionName: "executeHoldByPartition",
    args: [{ partition: PARTITION, tokenHolder: desk.activeBorrower, holdId: desk.holdId }, elsewhere, hold.amount],
  });
  if (answer.ok) {
    logActivity({ action, result: "SUCCESS" });
    return {
      ok: true,
      result: "SUCCESS",
      message: "ATS would have accepted a different destination, which should not happen.",
    };
  }
  logActivity({ action, result: answer.name });
  return refusal(answer.name, answer.message);
}

async function addWallet(request: { address: string }): Promise<ActionResult> {
  const { operator, desk } = context();
  if (!isAddress(request.address)) throw new ActionRefused("That is not an address.", 400);
  const wallet = getAddress(request.address);
  const action = `Add ${wallet} as a borrower`;
  const known = desk.wallets.some(candidate => candidate.toLowerCase() === wallet.toLowerCase());
  if (known) return { ok: true, result: "SUCCESS", message: "That wallet is already a borrower." };
  if (desk.wallets.length >= MAX_WALLETS) throw new ActionRefused(`At most ${MAX_WALLETS} wallets per desk.`, 400);

  const listed = await read<boolean>(desk.bill.address, billAbi, "isInControlList", [wallet]).catch(() => false);
  if (!listed) {
    const added = await execute({
      account: operator.account,
      action: `Allowlist ${wallet} on the bill`,
      to: desk.bill.address,
      abi: billAbi,
      functionName: "addToControlList",
      args: [wallet],
      gas: GAS_CONTROL_LIST,
    });
    if (!added.ok) return outcome(added, "");
  }
  const issued = await execute({
    account: operator.account,
    action: `Issue ${BILLS_ISSUED} bills to ${wallet}`,
    to: desk.bill.address,
    abi: billAbi,
    functionName: "issue",
    args: [wallet, BILLS_ISSUED, "0x"],
    gas: GAS_ISSUE,
  });
  if (!issued.ok) return outcome(issued, "");
  desk.wallets.push(wallet);
  logActivity({ action, result: "SUCCESS", txHash: issued.hash });
  invalidateSnapshot();
  return outcome(issued, `Allowlisted and issued ${BILLS_ISSUED} bills. Pledge them from your wallet.`);
}

/** The wallet signed its own pledge; the desk checks it on the bill before driving the loan against it. */
async function registerWalletPledge(request: { address: string; holdId: string }): Promise<ActionResult> {
  const { operator, desk } = context();
  if (!isAddress(request.address) || !/^\d{1,12}$/.test(request.holdId)) throw new ActionRefused("Bad request.", 400);
  const wallet = getAddress(request.address);
  if (!desk.wallets.some(candidate => candidate.toLowerCase() === wallet.toLowerCase())) {
    throw new ActionRefused("That wallet was not added to this desk.", 400);
  }
  const holdId = BigInt(request.holdId);
  const hold = await read<readonly [bigint, bigint, Address, Address]>(
    desk.bill.address,
    billAbi,
    "getHoldForByPartition",
    [{ partition: PARTITION, tokenHolder: wallet, holdId }],
  ).catch(() => null);
  const action = `Register the wallet's pledge (hold ${holdId})`;
  if (!hold) {
    logActivity({ action, result: "NoSuchHold" });
    return refusal("NoSuchHold", "The bill reports no such hold for that wallet.");
  }
  if (hold[2].toLowerCase() !== desk.repo.address.toLowerCase()) {
    logActivity({ action, result: "HoldEscrowMismatch" });
    return refusal("HoldEscrowMismatch", `The hold names ${hold[2]} as escrow, not the repo contract.`);
  }
  if (hold[3].toLowerCase() !== operator.account.address.toLowerCase()) {
    logActivity({ action, result: "HoldDestinationMismatch" });
    return refusal("HoldDestinationMismatch", `The hold would deliver to ${hold[3]}, not the lender.`);
  }
  desk.holdId = holdId;
  desk.activeBorrower = wallet;
  logActivity({ action, result: "SUCCESS" });
  invalidateSnapshot();
  return {
    ok: true,
    result: "SUCCESS",
    message: "The pledge is verified on the bill. The lender can lend against it.",
  };
}

export async function runAction(request: ActionRequest): Promise<ActionResult> {
  switch (request.type) {
    case "pledge":
      return pledge(request, false);
    case "pledge-wrong-escrow":
      return pledge(request, true);
    case "open":
      return openLoan(request);
    case "repay":
      return repay();
    case "top-up":
      return topUp(request);
    case "liquidate":
      return liquidate();
    case "shock": {
      const bps = parseWhole(request.bps, BigInt(MAX_SHOCK_BPS), 0n);
      if (bps === null) throw new ActionRefused(`Enter a rate from 0 to ${MAX_SHOCK_BPS} basis points.`, 400);
      return setFeed("setDiscountRate", bps, `Publish a discount rate of ${bps}bp`, `Published ${bps}bp.`);
    }
    case "freeze":
      return setFeed(
        "pinUpdatedAt",
        BigInt(nowSeconds() - STALENESS_SECONDS - 120),
        "Stop the price feed (pin updatedAt outside the staleness window)",
        "The feed's updatedAt is pinned outside the staleness window.",
      );
    case "resume":
      return setFeed(
        "pinUpdatedAt",
        0n,
        "Restart the price feed (unpin updatedAt)",
        "The feed reports the current time again.",
      );
    case "restart-bill":
      return setFeed(
        "setMaturityTimestamp",
        BigInt(nowSeconds() + DEMO_BILL_DAYS * Number(SECONDS_PER_DAY)),
        `Restart the bill's ${DEMO_BILL_DAYS}-day clock`,
        `The bill has ${DEMO_BILL_DAYS} demo days left again.`,
      );
    case "transfer-pledged":
      return transferPledged();
    case "reclaim-pledge":
      return reclaimPledge();
    case "redirect-pledge":
      return redirectPledge();
    case "add-wallet":
      return addWallet(request);
    case "register-wallet-pledge":
      return registerWalletPledge(request);
    default:
      throw new ActionRefused("Unknown action.", 400);
  }
}
