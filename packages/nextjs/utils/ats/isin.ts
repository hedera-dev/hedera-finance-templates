/**
 * ISIN format + check-digit validation (ISO 6166 / Luhn-mod-10 over letters-as-digits).
 * Client- and server-safe: no Node/viem imports, used both for the pre-flight check in the
 * browser (before anything is signed) and defensively again on the server.
 */
export type IsinValidation = { valid: true } | { valid: false; reason: string };

const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function validateIsin(rawIsin: string): IsinValidation {
  const isin = rawIsin.trim().toUpperCase();

  if (!ISIN_SHAPE.test(isin)) {
    return {
      valid: false,
      reason: "ISIN must be 2 letters, 9 alphanumeric characters, and 1 check digit (e.g. US0378331005).",
    };
  }

  const body = isin.slice(0, 11);
  const checkDigit = Number(isin[11]);

  // Letters become two digits each (A=10 ... Z=35), digits pass through unchanged.
  const digits = body
    .split("")
    .map(ch => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join("");

  // Luhn mod-10, doubling every other digit starting from the rightmost.
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  const expectedCheckDigit = (10 - (sum % 10)) % 10;

  if (expectedCheckDigit !== checkDigit) {
    return { valid: false, reason: `ISIN check digit is wrong: expected ${expectedCheckDigit}, got ${checkDigit}.` };
  }

  return { valid: true };
}

export function isValidIsin(isin: string): boolean {
  return validateIsin(isin).valid;
}
