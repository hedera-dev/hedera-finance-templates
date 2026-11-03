/**
 * What the desk claims about a token's keys and a schedule's signatures, checked without a
 * network. Both answers are shown to the reader as facts about the chain, so both have to be
 * right — and `countDistinctSigners` has to be wrong in only one direction if it is wrong.
 *
 * Run with `yarn check-security`.
 */
import { countDistinctSigners, isThresholdKey } from "../services/security/keys";
import { proto } from "@hiero-ledger/proto";
import { PrivateKey } from "@hiero-ledger/sdk";
import assert from "node:assert/strict";
import test from "node:test";

const keyHex = () => Buffer.from(PrivateKey.generateED25519().publicKey.toBytesRaw()).toString("hex");

/** The mirror node's shape for a threshold key: `ProtobufEncoded` plus the raw `Key` bytes. */
function thresholdMirrorKey(threshold: number, count: number) {
  const keys = Array.from({ length: count }, () => ({
    ed25519: Uint8Array.from(Buffer.from(keyHex(), "hex")),
  }));
  const encoded = proto.Key.encode({ thresholdKey: { threshold, keys: { keys } } }).finish();
  return { _type: "ProtobufEncoded" as const, key: Buffer.from(encoded).toString("hex") };
}

test("a 2-of-3 threshold key is recognised, and nothing else is", () => {
  assert.equal(isThresholdKey(thresholdMirrorKey(2, 3), 2, 3), true);
  assert.equal(isThresholdKey(thresholdMirrorKey(1, 3), 2, 3), false, "1-of-3 is not 2-of-3");
  assert.equal(isThresholdKey(thresholdMirrorKey(2, 2), 2, 3), false, "2-of-2 is not 2-of-3");
  assert.equal(isThresholdKey({ _type: "ED25519", key: keyHex() }, 2, 3), false, "a plain key is not a threshold");
  assert.equal(isThresholdKey(null, 2, 3), false);
  assert.equal(isThresholdKey({ _type: "ProtobufEncoded", key: "not hex at all" }, 2, 3), false);
});

test("each officer's signature is counted once, by a prefix of their key", () => {
  const officers = [keyHex(), keyHex(), keyHex()];

  assert.equal(countDistinctSigners(officers, []), 0);
  assert.equal(countDistinctSigners(officers, [officers[0]]), 1, "a full key is a prefix of itself");
  assert.equal(countDistinctSigners(officers, [officers[0].slice(0, 20)]), 1, "so is a long prefix");
  assert.equal(countDistinctSigners(officers, [officers[0], officers[2]]), 2);
  assert.equal(countDistinctSigners(officers, [officers[1], officers[1]]), 1, "the same signer twice is one");
  assert.equal(countDistinctSigners(officers, ["ff".repeat(16)]), 0, "a prefix matching nobody counts for nobody");
});

/**
 * The case this exists for. A prefix short enough to fit two officers identifies neither, and
 * counting it against both would tell the page more officers had approved than really had.
 */
test("an ambiguous prefix counts for nobody, never for everybody", () => {
  const shared = "ab";
  const officers = [`${shared}${"11".repeat(31)}`, `${shared}${"22".repeat(31)}`, `cd${"33".repeat(31)}`];

  assert.equal(countDistinctSigners(officers, [shared]), 0, "two officers fit this prefix, so it proves neither");
  assert.equal(countDistinctSigners(officers, [`${shared}11`]), 1, "one more byte and it is unambiguous");
});
