import {
  AccountCreateTransaction,
  AccountUpdateTransaction,
  Client,
  Hbar,
  KeyList,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleSignTransaction,
  Timestamp,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenPauseTransaction,
  TokenUnfreezeTransaction,
  TokenUnpauseTransaction,
  TokenWipeTransaction,
  Transaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import {
  HolderId,
  HolderRecord,
  OfficerId,
  OfficerRecord,
  OrderAction,
  PendingApproval,
  addHistory,
  addHolder,
  addPending,
  getDeskState,
  getHolder,
  getOfficer,
  getPending,
  removePending,
  setOfficers,
  setRecordAccount,
  setToken,
} from "~~/services/security/deskState";
import { countDistinctSigners, publicKeyFromMirrorKey } from "~~/services/security/keys";
import type { MirrorSchedule } from "~~/services/security/mirrorNode";
import { getMirrorAccount, getMirrorSchedule, getTokenRelationship } from "~~/services/security/mirrorNode";
import { getOperatorConfig } from "~~/services/security/operator";
import { getSdkClient } from "~~/services/security/sdkClient";

/**
 * Court orders ARE carried with `ScheduleCreateTransaction` / `ScheduleSignTransaction`, exactly
 * as the spec requires — but not by scheduling the admin transaction (`TokenFreezeTransaction` and
 * friends) directly. Verified live against Hedera testnet (and documented in Hedera's own HIP-423
 * announcement and in hashgraph/hedera-agent-kit-js#1125): the network's `scheduling.whitelist`
 * only admits ConsensusSubmitMessage, CryptoTransfer, TokenMint, TokenBurn, CryptoCreate,
 * CryptoUpdate, FileUpdate, SystemDelete/Undelete, Freeze and the Contract* functions.
 * `TokenFreezeAccount`, `TokenUnfreezeAccount`, `TokenPause`, `TokenUnpause`, `TokenAccountWipe`
 * (and `TokenGrantKycToAccount`) are not on it — a `ScheduleCreateTransaction` wrapping any of
 * them fails immediately with `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST`, no schedule entity even
 * created. None of this desk's five order types can be scheduled directly.
 *
 * `CryptoUpdateTransaction` (an `AccountUpdateTransaction`) IS on the whitelist, though, and an
 * account's own key — which can be any `Key`, including a `KeyList` — gates it exactly like a
 * token's admin key gates a `TokenFreezeTransaction`. `setupToken` below creates one more account,
 * the "record account", whose key is the same 2-of-3 `KeyList` as the token's. A court order is
 * proposed by scheduling an update to that account's memo (admin-keyed by Officer 1, so Officer 1
 * alone can withdraw it) and approved by a second officer's `ScheduleSignTransaction` — a REAL
 * schedule, with a REAL `0.0.<num>` id, that the mirror node genuinely shows as not-executed until
 * a second signature lands, exactly as `#pending-approvals` claims. Because it is a real schedule
 * — not a client-frozen transaction with Hedera's ~180s hard ceiling on valid-duration — it can
 * sit for the several minutes a realistic gap between two officers' actions requires, something a
 * bare offline-signed transaction structurally cannot do reliably.
 *
 * The record account's update carries no legal weight of its own; it is a vehicle for getting a
 * real, mirror-node-visible 2-of-3 schedule out of a whitelist that does not include the actual
 * admin functions. The instant that schedule executes, this module builds the REAL admin
 * transaction (freeze/unfreeze/wipe/pause/unpause) fresh — brand-new transaction id, full 180s
 * window from that moment — and signs it with Officer 1 (always server-held, re-signed on the
 * spot) plus whichever second officer actually approved, then executes it immediately in the same
 * request. That second, real transaction is what Holder A's frozen state, the token's pause
 * status, and a wiped balance actually depend on, and what `#history` records the result of; the
 * record-account schedule exists only so the page has something genuine to call "pending".
 */

const ORDER_EXPIRY_MS = 5 * 60 * 1000;
const SEND_AMOUNT = 10;
/** How long a wallet approval that has been handed to the browser keeps its order off the poll's hands. */
const WALLET_APPROVAL_WINDOW_MS = 2 * 60 * 1000;

export async function requireOperator() {
  const result = await getOperatorConfig();
  if (!result.ok) throw new Error("Operator is not configured.");
  return result.config;
}

function statusCodeOf(error: unknown): string | null {
  const status = (error as { status?: { toString(): string } } | undefined)?.status;
  return status ? status.toString() : null;
}

function actionLabel(action: OrderAction, holderLabel: string | null): string {
  switch (action) {
    case "freeze":
      return `Freeze ${holderLabel}`;
    case "unfreeze":
      return `Unfreeze ${holderLabel}`;
    case "wipe":
      return `Wipe ${holderLabel}'s holding`;
    case "pause":
      return "Pause token";
    case "unpause":
      return "Unpause token";
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function setupOfficers(walletEvmAddress?: string) {
  const officer1 = PrivateKey.generateED25519();
  const officer2 = PrivateKey.generateED25519();

  let officer3: OfficerRecord;
  if (walletEvmAddress) {
    const account = await getMirrorAccount(walletEvmAddress).catch(() => null);
    const publicKey = account ? publicKeyFromMirrorKey(account.key) : null;
    officer3 = publicKey
      ? { id: "3", isWallet: true, accountId: account!.accountId, publicKey, privateKey: null }
      : demoOfficer3();
  } else {
    officer3 = demoOfficer3();
  }

  setOfficers([
    { id: "1", isWallet: false, accountId: null, publicKey: officer1.publicKey, privateKey: officer1 },
    { id: "2", isWallet: false, accountId: null, publicKey: officer2.publicKey, privateKey: officer2 },
    officer3,
  ]);

  return {
    officer3Kind: officer3.isWallet ? ("wallet" as const) : ("demo" as const),
    officer3AccountId: officer3.accountId,
  };
}

function demoOfficer3(): OfficerRecord {
  const key = PrivateKey.generateED25519();
  return { id: "3", isWallet: false, accountId: null, publicKey: key.publicKey, privateKey: key };
}

export async function setupToken() {
  const operator = await requireOperator();
  const client = await getSdkClient();
  const state = getDeskState();
  if (state.officers.length !== 3) throw new Error("Officer keys are not set up yet.");
  const officer1 = getOfficer("1");
  const officer2 = getOfficer("2");
  if (!officer1?.privateKey || !officer2?.privateKey) throw new Error("Officer keys are not set up yet.");

  const thresholdKey = new KeyList(
    state.officers.map(o => o.publicKey),
    2,
  );

  // Setting an adminKey requires that key's own signature on the create transaction, not just the
  // treasury's — Hedera won't attach governance to a key the submitter hasn't proven control of.
  // Officer 1 and Officer 2 are always demo keys the server holds, so their two signatures (the
  // threshold) are supplied directly here; this bootstrap step doesn't need the schedule flow.
  // Only 100 of this goes to Holder A at distribute time (see `setupDistribute`) — the rest stays
  // with the treasury so the issuer can keep clicking "Send 10" through the rest of the demo
  // instead of running dry after the first transfer.
  const tokenCreate = new TokenCreateTransaction()
    .setTokenName("Permissioned Security")
    .setTokenSymbol("PSEC")
    .setDecimals(0)
    .setInitialSupply(10_000)
    .setTreasuryAccountId(operator.accountId)
    .setKycKey(thresholdKey)
    .setFreezeKey(thresholdKey)
    .setWipeKey(thresholdKey)
    .setPauseKey(thresholdKey)
    .setAdminKey(thresholdKey)
    .setFreezeDefault(false)
    .freezeWith(client);
  await tokenCreate.sign(officer1.privateKey);
  await tokenCreate.sign(officer2.privateKey);

  const receipt = await (await tokenCreate.execute(client)).getReceipt(client);

  const tokenId = receipt.tokenId!.toString();
  setToken({ tokenId, symbol: "PSEC" });

  // The record account: same 2-of-3 threshold key, holds no funds, exists only as something a
  // whitelisted `CryptoUpdateTransaction` can target — see the comment atop this file.
  const recordReceipt = await (
    await new AccountCreateTransaction().setKeyWithoutAlias(thresholdKey).setInitialBalance(new Hbar(0)).execute(client)
  ).getReceipt(client);
  setRecordAccount(recordReceipt.accountId!.toString());

  return { tokenId, symbol: "PSEC" };
}

export async function setupHolders() {
  const client = await getSdkClient();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");

  const created: HolderRecord[] = [];
  for (const [id, label] of [
    ["A", "Holder A"],
    ["B", "Holder B"],
  ] as const) {
    const key = PrivateKey.generateED25519();
    const createReceipt = await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(key.publicKey)
        .setInitialBalance(new Hbar(1))
        .execute(client)
    ).getReceipt(client);
    const accountId = createReceipt.accountId!.toString();

    await (
      await (
        await new TokenAssociateTransaction()
          .setAccountId(accountId)
          .setTokenIds([state.token.tokenId])
          .freezeWith(client)
          .sign(key)
      ).execute(client)
    ).getReceipt(client);

    const holder: HolderRecord = { id, label, accountId };
    addHolder(holder);
    created.push(holder);
  }
  return created;
}

export async function setupDistribute() {
  const operator = await requireOperator();
  const client = await getSdkClient();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  const holderA = getHolder("A");
  if (!holderA) throw new Error("Holder A is not set up yet.");
  const officer1 = getOfficer("1");
  const officer2 = getOfficer("2");
  if (!officer1?.privateKey || !officer2?.privateKey) throw new Error("Officer keys are not set up yet.");

  const grantKyc = new TokenGrantKycTransaction()
    .setTokenId(state.token.tokenId)
    .setAccountId(holderA.accountId)
    .freezeWith(client);
  await grantKyc.sign(officer1.privateKey);
  await grantKyc.sign(officer2.privateKey);
  await (await grantKyc.execute(client)).getReceipt(client);

  await (
    await new TransferTransaction()
      .addTokenTransfer(state.token.tokenId, operator.accountId, -100)
      .addTokenTransfer(state.token.tokenId, holderA.accountId, 100)
      .execute(client)
  ).getReceipt(client);

  return { holderA: holderA.accountId, amount: 100 };
}

// ---------------------------------------------------------------------------
// Holder transfers
// ---------------------------------------------------------------------------

export async function sendToHolder(holderId: HolderId) {
  const operator = await requireOperator();
  const client = await getSdkClient();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  const holder = getHolder(holderId);
  if (!holder) throw new Error("Unknown holder.");

  const response = await new TransferTransaction()
    .addTokenTransfer(state.token.tokenId, operator.accountId, -SEND_AMOUNT)
    .addTokenTransfer(state.token.tokenId, holder.accountId, SEND_AMOUNT)
    .execute(client);
  const transactionId = response.transactionId.toString();

  let result = "SUCCESS";
  try {
    await response.getReceipt(client);
  } catch (error) {
    result = statusCodeOf(error) ?? "UNKNOWN_ERROR";
  }

  addHistory({
    action: `Send 10 to ${holder.label}`,
    reference: null,
    result,
    transactionId,
    linkKind: "transaction",
  });

  return { result, transactionId };
}

// ---------------------------------------------------------------------------
// Court orders (propose / approve / delete)
// ---------------------------------------------------------------------------

function buildInnerTransaction(
  action: OrderAction,
  tokenId: string,
  holderAccountId: string | null,
  wipeAmount?: string,
) {
  switch (action) {
    case "freeze":
      return new TokenFreezeTransaction().setTokenId(tokenId).setAccountId(holderAccountId!);
    case "unfreeze":
      return new TokenUnfreezeTransaction().setTokenId(tokenId).setAccountId(holderAccountId!);
    case "wipe":
      return new TokenWipeTransaction()
        .setTokenId(tokenId)
        .setAccountId(holderAccountId!)
        .setAmount(BigInt(wipeAmount!));
    case "pause":
      return new TokenPauseTransaction().setTokenId(tokenId);
    case "unpause":
      return new TokenUnpauseTransaction().setTokenId(tokenId);
  }
}

/** A compact, order-identifying memo for the record account's scheduled update — see file header. */
function orderMemo(action: OrderAction, holderId: HolderId | null, reference: string): string {
  return `${action}:${holderId ?? "-"}:${reference}`.slice(0, 100);
}

export async function proposeOrder(action: OrderAction, holderId: HolderId | null, reference: string) {
  const operator = await requireOperator();
  const client = await getSdkClient();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  if (!state.recordAccountId) throw new Error("The record account is not set up yet.");
  const officer1 = getOfficer("1");
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");

  const needsHolder = action === "freeze" || action === "unfreeze" || action === "wipe";
  const holder = needsHolder ? getHolder(holderId as HolderId) : null;
  if (needsHolder && !holder) throw new Error("Unknown holder.");

  const recordUpdate = new AccountUpdateTransaction()
    .setAccountId(state.recordAccountId)
    .setAccountMemo(orderMemo(action, holder?.id ?? null, reference));

  const now = Date.now();
  const expiresAtMs = now + ORDER_EXPIRY_MS;

  const scheduleCreate = new ScheduleCreateTransaction()
    .setScheduledTransaction(recordUpdate)
    .setPayerAccountId(operator.accountId)
    .setAdminKey(officer1.publicKey)
    .setScheduleMemo(reference.slice(0, 100))
    .setExpirationTime(Timestamp.fromDate(new Date(expiresAtMs)))
    .setWaitForExpiry(false)
    .freezeWith(client);
  await scheduleCreate.sign(officer1.privateKey);
  const receipt = await (await scheduleCreate.execute(client)).getReceipt(client);

  const scheduleId = receipt.scheduleId!.toString();
  const pending: PendingApproval = {
    scheduleId,
    action,
    holderId: holder?.id ?? null,
    reference,
    createdAtMs: now,
    expiresAtMs,
  };
  addPending(pending);

  return pending;
}

/**
 * The second signature on the record-account schedule — always Officer 2's server-held key,
 * regardless of whether a human clicked "Approve as Officer 2" or "Approve as wallet". The
 * schedule's own signers are not what the real admin action depends on (see the file header); its
 * only job is to give `#pending-approvals` and the mirror node a genuine not-executed/executed
 * fact to show. Tolerates a schedule a previous attempt already completed (e.g. a retried request).
 */
async function completeRecordSchedule(client: Client, scheduleId: string) {
  const officer2 = getOfficer("2");
  if (!officer2?.privateKey) throw new Error("Officer 2 is not set up yet.");
  try {
    const frozen = new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client);
    await frozen.sign(officer2.privateKey);
    await (await frozen.execute(client)).getReceipt(client);
  } catch (error) {
    if (statusCodeOf(error) !== "SCHEDULE_ALREADY_EXECUTED") throw error;
  }
}

/** The real admin transaction for a pending order, built fresh (current balance, current moment). */
async function buildFreshAdminTransaction(pending: PendingApproval, tokenId: string) {
  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  let wipeAmount: string | undefined;
  if (pending.action === "wipe") {
    const relationship = await getTokenRelationship(holder!.accountId, tokenId);
    if (!relationship) throw new Error("Could not read the holder's balance to wipe.");
    wipeAmount = relationship.balance;
  }
  return buildInnerTransaction(pending.action, tokenId, holder?.accountId ?? null, wipeAmount);
}

/**
 * Finishes a pending order once a second officer's signature is on `tx`: submits it, records the
 * real result (whatever the network decided), and removes the order from the pending list either
 * way. Shared by `approveOrder` and the wallet-officer approval, which arrive at an equally-signed
 * `tx` by different means (a server-held key vs. a signature the wallet produced itself).
 */
/**
 * `approvedBy` is recorded because the record schedule cannot show it: that schedule is always
 * carried by Officers 1 and 2 (the desk holds both keys), whoever approved. The signature that
 * actually matters is on the admin transaction this logs the id of — Officer 1 plus whichever
 * officer approved, which for a wallet approval is the wallet's own.
 */
async function finalizeApproval(pending: PendingApproval, tx: Transaction, client: Client, approvedBy: string) {
  removePending(pending.scheduleId);
  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  const label = actionLabel(pending.action, holder?.label ?? null);

  let result = "SUCCESS";
  let transactionId = tx.transactionId?.toString() ?? pending.scheduleId; // the id this tx carries even if execute() throws
  try {
    const response = await tx.execute(client);
    transactionId = response.transactionId.toString();
    await response.getReceipt(client);
  } catch (error) {
    result = statusCodeOf(error) ?? (error instanceof Error ? error.message : "UNKNOWN_ERROR");
  }

  addHistory({
    action: `${label} (approved by ${approvedBy})`,
    reference: pending.reference,
    result,
    transactionId,
    linkKind: "transaction",
  });
  return { scheduleId: pending.scheduleId, result, transactionId };
}

/**
 * `approvedBy` is what `#history` says about this approval. It defaults to the officer whose key
 * signs the admin transaction here, and the wallet path passes its own wording: that approval's
 * signature is the wallet's, on the record schedule, with Officer 2's key carrying the admin
 * transaction as always — see `walletApproval.ts`.
 */
export async function approveOrder(scheduleId: string, officerId: OfficerId, approvedBy = `Officer ${officerId}`) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  const officer1 = getOfficer("1");
  const officer = getOfficer(officerId);
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");
  if (!officer?.privateKey) throw new Error(`Officer ${officerId} cannot sign here.`);

  const client = await getSdkClient();
  // Build and fully sign the real admin transaction FIRST: if reading the holder's current
  // balance (for a wipe) or anything else here fails, the order is still untouched and cleanly
  // pending — nothing has executed, so there is nothing to leave inconsistent. Only once that
  // succeeds do we touch the record schedule, which is the point of no return for this order.
  const inner = await buildFreshAdminTransaction(pending, state.token.tokenId);
  const frozen = inner.freezeWith(client);
  await frozen.sign(officer1.privateKey);
  await frozen.sign(officer.privateKey);

  await completeRecordSchedule(client, scheduleId);

  return finalizeApproval(pending, frozen, client, approvedBy);
}

