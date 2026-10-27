/**
 * What the desk asks Officer 3's wallet to send. Both halves are silent when wrong — a bad
 * selector reverts in the wallet, a bad address is just an account that does not exist — so both
 * are derived here rather than trusted.
 *
 * Run with `yarn check-security`.
 */
import { SIGN_SCHEDULE_SELECTOR, scheduleEvmAddress } from "../services/security/hrc755";
import assert from "node:assert/strict";
import test from "node:test";
import { toFunctionSelector } from "viem";

test("the wallet is asked for HRC-755's `signSchedule()`", () => {
  assert.equal(SIGN_SCHEDULE_SELECTOR, toFunctionSelector("signSchedule()"));
});

test("a schedule id becomes the long-zero address that facade call goes to", () => {
  assert.equal(scheduleEvmAddress("0.0.12345"), "0x0000000000000000000000000000000000003039");
  assert.equal(scheduleEvmAddress("0.0.1"), `0x${"0".repeat(39)}1`);
});
