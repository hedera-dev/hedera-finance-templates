/**
 * Base-unit <-> whole-unit conversions for HTS token amounts, done with
 * BigInt so 6-decimal stablecoin math never hits floating point.
 */

/** Converts a base-unit integer amount to a plain whole-unit decimal string. */
export function formatBaseUnits(amount: bigint, decimals: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (decimals === 0) return `${negative ? "-" : ""}${abs.toString()}`;

  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

/** Converts a whole-unit amount (number, e.g. the trade ticket quantity) to base units. */
export function toBaseUnits(wholeUnits: number, decimals: number): bigint {
  if (!Number.isFinite(wholeUnits) || wholeUnits < 0) {
    throw new Error("Amount must be a non-negative finite number");
  }
  const value = wholeUnits.toString();
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Amount must use plain decimal notation");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Amount must have at most ${decimals} decimals`);
  const scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large to represent safely");
  return scaled;
}
