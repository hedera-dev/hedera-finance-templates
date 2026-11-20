/**
 * What a court order becomes on the wire. The board forwards whatever calldata it was given, so
 * this mapping is the one place a mistake would have two officers carry out an order nobody made
 * — unfreeze read as freeze, the wrong holder, the wrong amount.
 *
 * Run with `yarn check-security`.
 */
import { tokenAbi } from "../services/security/abi";
import { ORDER_NEEDS_HOLDER, encodeGrantKyc, encodeOrder } from "../services/security/orders";
import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";

const HOLDER = "0x1111111111111111111111111111111111111111" as const;
const ISSUER = "0x2222222222222222222222222222222222222222" as const;

const decode = (data: `0x${string}`) => decodeFunctionData({ abi: tokenAbi, data });

test("a freeze order freezes the named holder, and an unfreeze unfreezes it", () => {
  const frozen = decode(encodeOrder("freeze", HOLDER, 0n));
  assert.equal(frozen.functionName, "setAddressFrozen");
  assert.deepEqual(frozen.args, [HOLDER, true]);

  const thawed = decode(encodeOrder("unfreeze", HOLDER, 0n));
  assert.equal(thawed.functionName, "setAddressFrozen");
  assert.deepEqual(thawed.args, [HOLDER, false]);
});

test("a redemption takes the balance it was given, from the named holder", () => {
  const redeem = decode(encodeOrder("redeem", HOLDER, 110n));
  assert.equal(redeem.functionName, "controllerRedeemByPartition");
  const [partition, from, value] = redeem.args as [string, string, bigint, string, string];
  assert.equal(partition, `0x${"0".repeat(63)}1`);
  assert.equal(from, HOLDER);
  assert.equal(value, 110n);
});

test("revoking KYC names the holder, and pausing names nobody", () => {
  const revoked = decode(encodeOrder("revokeKyc", HOLDER, 0n));
  assert.equal(revoked.functionName, "revokeKyc");
  assert.deepEqual(revoked.args, [HOLDER]);

  assert.equal(decode(encodeOrder("pause", null, 0n)).functionName, "pause");
  assert.equal(decode(encodeOrder("unpause", null, 0n)).functionName, "unpause");
});

test("an order that needs a holder refuses to encode without one", () => {
  for (const action of ["freeze", "unfreeze", "redeem", "revokeKyc"] as const) {
    assert.equal(ORDER_NEEDS_HOLDER[action], true);
    assert.throws(() => encodeOrder(action, null, 0n), /needs a holder/);
  }
  for (const action of ["pause", "unpause"] as const) {
    assert.equal(ORDER_NEEDS_HOLDER[action], false);
  }
});

test("a KYC grant records the account, the issuer and a window that has already opened", () => {
  const granted = decode(encodeGrantKyc(HOLDER, ISSUER));
  assert.equal(granted.functionName, "grantKyc");
  const [account, , validFrom, validTo, issuer] = granted.args as [string, string, bigint, bigint, string];
  assert.equal(account, HOLDER);
  assert.equal(issuer, ISSUER);
  const now = BigInt(Math.floor(Date.now() / 1000));
  assert.ok(validFrom <= now, "KYC must be valid from now, not from the future");
  assert.ok(validTo > now, "KYC must not expire before it is granted");
});
