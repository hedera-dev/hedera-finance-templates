// DvP proof on Hedera testnet: one scheduled TransferTransaction moves the
// security leg and the cash leg together, or neither.
// Run: HEDERA_OPERATOR_ID=0.0.x HEDERA_OPERATOR_KEY=<ecdsa hex> npm start
import assert from "node:assert/strict";
import {
  Client, PrivateKey, AccountId, Hbar, AccountCreateTransaction, TokenCreateTransaction,
  TokenType, TokenAssociateTransaction, TokenGrantKycTransaction, TransferTransaction,
  ScheduleCreateTransaction, ScheduleSignTransaction, TransactionReceiptQuery,
} from "@hiero-ledger/sdk";

const opId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const opKey = PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_KEY.replace(/^0x/, ""));
const client = Client.forTestnet().setOperator(opId, opKey);
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

const exec = async (tx, ...keys) => {
  tx = tx.freezeWith(client);
  for (const k of keys) tx = await tx.sign(k);
  return (await tx.execute(client)).getReceipt(client);
};

// ponytail: fixed sleep for mirror-node lag; poll if this flakes
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function bal(acct, token) {
  const r = await fetch(`${MIRROR}/accounts/${acct}/tokens?token.id=${token}`).then(r => r.json());
  return Number(r.tokens?.[0]?.balance ?? 0);
}
const snapshot = async (who, sec, usd) =>
  Object.fromEntries(await Promise.all(Object.entries(who).map(async ([n, a]) => [n, { SEC: await bal(a.id, sec), tUSD: await bal(a.id, usd) / 1e6 }])));

async function newAccount() {
  const key = PrivateKey.generateECDSA();
  const r = await exec(new AccountCreateTransaction().setKeyWithoutAlias(key.publicKey).setInitialBalance(new Hbar(3)));
  return { id: r.accountId, key };
}

// --- Setup: issuer (operator) creates both tokens; security is KYC-gated
const sec = (await exec(new TokenCreateTransaction()
  .setTokenName("Demo Security").setTokenSymbol("SEC").setTokenType(TokenType.FungibleCommon)
  .setDecimals(0).setInitialSupply(1000).setTreasuryAccountId(opId)
  .setAdminKey(opKey).setKycKey(opKey).setFreezeKey(opKey).setSupplyKey(opKey))).tokenId;
const usd = (await exec(new TokenCreateTransaction()
  .setTokenName("Test USD").setTokenSymbol("tUSD").setTokenType(TokenType.FungibleCommon)
  .setDecimals(6).setInitialSupply(1_000_000 * 1e6).setTreasuryAccountId(opId)
  .setAdminKey(opKey).setSupplyKey(opKey))).tokenId;
console.log("SEC", sec.toString(), "| tUSD", usd.toString());

const seller = await newAccount(), buyer = await newAccount(), noKyc = await newAccount();
for (const a of [seller, buyer, noKyc])
  await exec(new TokenAssociateTransaction().setAccountId(a.id).setTokenIds([sec, usd]), a.key);
for (const a of [seller, buyer]) await exec(new TokenGrantKycTransaction().setAccountId(a.id).setTokenId(sec));
await exec(new TransferTransaction()
  .addTokenTransfer(sec, opId, -200).addTokenTransfer(sec, seller.id, 200)
  .addTokenTransfer(usd, opId, -20_000e6).addTokenTransfer(usd, buyer.id, 10_000e6).addTokenTransfer(usd, noKyc.id, 10_000e6));
console.log("seller", seller.id.toString(), "| buyer", buyer.id.toString(), "| noKyc", noKyc.id.toString());

// --- Trade: seller proposes + signs, counterparty signs later, network settles both legs at once
const dvp = (to, qty, price) => new TransferTransaction()
  .addTokenTransfer(sec, seller.id, -qty).addTokenTransfer(sec, to.id, qty)
  .addTokenTransfer(usd, to.id, -price * 1e6).addTokenTransfer(usd, seller.id, price * 1e6);

async function settle(to, qty, price) {
  const created = await exec(new ScheduleCreateTransaction().setScheduledTransaction(dvp(to, qty, price)).setScheduleMemo("DvP demo"), seller.key);
  await sleep(5000);
  const pending = await snapshot({ seller, to }, sec, usd);
  await exec(new ScheduleSignTransaction().setScheduleId(created.scheduleId), to.key);
  let status;
  try {
    status = (await new TransactionReceiptQuery().setTransactionId(created.scheduledTransactionId).execute(client)).status.toString();
  } catch (e) { status = e.status?.toString() ?? String(e); }
  await sleep(5000);
  return { scheduleId: created.scheduleId.toString(), status, pending, after: await snapshot({ seller, to }, sec, usd) };
}

await sleep(5000);
const before = await snapshot({ seller, buyer }, sec, usd);
const ok = await settle(buyer, 100, 10_000);
console.log("\nHappy path", ok.scheduleId, ok.status, { before, afterSellerSigned: ok.pending, afterBuyerSigned: ok.after });
assert.deepEqual(ok.pending, { seller: before.seller, to: before.buyer }, "nothing moves until both signed");
assert.equal(ok.status, "SUCCESS");
assert.deepEqual(ok.after, { seller: { SEC: 100, tUSD: 10_000 }, to: { SEC: 100, tUSD: 0 } });

const bad = await settle(noKyc, 10, 1_000);
console.log("\nNo-KYC buyer", bad.scheduleId, bad.status, { before: bad.pending, after: bad.after });
assert.equal(bad.status, "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN");
assert.deepEqual(bad.after, bad.pending, "neither leg moves when one leg fails compliance");

console.log("\nAll DvP assertions passed");
client.close();
