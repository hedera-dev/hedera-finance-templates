/**
 * The chain logic the regulator relies on, exercised without a network.
 *
 * `verifyFeed` is the whole security claim of this template: a regulator who
 * trusts nothing but the mirror node can tell whether the trail was reordered,
 * rewritten or skipped. These are the cases where saying VERIFIED would be wrong.
 *
 * `parseRecordRequest` is the other end of the same claim: the point where a request
 * becomes something that will be published and can never be taken back.
 *
 * Run with `yarn check-audit` — compiled by tsc and run by node's own test runner,
 * so there is no test framework to install.
 */
import { isAuditEntry, serializeEntry } from "../services/hcsAudit/entry";
import type { MirrorTopicMessage } from "../services/hcsAudit/mirror";
import { parseRecordRequest } from "../services/hcsAudit/record";
import type { AuditEntry } from "../services/hcsAudit/types";
import { verifyFeed } from "../services/hcsAudit/verify";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { afterEach } from "node:test";

const TOKEN = "0.0.5005";
const HOLDER = "0.0.6006";
const OFFICER = "0.0.7007";
const ZERO = "0".repeat(64);
const DOC_HASH = "a".repeat(64);

type MirrorTx = { result: string; name: string; entity_id: string | null; token_transfers?: unknown[] };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Answers the only request `verifyFeed` makes: one transaction lookup per entry.
 *
 * `entity_id` must be what the mirror node really returns, which is not always the
 * token: a TOKENCREATION names the token, a TOKENFREEZE or TOKENGRANTKYC names the
 * *account*. Mocking the token for all of them is what let a check that no real
 * trail could pass sit here looking green.
 */
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
    v: 2,
    event: "freeze",
    token: TOKEN,
    account: HOLDER,
    amount: null,
    tx: "0.0.1@1700000000.000000001",
    result: "SUCCESS",
    reason: null,
    authority: null,
    evidence: null,
    prev: ZERO,
    ...fields,
  } as AuditEntry;
}

/** A well-formed decision: no transaction, but an authority and a document. */
function decision(fields: Partial<AuditEntry> = {}): AuditEntry {
  return entry({
    event: "kyc_review",
    tx: null,
    result: "PASSED",
    reason: "Case KYC-2026-0094",
    authority: OFFICER,
    evidence: DOC_HASH,
    ...fields,
  });
}

/**
 * Chains entries into topic messages the way a correct publisher would. `payers` is
 * who paid for each submission — the only thing the mirror node can say about who
 * stood behind an entry. The Issuer (`0.0.1`) publishes unless a test says otherwise.
 */
function topic(entries: AuditEntry[], payers: string[] = []): MirrorTopicMessage[] {
  const messages: MirrorTopicMessage[] = [];
  let prev = ZERO;
  entries.forEach((e, i) => {
    const bytes = serializeEntry({ ...e, prev });
    messages.push({
      consensus_timestamp: `170000000${i}.000000000`,
      topic_id: "0.0.7007",
      message: Buffer.from(bytes).toString("base64"),
      payer_account_id: payers[i] ?? "0.0.1",
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
    "0.0.1-2-2": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: HOLDER },
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
    "0.0.1-2-2": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: HOLDER },
  });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.equal(result.brokenAt?.sequenceNumber, 2);
  assert.match(result.brokenAt?.reason ?? "", /prev does not match/);
});

/** Nothing to look up, so the transaction check is not applicable — and the trail still verifies. */
test("a decision entry verifies with no transaction to check", async () => {
  const messages = topic([decision()]);
  mirrorReturns({});

  const result = await verifyFeed(messages);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.rows[0].checks.transaction, null, "not applicable, not passed");
  assert.equal(result.rows[0].checks.chain, true);
});

test("a decision and a token action share one chain", async () => {
  const messages = topic([
    entry({ event: "grant_kyc", tx: "0.0.1@6.6", reason: "Case KYC-2026-0094 cleared", authority: OFFICER }),
    decision({ event: "sanctions_check", result: "REFUSED" }),
    entry({ event: "freeze", tx: "0.0.1@7.7" }),
  ]);
  mirrorReturns({
    "0.0.1-6-6": { result: "SUCCESS", name: "TOKENGRANTKYC", entity_id: HOLDER },
    "0.0.1-7-7": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: HOLDER },
  });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(
    result.rows.map(r => r.checks.transaction),
    [true, null, true],
  );
});

/** Borrowing a real transaction would let an off-chain claim inherit its credibility. */
test("a decision citing a transaction is BROKEN", async () => {
  const messages = topic([decision({ tx: "0.0.1@8.8" })]);
  mirrorReturns({ "0.0.1-8-8": { result: "PASSED", name: "TOKENGRANTKYC", entity_id: HOLDER } });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /must not cite a transaction/);
});

/** The mirror image: an on-chain action with no transaction is unverifiable. */
test("a token action with no transaction is BROKEN", async () => {
  const messages = topic([entry({ event: "freeze", tx: null })]);
  mirrorReturns({});

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /must cite its transaction/);
});

test("a decision with no document or no authority is BROKEN", async () => {
  mirrorReturns({});

  const noDoc = await verifyFeed(topic([decision({ evidence: null })]));
  assert.equal(noDoc.status, "BROKEN");
  assert.match(noDoc.brokenAt?.reason ?? "", /hash of the document/);

  const noAuthority = await verifyFeed(topic([decision({ authority: null })]));
  assert.equal(noAuthority.status, "BROKEN");
  assert.match(noAuthority.brokenAt?.reason ?? "", /must name the authority/);
});

test("a decision recording a network status rather than an outcome is BROKEN", async () => {
  mirrorReturns({});
  const result = await verifyFeed(topic([decision({ result: "SUCCESS" })]));
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /must record PASSED or REFUSED/);
});