/** "Delete": withdraws the real record-account schedule, signed by Officer 1, who holds its admin key. */
export async function deleteOrder(scheduleId: string) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  const officer1 = getOfficer("1");
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");
  const client = await getSdkClient();

  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  const frozen = new ScheduleDeleteTransaction().setScheduleId(scheduleId).freezeWith(client);
  await frozen.sign(officer1.privateKey);
  await (await frozen.execute(client)).getReceipt(client);

  removePending(scheduleId);
  addHistory({
    action: `${actionLabel(pending.action, holder?.label ?? null)} order withdrawn`,
    reference: pending.reference,
    result: "SUCCESS",
    transactionId: scheduleId,
    linkKind: "schedule",
  });
}

/**
 * Reconciles every tracked pending order against the mirror node's record of the real schedule:
 * one a previous request already finished leaves the list (that happens inline in
 * `approveOrder`/`deleteOrder`; the checks here are a safety net for whatever reaches the network
 * some other way), one whose expiry has passed without a second signature is dropped exactly as
 * the schedule itself would be, and an open one reports how many officers have genuinely signed.
 */
type PendingLive = { signatureCount: number | "unknown"; expiresAtMs: number };

/**
 * One reconcile at a time.
 *
 * `reconcilePending` retires orders and writes history, and it runs inside the view the page
 * polls — which every mutating route also rebuilds. Two of them in flight both `await` the
 * mirror node before either removes anything, so both can see the same order expired and both
 * record it. Callers that arrive mid-flight get the result of the one already running.
 */
