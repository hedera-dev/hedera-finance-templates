/**
 * What the desk asks Officer 3's wallet to send. Both halves are silent when wrong — a bad
 * selector reverts in the wallet, a bad address is just an account that does not exist — so both
 * are derived here rather than trusted.
 *
 * Run with `yarn check-security`.
 */
import { SIGN_SCHEDULE_SELECTOR, scheduleEvmAddress } from "../services/security/hrc755";
import { ensureTestnet } from "../services/security/walletChain";
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

test("a wallet that is already on testnet is not asked to switch", async () => {
  let asked = false;
  await ensureTestnet({ getChainId: async () => 296 }, async () => void (asked = true));
  assert.equal(asked, false, "no prompt when there is nothing to change");
});

test("a wallet on the wrong chain is switched, then believed only on its own answer", async () => {
  let chain = 295;
  await ensureTestnet({ getChainId: async () => chain }, async ({ chainId }) => void (chain = chainId));
  assert.equal(chain, 296);
});

test("a wallet that reports success without switching is refused, by chain", async () => {
  // HashPack's EVM provider: resolves `wallet_switchEthereumChain` with the success value and
  // stays on mainnet, while serving an account that only exists on testnet.
  await assert.rejects(
    ensureTestnet({ getChainId: async () => 295 }, async () => null),
    /on chain 295, not Hedera testnet \(296\)/,
  );
});

test("a wallet that refuses to switch is refused too, not left to fail deeper", async () => {
  await assert.rejects(
    ensureTestnet({ getChainId: async () => 1 }, async () => {
      throw new Error("User rejected the request.");
    }),
    /on chain 1, not Hedera testnet/,
  );
});
