// Server-only: what the issuer does at the desk. Every action acts with the operator's key (or the reserve's), so
// each one works only on addresses this desk created: the desk record is the allowlist. Amounts carry upper bounds.
import { gateAbi, securityAbi } from "./abi";
import { getOperator } from "./clients";
import { MAX_ISSUE_UNITS, MAX_WALLET_HOLDERS, MAX_WITHDRAW_UNITS, ROLES, ZERO_ADDRESS } from "./constants";
import { type Desk, getDesk, isRunning, logActivity, state } from "./desk";
import { formatUsd18, parseUnits } from "./math";
import { computeFigures } from "./math";
import { read, simulate } from "./rpc";
import { getSnapshot, invalidateSnapshot, readPrice } from "./snapshot";
import { execute } from "./tx";
import { type Address, getAddress, isAddress, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ActionResult, PreviewResult } from "~~/types/reserve";

export class ActionRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The desk and the operator, or a refusal. Every action starts here. */
function context() {
  const operator = getOperator();
  if (!operator.ok) throw new ActionRefused(operator.error, 400);
  if (isRunning()) throw new ActionRefused("Setup is still running.", 409);
  const desk = getDesk();
  if (!desk) throw new ActionRefused("Set up the desk first.", 409);
  return { operator: operator.operator, desk };
}

function holderOf(desk: Desk, address: unknown): Address {
  if (typeof address !== "string") throw new ActionRefused("Choose a holder.", 400);
  const match = desk.holders.find(holder => holder.address.toLowerCase() === address.toLowerCase());
  if (!match) throw new ActionRefused("That address is not one of this desk's holders.", 400);
  return match.address;
}

const outcome = (done: Awaited<ReturnType<typeof execute>>, success: string): ActionResult =>
  done.ok
    ? { ok: true, result: "SUCCESS", message: success, txHash: done.hash }
    : { ok: false, result: done.name, message: done.message, txHash: done.hash };

/** The gate's own answer to an issuance, asked without sending anything. */
export async function previewIssue(amountText: unknown, holderAddress: unknown): Promise<PreviewResult> {
  const { operator, desk } = context();
  const amountLabel = typeof amountText === "string" ? amountText : "";
  const amount = parseUnits(amountText, MAX_ISSUE_UNITS);
  if (amount === null) {
    return {
      amount: amountLabel,
      verdict: "unknown",
      reason: `Enter a whole number of units from 1 to ${MAX_ISSUE_UNITS}.`,
      covers: null,
      needs: null,
    };
  }
  const holder = holderOf(desk, holderAddress ?? desk.holders[0].address);

  const [answer, quantity, supply, nominal, nominalDecimals, price] = await Promise.all([
    simulate({
      account: operator.account.address,
      address: desk.gate.address,
      abi: gateAbi,
      functionName: "issue",
      args: [holder, amount],
    }),
    read<bigint>(desk.collateral.address, securityAbi, "balanceOf", [desk.reserve.address]).catch(() => null),
    read<bigint>(desk.asset.address, securityAbi, "totalSupply").catch(() => null),
    read<bigint>(desk.asset.address, securityAbi, "getNominalValue").catch(() => null),
    read<number>(desk.asset.address, securityAbi, "getNominalValueDecimals").catch(() => null),
    readPrice(),
  ]);

  let covers: string | null = null;
  let needs: string | null = null;
  if (
    price &&
    price.answer > 0n &&
    quantity !== null &&
    supply !== null &&
    nominal !== null &&
    nominalDecimals !== null
  ) {
    const after = computeFigures({
      quantity,
      priceAnswer: price.answer,
      priceDecimals: price.decimals,
      nominalValue: nominal,
      nominalValueDecimals: Number(nominalDecimals),
      supply: supply + amount,
    });
    covers = formatUsd18(after.reserveValue);
    needs = formatUsd18(after.liability);
  }

  if (answer.ok) return { amount: amount.toString(), verdict: "allowed", reason: null, covers, needs };
  if (!answer.reverted) {
    return { amount: amount.toString(), verdict: "unknown", reason: answer.message, covers, needs };
  }
  return { amount: amount.toString(), verdict: "refused", reason: answer.message, covers, needs };
}

export async function issueThroughGate(amountText: unknown, holderAddress: unknown): Promise<ActionResult> {
  const { operator, desk } = context();
  const amount = parseUnits(amountText, MAX_ISSUE_UNITS);
  if (amount === null) throw new ActionRefused(`Enter a whole number of units from 1 to ${MAX_ISSUE_UNITS}.`, 400);
  const holder = holderOf(desk, holderAddress);

  invalidateSnapshot();
  const snapshot = await getSnapshot();
  if (snapshot.desk?.asset.status === "UNKNOWN") {
    const reason = snapshot.desk.asset.statusReason ?? "The reserve could not be read.";
    logActivity({ action: `Issue ${amount} units through the gate`, result: "ReserveUnknown" });
    return {
      ok: false,
      result: "ReserveUnknown",
      message: `ReserveUnknown: the gate cannot be known to allow this. ${reason}`,
    };
  }

  const done = await execute({
    account: operator.account,
    action: `Issue ${amount} units through the gate to ${shorten(holder)}`,
    to: desk.gate.address,
    abi: gateAbi,
    functionName: "issue",
    args: [holder, amount],
  });
  invalidateSnapshot();
  return outcome(done, `Issued ${amount} units to ${holder}.`);
}