let reconciling: Promise<Map<string, PendingLive>> | null = null;

export function reconcilePending(): Promise<Map<string, PendingLive>> {
  if (!reconciling) reconciling = runReconcile().finally(() => (reconciling = null));
  return reconciling;
}

async function runReconcile(): Promise<Map<string, PendingLive>> {
  const state = getDeskState();
  const stillPending = new Map<string, PendingLive>();

  for (const pending of [...state.pending]) {
    const schedule = await getMirrorSchedule(pending.scheduleId).catch(() => null);
    const holder = pending.holderId ? getHolder(pending.holderId) : null;
    const label = actionLabel(pending.action, holder?.label ?? null);

    if (schedule?.deleted) {
      removePending(pending.scheduleId); // normally handled inline by `deleteOrder`; safety net only
      continue;
    }

    // A wallet approval in flight owns this order until it finishes. Its wallet signature is what
    // executes the record schedule, which happens while the page is still polling, so the two
    // checks below would otherwise retire the order — one of them writing SUCCESS to history —
    // before the admin transaction the order actually consists of had run. Time-bounded, so an
    // approval the user walked away from mid-prompt still retires on the next poll after that.
    if (isWalletApprovalInFlight(pending)) {
      stillPending.set(pending.scheduleId, {
        signatureCount: signatureCountOf(schedule),
        expiresAtMs: pending.expiresAtMs,
      });
      continue;
    }

    if (schedule?.executedTimestamp) {
      // Normally `approveOrder`/the wallet flow removes this and logs the real admin transaction's
      // own result before the schedule is ever seen executed here; this is a fallback only.
      removePending(pending.scheduleId);
      addHistory({
        action: label,
        reference: pending.reference,
        result: "SUCCESS",
        transactionId: pending.scheduleId,
        linkKind: "schedule",
      });
      continue;
    }

    if (Date.now() > pending.expiresAtMs) {
      removePending(pending.scheduleId);
      addHistory({
        action: `${label} order expired`,
        reference: pending.reference,
        result: "EXPIRED",
        transactionId: pending.scheduleId,
        linkKind: "schedule",
      });
      continue;
    }

    stillPending.set(pending.scheduleId, {
      signatureCount: signatureCountOf(schedule),
      expiresAtMs: pending.expiresAtMs,
    });
  }

  return stillPending;
}

