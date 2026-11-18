// Pure arithmetic and formatting for the desk. One stated scale: 8-decimal US dollars ("USD8"), the scale the
// price feed reports in. A bill has 0 decimals so `price x quantity` is already USD8; the stablecoin has 2 decimals
// so its units are scaled up by 1e6.
import { CASH_DECIMALS, INT64_MAX } from "./constants";

export const USD8 = 100_000_000n;
export const CASH_SCALE = 10n ** BigInt(8 - CASH_DECIMALS);
export const BPS = 10_000n;

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `$1,234.56` from a USD8 amount, rounded to the cent. */
export function formatUsd8(value: bigint): string {
  if (value < 0n) return `-${formatUsd8(-value)}`;
  const cents = (value + 500_000n) / 1_000_000n;
  return `$${group((cents / 100n).toString())}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** `$1,234.56` from stablecoin units (2 decimals). */
export function formatCash(units: bigint): string {
  return formatUsd8(units * CASH_SCALE);
}

/** `97.23%` from basis points. */
export function formatBps(bps: bigint | number): string {
  const hundredths = BigInt(bps);
  return `${(hundredths / 100n).toString()}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/** The checked conversion into the Studio's int64 domain; an unchecked cast between the two is the mistake. */
export function toInt64(value: bigint): bigint {
  if (value < 0n || value > INT64_MAX) throw new Error("Amount does not fit the Studio's int64.");
  return value;
}

/** A whole number typed by the user, or `null`. Digits only, no sign, no fraction. */
export function parseWhole(text: unknown, max: bigint, min = 1n): bigint | null {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const value = String(text).trim();
  if (!/^\d{1,12}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

export function formatFixed(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const text = value.toString().padStart(decimals + 1, "0");
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

/** A valid ISIN: `US`, nine digits, and the Luhn check digit over the letters-as-numbers expansion. */
export function makeIsin(nineDigits: string): string {
  const body = `US${nineDigits}`;
  const expanded = [...body].map(char => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55))).join("");
  let sum = 0;
  [...expanded].reverse().forEach((digit, index) => {
    let n = Number(digit);
    if (index % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} seconds`;
  if (seconds < 5_400) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 172_800) return `${(seconds / 3_600).toFixed(1)} hours`;
  return `${Math.round(seconds / 86_400)} days`;
}

/** Stablecoin units as a plain number with no symbol or separators: `9600`, `9638.40`. */
export function plainCash(units: bigint): string {
  const text = formatFixed(units, 2);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}
