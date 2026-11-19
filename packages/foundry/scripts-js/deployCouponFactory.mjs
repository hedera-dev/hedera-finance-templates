#!/usr/bin/env node
/**
 * `yarn coupons:deploy` — deploys the coupon bond factory to Hedera testnet, once, without prompts.
 *
 * The scaffold's own `yarn foundry:deploy` signs with an encrypted keystore and asks for its
 * password, which neither a script nor a CI run can answer. This signs with the operator key
 * instead (HEDERA_OPERATOR_KEY, or packages/nextjs/.env.local), then regenerates
 * packages/nextjs/contracts/deployedContracts.ts so the app finds the factory.
 *
 * Idempotent: skipped when deployedContracts.ts already has a CouponBondFactory on chain 296, and
 * skipped (exit 0) while script/DeployCouponFactory.s.sol does not exist yet.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const foundryDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextjsDir = join(foundryDir, "..", "nextjs");
const SCRIPT = "script/DeployCouponFactory.s.sol";
const RPC_URL = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";

if (!existsSync(join(foundryDir, SCRIPT))) {
  console.log(`coupons:deploy: ${SCRIPT} does not exist yet; nothing to deploy.`);
  process.exit(0);
}

const deployed = join(nextjsDir, "contracts", "deployedContracts.ts");
if (existsSync(deployed)) {
  const source = readFileSync(deployed, "utf8");
  const chain296 = source.match(/296:\s*\{([\s\S]*?)\n {2}\},?/);
  if (chain296 && chain296[1].includes("CouponBondFactory")) {
    console.log("coupons:deploy: CouponBondFactory is already deployed on Hedera testnet (chain 296); skipping.");
    process.exit(0);
  }
}

function operatorKey() {
  let key = process.env.HEDERA_OPERATOR_KEY;
  if (!key) {
    const envFile = join(nextjsDir, ".env.local");
    if (existsSync(envFile)) key = readFileSync(envFile, "utf8").match(/^HEDERA_OPERATOR_KEY=(.+)$/m)?.[1]?.trim();
  }
  if (!key) {
    console.error("coupons:deploy: set HEDERA_OPERATOR_KEY (an ECDSA key) in the environment or packages/nextjs/.env.local.");
    process.exit(1);
  }
  const hex = key.replace(/^0x/i, "");
  if (/^[0-9a-f]{64}$/i.test(hex)) return `0x${hex}`;
  // DER-encoded: let the Hedera SDK (already a dependency of the app) say what it is.
  const { PrivateKey } = createRequire(join(nextjsDir, "package.json"))("@hiero-ledger/sdk");
  const parsed = PrivateKey.fromStringDer(hex);
  if (parsed.type !== "secp256k1") {
    console.error("coupons:deploy: HEDERA_OPERATOR_KEY must be an ECDSA key; EVM deployments cannot be signed with ED25519.");
    process.exit(1);
  }
  return `0x${parsed.toStringRaw()}`;
}

const run = (cmd, args) => execFileSync(cmd, args, { cwd: foundryDir, stdio: "inherit" });

// The deploy script records the address here; the folder is ignored by git, so a fresh clone has none.
mkdirSync(join(foundryDir, "deployments"), { recursive: true });
console.log("coupons:deploy: deploying CouponBondFactory to Hedera testnet…");
run("forge", [
  "script", SCRIPT,
  "--rpc-url", RPC_URL,
  "--chain-id", "296",
  "--private-key", operatorKey(),
  "--broadcast", "--slow", "--legacy",
]);
run("node", ["scripts-js/generateTsAbis.js"]);
console.log("coupons:deploy: done; packages/nextjs/contracts/deployedContracts.ts updated.");