function isWalletApprovalInFlight(pending: PendingApproval): boolean {
  if (pending.walletApprovalStartedAtMs === undefined) return false;
  return Date.now() - pending.walletApprovalStartedAtMs < WALLET_APPROVAL_WINDOW_MS;
}

/**
 * A schedule the mirror node could not answer for keeps its place in the list — the order is
 * still pending — but its signature count is unknown rather than assumed to be one.
 */
function signatureCountOf(schedule: MirrorSchedule | null): number | "unknown" {
  if (!schedule) return "unknown";
  return countOfficerSignatures(schedule.signatures.map(s => s.publicKeyPrefix));
}

/**
 * How many of the three officers' keys the mirror node's signature list covers. Compares by
 * prefix in both directions since the SDK stores the key bytes it was given — in practice the
 * full key for ED25519/ECDSA — and mirror node echoes that back as `public_key_prefix`.
 */
/**
 * How many distinct officers signed, by matching the signature map's key prefixes.
 *
 * A prefix is a prefix of the public key, so the match is one-directional. And a prefix short
 * enough to fit two of the three officers identifies neither: counting it against both would
 * report more approvals than the schedule actually carries, which is the one direction this
 * number must never be wrong in.
 */
function countOfficerSignatures(prefixesHex: string[]): number {
  const officerKeys = getDeskState().officers.map(officer =>
    Buffer.from(officer.publicKey.toBytesRaw()).toString("hex"),
  );
  return countDistinctSigners(officerKeys, prefixesHex);
}

export { actionLabel };
