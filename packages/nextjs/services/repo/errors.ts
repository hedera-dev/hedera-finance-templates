// Server-only: turning viem errors into text that is safe to show and to log.
// A viem error carries the request body, which for a transaction is the signed transaction. Nothing here
// ever repeats it: only the decoded error name or a short message leaves this module.
import { allErrorsAbi } from "./abi";
import { ROLES } from "./constants";
import { formatBps, formatCash, formatDuration, formatUsd8 } from "./math";
import { type Hex, decodeErrorResult, isHex } from "viem";

type Chained = {
  cause?: unknown;
  data?: unknown;
  raw?: unknown;
  shortMessage?: string;
  message?: string;
  status?: number;
  code?: number;
  name?: string;
  details?: unknown;
};

function* walk(error: unknown): Generator<Chained> {
  let current = error as Chained | undefined;
  for (let depth = 0; current && typeof current === "object" && depth < 12; depth++) {
    yield current;
    current = current.cause as Chained | undefined;
  }
}

/** The revert data carried anywhere in the error's cause chain. */
export function revertData(error: unknown): Hex | undefined {
  for (const link of walk(error)) {
    for (const candidate of [link.raw, link.data, (link.data as Chained | undefined)?.data]) {
      if (typeof candidate === "string" && isHex(candidate) && candidate.length >= 10) return candidate;
    }
  }
  return undefined;
}

export type Decoded = { name: string; message: string; reverted: boolean };

/** The refusal's error name when the chain gave one; otherwise a safe, short description. */
export function decodeFailure(error: unknown): Decoded {
  const data = revertData(error);
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: allErrorsAbi, data });
      return { name: decoded.errorName, message: describe(decoded.errorName, decoded.args ?? []), reverted: true };
    } catch {
      return {
        name: `UnknownError(${data.slice(0, 10)})`,
        message: `The contract reverted with ${data.slice(0, 10)}.`,
        reverted: true,
      };
    }
  }
  const text = shortText(error);
  if (/revert/i.test(text))
    return { name: "Reverted", message: "The contract reverted without giving a reason.", reverted: true };
  return { name: "Failed", message: relayText(error) ?? text, reverted: false };
}

/**
 * The relay's own words. viem titles every non-2xx "HTTP request failed." and files the reason under
 * `details`, so without this a relay hiccup and a real rejection read identically. `body` is never
 * touched: on a send it is the signed transaction.
 */
function relayText(error: unknown): string | undefined {
  for (const link of walk(error)) {
    if (link.name !== "HttpRequestError") continue;
    const detail = typeof link.details === "string" ? clean(link.details) : "";
    const status = link.status ? `HTTP ${link.status}` : "an HTTP error";
    return detail ? `The relay answered ${status}: ${detail}` : `The relay answered ${status}.`;
  }
  return undefined;
}

const ROLE_NAMES: Record<string, string> = {
  [ROLES.admin]: "admin",
  [ROLES.issuer]: "issuer",
  [ROLES.agent]: "agent",
  [ROLES.controlList]: "control list",
};
const roleName = (role: string) => ROLE_NAMES[role] ?? role;

