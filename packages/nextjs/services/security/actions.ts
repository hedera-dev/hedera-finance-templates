import {
  AccountCreateTransaction,
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
  setToken,
} from "~~/services/security/deskState";
import { publicKeyFromMirrorKey } from "~~/services/security/keys";
import {
  getMirrorAccount,
  getMirrorSchedule,
  getTokenRelationship,
  getTransactionResult,
} from "~~/services/security/mirrorNode";
import { getOperatorConfig } from "~~/services/security/operator";
import { getSdkClient } from "~~/services/security/sdkClient";

const ORDER_EXPIRY_MS = 5 * 60 * 1000;
const SEND_AMOUNT = 10;

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
  const tokenCreate = new TokenCreateTransaction()
    .setTokenName("Permissioned Security")
    .setTokenSymbol("PSEC")
    .setDecimals(0)
    .setInitialSupply(100)
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

export async function proposeOrder(action: OrderAction, holderId: HolderId | null, reference: string) {
  const operator = await requireOperator();
  const client = await getSdkClient();
  const state = getDeskState();
  if (!state.token) throw new Error("The token is not set up yet.");
  const officer1 = getOfficer("1");
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");

  const needsHolder = action === "freeze" || action === "unfreeze" || action === "wipe";
  const holder = needsHolder ? getHolder(holderId as HolderId) : null;
  if (needsHolder && !holder) throw new Error("Unknown holder.");

  let wipeAmount: string | undefined;
  if (action === "wipe") {
    const relationship = await getTokenRelationship(holder!.accountId, state.token.tokenId);
    if (!relationship) throw new Error("Could not read the holder's balance to wipe.");
    wipeAmount = relationship.balance;
  }

  const inner = buildInnerTransaction(action, state.token.tokenId, holder?.accountId ?? null, wipeAmount);
  const now = Date.now();
  const expiresAtMs = now + ORDER_EXPIRY_MS;

  const scheduleCreate = new ScheduleCreateTransaction()
    .setScheduledTransaction(inner)
    .setPayerAccountId(operator.accountId)
    .setAdminKey(officer1.publicKey)
    .setScheduleMemo(reference.slice(0, 100))
    .setExpirationTime(Timestamp.fromDate(new Date(expiresAtMs)))
    .setWaitForExpiry(false);

  const frozen = scheduleCreate.freezeWith(client);
  await frozen.sign(officer1.privateKey);
  const receipt = await (await frozen.execute(client)).getReceipt(client);

  const scheduleId = receipt.scheduleId!.toString();
  const pending: PendingApproval = {
    scheduleId,
    action,
    holderId: holder?.id ?? null,
    reference,
    createdAtMs: now,
    expiresAtMs,
    scheduledTransactionId: receipt.scheduledTransactionId!.toString(),
  };
  addPending(pending);

  return pending;
}

async function signSchedule(scheduleId: string, officerId: OfficerId) {
  const client = await getSdkClient();
  const officer = getOfficer(officerId);
  if (!officer?.privateKey) throw new Error(`Officer ${officerId} cannot sign here.`);

  const frozen = new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client);
  await frozen.sign(officer.privateKey);
  return (await frozen.execute(client)).getReceipt(client);
}

export async function approveOrder(scheduleId: string, officerId: OfficerId) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  await signSchedule(scheduleId, officerId);
  return pending;
}

export async function deleteOrder(scheduleId: string) {
  const client = await getSdkClient();
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  const officer1 = getOfficer("1");
  if (!officer1?.privateKey) throw new Error("Officer 1 is not set up yet.");

  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  const frozen = new ScheduleDeleteTransaction().setScheduleId(scheduleId).freezeWith(client);
  await frozen.sign(officer1.privateKey);
  const response = await frozen.execute(client);
  await response.getReceipt(client);

  removePending(scheduleId);
  addHistory({
    action: `${actionLabel(pending.action, holder?.label ?? null)} order withdrawn`,
    reference: pending.reference,
    result: "SUCCESS",
    transactionId: response.transactionId.toString(),
    linkKind: "transaction",
  });
}

/** Resolves a (possibly scheduled) transaction's result code, retrying briefly for mirror-node lag. */
async function pollTransactionResult(transactionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await getTransactionResult(transactionId).catch(() => null);
    if (result) return result;
    await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

/**
 * Reconciles every tracked pending order against the mirror node: schedules that executed or
 * expired move into history and leave the pending list; schedules still open get a fresh
 * signature count. This is the only place pending orders are mutated outside propose/delete,
 * and it is what makes `#pending-approvals` and `#history` reflect the network rather than memory.
 */
export async function reconcilePending(): Promise<Map<string, { signatureCount: number; expiresAtMs: number }>> {
  const state = getDeskState();
  const stillPending = new Map<string, { signatureCount: number; expiresAtMs: number }>();

  for (const pending of [...state.pending]) {
    let schedule;
    try {
      schedule = await getMirrorSchedule(pending.scheduleId);
    } catch {
      continue; // mirror node read failed; leave this entry untouched for now
    }
    if (!schedule) continue; // not yet ingested

    const holder = pending.holderId ? getHolder(pending.holderId) : null;
    const label = actionLabel(pending.action, holder?.label ?? null);

    if (schedule.deleted) {
      removePending(pending.scheduleId);
      continue;
    }

    if (schedule.executedTimestamp) {
      const result = await pollTransactionResult(pending.scheduledTransactionId);
      removePending(pending.scheduleId);
      addHistory({
        action: label,
        reference: pending.reference,
        result: result ?? "SUCCESS",
        transactionId: pending.scheduledTransactionId,
        linkKind: "transaction",
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

    const signatureCount = countOfficerSignatures(schedule.signatures.map(s => s.publicKeyPrefix));
    stillPending.set(pending.scheduleId, { signatureCount, expiresAtMs: pending.expiresAtMs });
  }

  return stillPending;
}

/**
 * How many of the three officers' keys the mirror node's signature list covers. Compares by
 * prefix in both directions since the SDK stores the key bytes it was given — in practice the
 * full key for ED25519/ECDSA — and mirror node echoes that back as `public_key_prefix`.
 */
function countOfficerSignatures(prefixesHex: string[]): number {
  let count = 0;
  for (const officer of getDeskState().officers) {
    const officerHex = Buffer.from(officer.publicKey.toBytesRaw()).toString("hex");
    const matched = prefixesHex.some(
      prefix => prefix.length > 0 && (officerHex.startsWith(prefix) || prefix.startsWith(officerHex)),
    );
    if (matched) count++;
  }
  return count;
}

export { actionLabel };
