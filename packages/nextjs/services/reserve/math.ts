// Pure arithmetic and formatting for the desk. No chain access, so it is easy to test.
//
// One stated scale: every USD amount is an integer scaled by 1e18 ("USD18"), the same scale the gate uses.
//   reserve value = quantity * priceAnswer * 10^(18 - priceDecimals)      (quantity: whole collateral units, 1 BTC each)
//   unit value    = nominalValue * 10^(18 - nominalValueDecimals)         (face value of one asset unit)
//   liability     = supply * unit value

export const USD_SCALE_DECIMALS = 18;

export type FigureInput = {
  quantity: bigint;
  priceAnswer: bigint;
  priceDecimals: number;
  nominalValue: bigint;
  nominalValueDecimals: number;
  supply: bigint;
};

export type Figures = {
  reserveValue: bigint;
  unitValue: bigint;
  liability: bigint;
  /** The largest total supply the reserve covers. */
  coveredSupply: bigint;
  headroom: bigint;
  status: "BACKED" | "AT CAPACITY" | "UNDER-RESERVED";
};

export function computeFigures(input: FigureInput): Figures {
  if (input.priceAnswer <= 0n) throw new Error("The price must be positive.");
  if (input.priceDecimals > USD_SCALE_DECIMALS || input.nominalValueDecimals > USD_SCALE_DECIMALS) {
    throw new Error("Decimals beyond the stated scale.");
  }
  const reserveValue = input.quantity * input.priceAnswer * 10n ** BigInt(USD_SCALE_DECIMALS - input.priceDecimals);
  const unitValue = input.nominalValue * 10n ** BigInt(USD_SCALE_DECIMALS - input.nominalValueDecimals);
  if (unitValue === 0n) throw new Error("The face value is zero.");
  const liability = input.supply * unitValue;
  const coveredSupply = reserveValue / unitValue;
  const headroom = coveredSupply > input.supply ? coveredSupply - input.supply : 0n;
  const status =
    input.supply > coveredSupply ? "UNDER-RESERVED" : input.supply === coveredSupply ? "AT CAPACITY" : "BACKED";
  return { reserveValue, unitValue, liability, coveredSupply, headroom, status };
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `$1,234.56` from a USD18 amount, rounded to the cent. */
export function formatUsd18(value: bigint): string {
  const cents = (value + 5n * 10n ** 15n) / 10n ** 16n;
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `$${group(whole.toString())}.${fraction}`;
}

/** `$77,736.48` from a feed answer at `decimals`. */
export function formatFeedUsd(answer: bigint, decimals: number): string {
  return formatUsd18(answer * 10n ** BigInt(USD_SCALE_DECIMALS - decimals));
}

/** `7773.65%` for reserve over liability, to two decimals. Undefined for a liability of zero. */
export function formatCoverage(reserveValue: bigint, liability: bigint): string {
  if (liability === 0n) throw new Error("There is no liability to cover.");
  const hundredths = (reserveValue * 10_000n + liability / 2n) / liability;
  return `${(hundredths / 100n).toString()}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/** A face value stored with `decimals` as `1000.00`. */
export function formatFixed(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const text = value.toString().padStart(decimals + 1, "0");
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} seconds`;
  if (seconds < 5_400) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 172_800) return `${(seconds / 3_600).toFixed(1)} hours`;
  return `${Math.round(seconds / 86_400)} days`;
}

/** A whole number of units typed by the user, or `null`. Digits only, no sign, no fraction. */
export function parseUnits(text: unknown, max: bigint): bigint | null {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const value = String(text).trim();
  if (!/^\d{1,12}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= 1n && parsed <= max ? parsed : null;
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