/**
 * The check this file once mocked its way past. A freeze that really happened to
 * someone else must not back an entry claiming this account was frozen — and since
 * the transaction endpoint reports no token for a freeze at all, the account is the
 * only thing there is to tie the two together.
 */
test("a freeze citing another account's freeze is BROKEN", async () => {
  const messages = topic([entry({ event: "freeze", tx: "0.0.1@4.4" })]);
  mirrorReturns({ "0.0.1-4-4": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: "0.0.9999" } });

  const result = await verifyFeed(messages);
  assert.equal(result.status, "BROKEN");
  assert.match(result.brokenAt?.reason ?? "", /acts on 0\.0\.9999, not account/);
});

/**
 * An officer publishing through their own wallet signs and pays for that submission,
 * so an entry naming them is one they put their own key behind. An entry naming an
 * officer who did not publish it is a claim — a normal way to run a desk, and not a
 * failure, which is why none of this can make a trail BROKEN.
 */
test("an authority that published its own entry is backed by the network", async () => {
  mirrorReturns({});

  const proved = await verifyFeed(topic([decision()], [OFFICER]));
  assert.equal(proved.rows[0].authorityProof, "proved");
  assert.equal(proved.status, "VERIFIED");

  const claimed = await verifyFeed(topic([decision()]));
  assert.equal(claimed.rows[0].authorityProof, "claimed", "the Issuer published it, naming the officer");
  assert.equal(claimed.status, "VERIFIED", "being a claim is not a failure");
});

test("an entry naming no authority claims nothing", async () => {
  mirrorReturns({ "0.0.1-7-7": { result: "SUCCESS", name: "TOKENFREEZE", entity_id: HOLDER } });

  const result = await verifyFeed(topic([entry({ event: "freeze", tx: "0.0.1@7.7" })]));
  assert.equal(result.rows[0].authorityProof, null);
  assert.equal(result.status, "VERIFIED");
});

/**
 * The request parser enforces the verifier's rules one step earlier, so the desk
 * cannot publish an entry its own feed would call broken. These assertions are the
 * only thing keeping the two in agreement.
 */
test("a decision request needs its authority and its document", () => {
  const decisionBody = {
    kind: "decision",
    event: "kyc_review",
    outcome: "PASSED",
    authority: OFFICER,
    evidence: DOC_HASH,
  };

  const parsed = parseRecordRequest(decisionBody);
  assert.equal(parsed.kind, "decision");
  assert.deepEqual(parsed.context, { reason: null, authority: OFFICER, evidence: DOC_HASH });

  assert.throws(() => parseRecordRequest({ ...decisionBody, evidence: undefined }), /document behind it/);
  assert.throws(() => parseRecordRequest({ ...decisionBody, authority: undefined }), /authority that approved/);
  assert.throws(() => parseRecordRequest({ ...decisionBody, outcome: "SUCCESS" }), /PASSED or REFUSED/);
  assert.throws(() => parseRecordRequest({ ...decisionBody, event: "freeze" }), /Unknown decision/);
});

test("the context fields are validated before anything is published", () => {
  const action = { kind: "action", action: "freeze" };

  assert.deepEqual(parseRecordRequest(action).context, { reason: null, authority: null, evidence: null });
  assert.deepEqual(parseRecordRequest({ ...action, reason: "   " }).context.reason, null, "blank is absent, not empty");
  assert.equal(parseRecordRequest({ ...action, evidence: DOC_HASH.toUpperCase() }).context.evidence, DOC_HASH);

  assert.throws(() => parseRecordRequest({ ...action, reason: "x".repeat(201) }), /at most 200/);
  assert.throws(() => parseRecordRequest({ ...action, authority: "the compliance desk" }), /Authority must look like/);
  assert.throws(() => parseRecordRequest({ ...action, evidence: "deadbeef" }), /64 hex characters/);
});

/**
 * `kind` is the discriminator, not whichever field happens to be present: a body
 * carrying both must not be read as the kind that would skip the other's rules.
 */
test("a request is the kind it says it is", () => {
  const both = { kind: "action", action: "freeze", event: "approval", outcome: "PASSED" };
  assert.equal(parseRecordRequest(both).kind, "action");

  assert.throws(() => parseRecordRequest({ kind: "decision", action: "freeze" }), /Unknown decision/);
  assert.throws(() => parseRecordRequest({ action: "transfer", amount: 0 }), /positive whole number/);
  assert.throws(() => parseRecordRequest(null), /Unknown action/);
});

test("an entry is exactly its fields: no extras, whole amounts, a real hash", () => {
  const good = entry({ event: "transfer", amount: 100 });
  assert.equal(isAuditEntry(good), true);
  assert.equal(isAuditEntry({ ...good, note: "extra" }), false, "unknown fields are not entries");
  assert.equal(isAuditEntry({ ...good, amount: 1.5 }), false, "amounts are whole tokens");
  assert.equal(isAuditEntry({ ...good, prev: "zz".repeat(32) }), false, "prev must be a hash");
  assert.equal(isAuditEntry({ ...good, evidence: "not-a-hash" }), false, "evidence must be a hash");
  assert.equal(isAuditEntry({ ...good, evidence: DOC_HASH }), true, "a hash is fine");
  assert.equal(isAuditEntry({ ...good, reason: "x".repeat(201) }), false, "reason is capped");
  assert.equal(isAuditEntry({ ...good, v: 1 }), false, "v1 entries are not accepted");
  assert.equal(isAuditEntry(decision()), true, "a decision is an entry: tx may be null");
  const { amount, ...missing } = good;
  void amount;
  assert.equal(isAuditEntry(missing), false, "a missing field is not an entry");
});
