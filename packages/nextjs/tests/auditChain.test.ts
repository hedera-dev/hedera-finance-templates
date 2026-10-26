/**
 * The chain logic the regulator relies on, exercised without a network.
 *
 * `verifyFeed` is the whole security claim of this template: a regulator who
 * trusts nothing but the mirror node can tell whether the trail was reordered,
 * rewritten or skipped. These are the cases where saying VERIFIED would be wrong.
 *
 * Run with `yarn check-audit` — compiled by tsc and run by node's own test runner,
 * so there is no test framework to install.
 */
import { isAuditEntry, serializeEntry } from "../services/hcsAudit/entry";
import type { MirrorTopicMessage } from "../services/hcsAudit/mirror";
import type { AuditEntry } from "../services/hcsAudit/types";
import { verifyFeed } from "../services/hcsAudit/verify";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { afterEach } from "node:test";

const TOKEN = "0.0.5005";
const HOLDER = "0.0.6006";
const ZERO = "0".repeat(64);

type MirrorTx = { result: string; name: string; entity_id: string | null; token_transfers?: unknown[] };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers the only request `verifyFeed` makes: one transaction lookup per entry. */
function mirrorReturns(byTxId: Record<string, MirrorTx>): void {
  globalThis.fetch = (async (url: string | URL) => {
    const match = /transactions\/([^?]+)/.exec(String(url));
    const found = match ? byTxId[match[1]] : undefined;
    if (!found) return { ok: true, status: 200, json: async () => ({ transactions: [] }) } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => ({ transactions: [{ transaction_id: match?.[1], ...found }] }),
    } as Response;
  }) as typeof fetch;
}

function entry(fields: Partial<AuditEntry>): AuditEntry {
  return {
    v: 1,
    event: "freeze",
    token: TOKEN,
    account: HOLDER,
    amount: null,
    tx: "0.0.1@1700000000.000000001",
    result: "SUCCESS",
    prev: ZERO,
    ...fields,
  } as AuditEntry;
}

/** Chains entries into topic messages the way a correct publisher would. */
function topic(entries: AuditEntry[]): MirrorTopicMessage[] {
  const messages: MirrorTopicMessage[] = [];
  let prev = ZERO;
  entries.forEach((e, i) => {
    const bytes = serializeEntry({ ...e, prev });
    messages.push({
      consensus_timestamp: `170000000${i}.000000000`,
      topic_id: "0.0.7007",
      message: Buffer.from(bytes).toString("base64"),
      payer_account_id: "0.0.1",
      sequence_number: i + 1,
      running_hash: "",
    });
    prev = createHash("sha256").update(bytes).digest("hex");
  });
  return messages;
}

test("a correctly chained trail verifies", async () => {
  const messages = topic([
    entry({ event: "issue", account: null, tx: "0.0.1@1.1" }),
    entry({ event: "freeze", tx: "0.0.1@2.2" }),
  ]);
  mirrorReturns({
    "0.0.1-1-1": { result: "SUCCESS", name: "TOKENCREATION", entity_id: TOKEN },
    "0.0.1-2-2": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: TOKEN },
  });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "VERIFIED");
});

/**
 * The hole this test exists for. Checking only the result code let an authorised
 * publisher log `freeze` / `SUCCESS` against any successful transaction on the
 * network — a plain transfer, someone else's call — and the feed called it verified.
 */
test("an entry citing the wrong kind of transaction is BROKEN", async () => {
  const messages = topic([entry({ event: "freeze", tx: "0.0.1@3.3" })]);
  mirrorReturns({ "0.0.1-3-3": { result: "SUCCESS", name: "CRYPTOTRANSFER", entity_id: null } });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /must reference a TOKENFREEZE/);
});

test("an entry citing another token's transaction is BROKEN", async () => {
  const messages = topic([entry({ event: "grant_kyc", tx: "0.0.1@4.4" })]);
  mirrorReturns({ "0.0.1-4-4": { result: "SUCCESS", name: "TOKENGRANTKYC", entity_id: "0.0.9999" } });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /acts on 0\.0\.9999/);
});

test("a transfer that never credited the holder is BROKEN", async () => {
  const messages = topic([entry({ event: "transfer", amount: 100, tx: "0.0.1@5.5" })]);
  mirrorReturns({
    "0.0.1-5-5": {
      result: "SUCCESS",
      name: "CRYPTOTRANSFER",
      entity_id: null,
      token_transfers: [{ token_id: TOKEN, account: "0.0.4242", amount: 100 }],
    },
  });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /does not credit 100/);
});

test("a rewritten entry breaks the chain at that message", async () => {
  const messages = topic([entry({ event: "issue", account: null, tx: "0.0.1@1.1" }), entry({ tx: "0.0.1@2.2" })]);
  // Rewrite message 1 after the fact: message 2's prev now hashes bytes nobody published.
  const tampered = serializeEntry(entry({ event: "issue", account: null, tx: "0.0.1@9.9", prev: ZERO }));
  messages[0].message = Buffer.from(tampered).toString("base64");
  mirrorReturns({
    "0.0.1-9-9": { result: "SUCCESS", name: "TOKENCREATION", entity_id: TOKEN },
    "0.0.1-2-2": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: TOKEN },
  });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.equal(result.brokenAt?.sequenceNumber, 2);
  assert.match(result.brokenAt?.reason ?? "", /prev does not match/);
});

test("an entry is exactly its fields: no extras, whole amounts, a real hash", () => {
  const good = entry({ event: "transfer", amount: 100 });
  assert.equal(isAuditEntry(good), true);
  assert.equal(isAuditEntry({ ...good, note: "extra" }), false, "unknown fields are not entries");
  assert.equal(isAuditEntry({ ...good, amount: 1.5 }), false, "amounts are whole tokens");
  assert.equal(isAuditEntry({ ...good, prev: "zz".repeat(32) }), false, "prev must be a hash");
  const { amount, ...missing } = good;
  void amount;
  assert.equal(isAuditEntry(missing), false, "a missing field is not an entry");
});
