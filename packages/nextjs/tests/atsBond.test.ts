/**
 * The decisions the desk makes before anything is signed, exercised without a network: the
 * ISIN it accepts, the dates it asks the factory for, and which failures are worth retrying.
 *
 * Run with `yarn check-ats` — compiled by tsc and run by node's own test runner, so there is
 * no test framework to install.
 */
import { isTransientRelayError } from "../services/ats/clients";
import { START_DELAY_SECONDS, bondDates } from "../utils/ats/dates";
import { validateIsin } from "../utils/ats/isin";
import assert from "node:assert/strict";
import test from "node:test";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString();

test("an ISIN is accepted only with a correct check digit", () => {
  assert.equal(validateIsin("US0378331005").valid, true);
  assert.equal(validateIsin("us0378331005").valid, true, "case is normalised");

  const wrongDigit = validateIsin("US0378331006");
  assert.equal(wrongDigit.valid, false);
  assert.match(wrongDigit.valid === false ? wrongDigit.reason : "", /check digit/i);

  assert.equal(validateIsin("US037833100").valid, false, "too short");
  assert.equal(validateIsin("U50378331005").valid, false, "country code must be letters");
});

/**
 * The case this exists for: adding months to a day the target month does not have used to
 * overflow into the month after. A one-month bond issued on 31 January matured in March.
 */
test("maturity lands in the month asked for, even from a month end", () => {
  const { startingDate, maturityDate } = bondDates(at("2026-01-31T12:00:00Z"), 1);

  assert.equal(iso(startingDate), "2026-01-31T12:05:00.000Z", "start is a few minutes out");
  assert.equal(iso(maturityDate), "2026-02-28T12:05:00.000Z", "clamped to the last day of February");
});

test("a leap year gets its extra day", () => {
  const { maturityDate } = bondDates(at("2028-01-31T12:00:00Z"), 1);
  assert.equal(iso(maturityDate), "2028-02-29T12:05:00.000Z");
});

test("twelve months is the same date a year later", () => {
  const { maturityDate } = bondDates(at("2026-03-15T09:30:00Z"), 12);
  assert.equal(iso(maturityDate), "2027-03-15T09:35:00.000Z");
});

test("maturity is always after the start, for every month count the form allows", () => {
  const now = at("2026-01-31T23:59:00Z");
  for (let months = 1; months <= 120; months++) {
    const { startingDate, maturityDate } = bondDates(now, months);
    assert.equal(startingDate, BigInt(now + START_DELAY_SECONDS));
    assert.ok(maturityDate > startingDate, `maturity must follow the start at ${months} months`);
  }
});

/**
 * The case this exists for: the public relay answered an issue with
 * `400 {"code":-32000,"message":"… Error occurred during transaction simulation: Service
 * Unavailable"}`. That is the relay failing to ask, not the contract answering, and ending
 * the whole issue on it wastes a run. A revert is the opposite: asking again says no again.
 */
test("relay trouble is retried; a refusal is not", () => {
  const unavailable = Object.assign(new Error("HTTP request failed."), {
    details:
      '{"code":-32000,"message":"[Request ID: d92c67a2] Error occurred during transaction simulation: Service Unavailable"}',
  });
  assert.equal(isTransientRelayError(unavailable), true);

  assert.equal(isTransientRelayError(new Error("fetch failed")), true, "a dead connection is worth another try");
  assert.equal(isTransientRelayError(new Error("Too Many Requests")), true);

  const refusal = Object.assign(new Error('The contract function "issue" reverted.'), {
    details: "AccountIsBlocked(0x1234)",
  });
  assert.equal(isTransientRelayError(refusal), false, "a revert is an answer, not a failure to ask");
  assert.equal(isTransientRelayError(new Error("Insufficient funds")), false);
});