export async function withdrawCollateral(amountText: unknown): Promise<ActionResult> {
  const { operator, desk } = context();
  const amount = parseUnits(amountText, MAX_WITHDRAW_UNITS);
  if (amount === null) throw new ActionRefused(`Enter a whole number of units from 1 to ${MAX_WITHDRAW_UNITS}.`, 400);

  const done = await execute({
    account: privateKeyToAccount(desk.reserve.key),
    action: `Move ${amount} collateral units out of the reserve`,
    to: desk.collateral.address,
    abi: securityAbi,
    functionName: "transfer",
    args: [operator.account.address, amount],
  });
  invalidateSnapshot();
  return outcome(done, `Moved ${amount} collateral units out of the reserve to the operator.`);
}

export async function directIssue(): Promise<ActionResult> {
  const { operator, desk } = context();
  const done = await execute({
    account: operator.account,
    action: "Issue 1 unit directly on the asset, without the gate",
    to: desk.asset.address,
    abi: securityAbi,
    functionName: "issue",
    args: [desk.holders[0].address, 1n, "0x"],
  });
  invalidateSnapshot();
  return outcome(done, "The asset accepted the issuance: the operator holds the issuer role, so nothing stopped it.");
}

export async function bypassGate(): Promise<ActionResult> {
  const { operator, desk } = context();

  invalidateSnapshot();
  const snapshot = await getSnapshot();
  const headroom = BigInt(snapshot.desk?.asset.headroom ?? "0");
  const amount = headroom + 1n;

  const [supply, maxSupply, alreadyIssuer] = await Promise.all([
    read<bigint>(desk.asset.address, securityAbi, "totalSupply"),
    read<bigint>(desk.asset.address, securityAbi, "getMaxSupply"),
    read<boolean>(desk.asset.address, securityAbi, "hasRole", [ROLES.issuer, operator.account.address]),
  ]);
  if (amount > MAX_ISSUE_UNITS || supply + amount > maxSupply) {
    return {
      ok: false,
      result: "MaxSupplyReached",
      message: "MaxSupplyReached: the asset's supply is too close to its cap to issue past the reserve.",
    };
  }

  let grantTxHash: `0x${string}` | undefined;
  if (!alreadyIssuer) {
    const grant = await execute({
      account: operator.account,
      action: "Grant the operator the issuer role on the asset",
      to: desk.asset.address,
      abi: securityAbi,
      functionName: "grantRole",
      args: [ROLES.issuer, operator.account.address],
    });
    if (!grant.ok) return outcome(grant, "");
    grantTxHash = grant.hash;
    const emitted = parseEventLogs({ abi: securityAbi, eventName: "RoleGranted", logs: grant.logs as never }).some(
      log => log.address.toLowerCase() === desk.asset.address.toLowerCase() && log.args.role === ROLES.issuer,
    );
    if (!emitted) logActivity({ action: "The grant emitted no RoleGranted event", result: "UNEXPECTED" });
  }

  const issued = await execute({
    account: operator.account,
    action: `Issue ${amount} units directly, past the reserve`,
    to: desk.asset.address,
    abi: securityAbi,
    functionName: "issue",
    args: [desk.holders[0].address, amount, "0x"],
  });
  invalidateSnapshot();
  const result = outcome(issued, `Issued ${amount} units, one more than the reserve covered.`);
  return { ...result, grantTxHash };
}

export async function addWalletHolder(addressText: unknown): Promise<ActionResult> {
  const { operator, desk } = context();
  if (typeof addressText !== "string" || !isAddress(addressText, { strict: false })) {
    throw new ActionRefused("That is not an EVM address.", 400);
  }
  const address = getAddress(addressText);
  if (address === ZERO_ADDRESS) throw new ActionRefused("That is not an EVM address.", 400);
  if (desk.holders.some(holder => holder.address.toLowerCase() === address.toLowerCase())) {
    return { ok: true, result: "SUCCESS", message: "That wallet is already a holder." };
  }
  if (desk.holders.filter(holder => holder.kind === "wallet").length >= MAX_WALLET_HOLDERS) {
    throw new ActionRefused(`This desk takes at most ${MAX_WALLET_HOLDERS} wallet holders.`, 400);
  }

  const listed = await read<boolean>(desk.asset.address, securityAbi, "isInControlList", [address]);
  let result: ActionResult = { ok: true, result: "SUCCESS", message: "Wallet added as a holder." };
  if (!listed) {
    const done = await execute({
      account: operator.account,
      action: `Allowlist wallet ${shorten(address)} on the asset`,
      to: desk.asset.address,
      abi: securityAbi,
      functionName: "addToControlList",
      args: [address],
    });
    result = outcome(done, "Wallet allowlisted and added as a holder.");
    if (!done.ok) return result;
  }
  state().desk?.holders.push({ label: "My wallet", address, kind: "wallet" });
  invalidateSnapshot();
  return result;
}

const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