function describe(name: string, args: readonly unknown[]): string {
  const [first, second] = args;
  switch (name) {
    case "HoldEscrowMismatch":
      return `HoldEscrowMismatch: the hold names ${String(second)} as escrow, not the repo contract ${String(first)}. Nothing was lent.`;
    case "HoldDestinationMismatch":
      return `HoldDestinationMismatch: the hold would deliver the bills to ${String(second)}, not the lender ${String(first)}. Nothing was lent.`;
    case "HoldTooSmall":
      return `HoldTooSmall: the hold covers ${String(first)} bills and the loan claims ${String(second)}.`;
    case "HoldExpiresTooSoon":
      return `HoldExpiresTooSoon: the hold expires at ${new Date(Number(first) * 1000).toLocaleTimeString()}, before the ${new Date(Number(second) * 1000).toLocaleTimeString()} the term plus grace period needs.`;
    case "HoldAlreadyUsed":
      return "HoldAlreadyUsed: that hold already secures a loan. Pledge again for a new one.";
    case "ExceedsCapacity":
      return `ExceedsCapacity: ${formatUsd8(first as bigint)} requested against a capacity of ${formatUsd8(second as bigint)} after the haircut. Nothing was lent.`;
    case "PriceInvalid":
      return `PriceInvalid: the price feed answered ${String(first)}, which is not a price anyone can stand behind.`;
    case "PriceStale": {
      const age = Math.floor(Date.now() / 1000) - Number(first);
      return `PriceStale: the price feed last updated ${formatDuration(age)} ago, older than the ${formatDuration(Number(second))} the repo contract allows.`;
    }
    case "NotLiquidatable":
      return `NotLiquidatable: the LTV is ${formatBps(first as bigint)}, under the ${formatBps(second as bigint)} threshold, and the term has not ended.`;
    case "NotLender":
      return `NotLender: ${String(first)} is not the lender; only the lender can open a loan.`;
    case "NotBorrower":
      return `NotBorrower: ${String(first)} is not this loan's borrower.`;
    case "AmountTooLarge":
      return `AmountTooLarge: ${formatCash(first as bigint)} is more than the ${formatCash(second as bigint)} outstanding.`;
    case "WrongState":
      return "WrongState: that loan is no longer open.";
    case "IsNotEscrow":
      return "IsNotEscrow: only the hold's escrow may execute or release it.";
    case "InvalidPartition":
      return `InvalidPartition: ${String(first)} has no free bills to move. Every unit is under the hold, so ATS finds nothing in the partition to transfer.`;
    case "InvalidDestinationAddress":
      return `InvalidDestinationAddress: the hold's destination is ${String(first)}; it cannot be executed to ${String(second)}.`;
    case "AccountHasNoRoles":
      return `AccountHasNoRoles: ${String(first)} holds none of the roles required (${(second as string[]).map(roleName).join(" or ")}).`;
    case "AccountHasNoRole":
      return `AccountHasNoRole: ${String(first)} does not hold the role required.`;
    case "AccountIsBlocked":
      return `AccountIsBlocked: ${String(first)} is not on the bill's control list.`;
    default:
      return args.length > 0 ? `${name}(${args.map(arg => String(arg)).join(", ")})` : name;
  }
}

/** A one-line description with the request body (and anything after it) removed. */
export function shortText(error: unknown): string {
  for (const link of walk(error)) {
    const text = link.shortMessage ?? (error instanceof Error ? undefined : link.message);
    if (text) return clean(text);
  }
  return clean(error instanceof Error ? ((error as Chained).shortMessage ?? error.message) : String(error));
}

function clean(text: string): string {
  const cut = text.split(/Request Arguments:|Request body:|Raw Call Arguments:|Details:|Version:/i)[0];
  return (
    cut
      .replace(/0x[0-9a-fA-F]{120,}/g, "0x…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300) || "The request failed."
  );
}

/**
 * A transient relay failure arrives as HTTP 400 with a `-32000` body, so the status cannot tell it from a
 * revert. A revert carries revert data or says so; a relay hiccup carries neither.
 */
export function isTransient(error: unknown): boolean {
  if (revertData(error)) return false;
  const text = [...walk(error)].map(link => `${link.message ?? ""} ${link.shortMessage ?? ""}`).join(" ");
  if (/revert|CONTRACT_REVERT|INSUFFICIENT|INVALID_|execution reverted/i.test(text)) return false;
  for (const link of walk(error)) {
    if (link.status === 429 || (link.status !== undefined && link.status >= 500)) return true;
    if (link.code === -32000 || link.code === -32603 || link.code === -32005) return true;
    if (link.name === "TimeoutError" || link.name === "HttpRequestError") return true;
  }
  return /-32000|timed out|fetch failed|ECONNRESET|ETIMEDOUT|socket|network|rate limit|too many requests|temporarily/i.test(
    text,
  );
}
