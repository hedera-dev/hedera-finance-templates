import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  KeyList,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenFreezeTransaction,
  TokenGrantKycTransaction,
  TokenPauseTransaction,
  TokenUnfreezeTransaction,
  TokenUnpauseTransaction,
  TokenWipeTransaction,
  Transaction,
  TransactionId,
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
import { getFirstNetworkNodeAccountId, getMirrorAccount, getTokenRelationship } from "~~/services/security/mirrorNode";
import { getOperatorConfig } from "~~/services/security/operator";
import { getSdkClient } from "~~/services/security/sdkClient";

/**
 * Court orders are NOT carried with `ScheduleCreateTransaction` / `ScheduleSignTransaction`,
 * even though that is what the spec for this desk calls for and what `setupDistribute` below
 * still does not need (it collects both signatures itself before ever touching the network).
 *
 * Verified live against Hedera testnet (and documented in Hedera's own HIP-423 announcement and
 * in hashgraph/hedera-agent-kit-js#1125): the network's `scheduling.whitelist` only admits
 * ConsensusSubmitMessage, CryptoTransfer, TokenMint, TokenBurn, CryptoCreate, CryptoUpdate,
 * FileUpdate, SystemDelete/Undelete, Freeze and the Contract* functions. `TokenFreezeAccount`,
 * `TokenUnfreezeAccount`, `TokenPause`, `TokenUnpause`, `TokenAccountWipe` (and, for what it's
 * worth, `TokenGrantKycToAccount`) are not on it. A `ScheduleCreateTransaction` wrapping any of
 * them fails immediately with `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST` — no schedule entity is
 * even created — so none of this desk's five order types can ever be proposed that way today.
 *
 * What still delivers the spec's actual requirement — the network, not this app, refuses an
 * action short of two officer signatures — is the same offline multi-sig pattern Hedera
 * documents for a KeyList-gated transaction: freeze the real admin transaction once, let Officer
 * 1 sign it, hold the partially-signed bytes (`Transaction.toBytes()`), and let a second officer
 * (or the wallet) complete and submit it (`Transaction.fromBytes()` + another `.sign()` /
 * `.addSignature()` + `.execute()`). A single signature is provably insufficient — the network
 * itself rejects submission against the 2-of-3 `KeyList` key — exactly as a schedule's execution
 * would have been gated, just without a schedule entity the mirror node can show as pending.
 * `reconcilePending` below is this desk's own clock standing in for the schedule service's expiry.
 */

const ORDER_VALID_DURATION_SECONDS = 180; // the network's own ceiling for a transaction's valid window
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
  const nodeAccountId = await getFirstNetworkNodeAccountId();
  const transactionId = TransactionId.generate(operator.accountId);
  const now = Date.now();

  // No `client` here: node account id and transaction id are set explicitly, so `freeze()` needs
  // neither a network round trip nor an operator-bearing client to finish building the transaction.
  const frozen = inner
    .setTransactionId(transactionId)
    .setNodeAccountIds([AccountId.fromString(nodeAccountId)])
    .setTransactionValidDuration(ORDER_VALID_DURATION_SECONDS)
    .freeze();
  await frozen.sign(officer1.privateKey);

  const scheduleId = transactionId.toString();
  const pending: PendingApproval = {
    scheduleId,
    action,
    holderId: holder?.id ?? null,
    reference,
    createdAtMs: now,
    expiresAtMs: now + ORDER_VALID_DURATION_SECONDS * 1000,
    transactionBytes: frozen.toBytes(),
  };
  addPending(pending);

  return pending;
}

/**
 * Finishes a pending order once a second officer's signature is on `tx`: submits it, records the
 * real result (whatever the network decided), and removes the order from the pending list either
 * way. Shared by `approveOrder` and the wallet-officer approval, which arrive at an equally-signed
 * `tx` by different means (a server-held key vs. a signature the wallet produced itself).
 */
async function finalizeApproval(pending: PendingApproval, tx: Transaction, client: Client) {
  removePending(pending.scheduleId);
  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  const label = actionLabel(pending.action, holder?.label ?? null);

  let result = "SUCCESS";
  let transactionId = pending.scheduleId; // the id this transaction carries even if execute() itself throws
  try {
    const response = await tx.execute(client);
    transactionId = response.transactionId.toString();
    await response.getReceipt(client);
  } catch (error) {
    result = statusCodeOf(error) ?? (error instanceof Error ? error.message : "UNKNOWN_ERROR");
  }

  addHistory({ action: label, reference: pending.reference, result, transactionId, linkKind: "transaction" });
  return { scheduleId: pending.scheduleId, result, transactionId };
}

function requirePendingNotExpired(pending: PendingApproval) {
  if (Date.now() <= pending.expiresAtMs) return;
  removePending(pending.scheduleId);
  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  addHistory({
    action: `${actionLabel(pending.action, holder?.label ?? null)} order expired`,
    reference: pending.reference,
    result: "EXPIRED",
    transactionId: pending.scheduleId,
    linkKind: "transaction",
  });
  throw new Error("This order has expired.");
}

export async function approveOrder(scheduleId: string, officerId: OfficerId) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  requirePendingNotExpired(pending);
  const officer = getOfficer(officerId);
  if (!officer?.privateKey) throw new Error(`Officer ${officerId} cannot sign here.`);

  const tx = Transaction.fromBytes(pending.transactionBytes);
  await tx.sign(officer.privateKey);
  const client = await getSdkClient();
  return finalizeApproval(pending, tx, client);
}

/** Lets the wallet-officer approval path finish signing outside this module without reaching into desk state. */
export async function executeApprovedOrder(scheduleId: string, tx: Transaction) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  requirePendingNotExpired(pending);
  const client = await getSdkClient();
  return finalizeApproval(pending, tx, client);
}

/** "Delete": nothing was ever submitted for a merely-proposed order, so withdrawing it is memory-only. */
export async function deleteOrder(scheduleId: string) {
  const pending = getPending(scheduleId);
  if (!pending) throw new Error("This desk did not create that order.");
  const holder = pending.holderId ? getHolder(pending.holderId) : null;
  removePending(scheduleId);
  addHistory({
    action: `${actionLabel(pending.action, holder?.label ?? null)} order withdrawn`,
    reference: pending.reference,
    result: "SUCCESS",
    transactionId: pending.scheduleId,
    linkKind: "transaction",
  });
}

/**
 * Drops any pending order whose transaction has outlived its valid-duration window, exactly as
 * the network would refuse to execute it past that point. This is the only place pending orders
 * are mutated outside propose/approve/delete, and it is what makes an unapproved order eventually
 * leave `#pending-approvals` on its own.
 */
export async function reconcilePending(): Promise<Map<string, { signatureCount: number; expiresAtMs: number }>> {
  const state = getDeskState();
  const stillPending = new Map<string, { signatureCount: number; expiresAtMs: number }>();

  for (const pending of [...state.pending]) {
    try {
      requirePendingNotExpired(pending);
    } catch {
      continue; // expired and already moved to history
    }
    // Exactly one officer (Officer 1) has signed by the time a proposal is sitting in memory —
    // a second signature finishes and submits the transaction immediately, so it is never "pending".
    stillPending.set(pending.scheduleId, { signatureCount: 1, expiresAtMs: pending.expiresAtMs });
  }

  return stillPending;
}

export { actionLabel };
