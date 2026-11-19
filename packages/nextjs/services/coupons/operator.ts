/**
 * The issuer is the operator account: every issuer-signed call (creating the stablecoin and
 * demo investors, issuing/allocating/funding/starting/stopping a bond) is signed here, on the
 * server, with HEDERA_OPERATOR_KEY. No response ever includes this key or a demo investor's key.
 */
import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

const RPC_URL = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";

/** Normalizes HEDERA_OPERATOR_KEY to raw ECDSA hex (no 0x), or null if it isn't ECDSA. */
function normalizeEcdsaHex(raw: string): string | null {
  const hex = raw.trim().replace(/^0x/i, "");
  if (/^[0-9a-f]{64}$/i.test(hex)) return hex.toLowerCase();
  try {
    const parsed = PrivateKey.fromStringDer(hex);
    return parsed.type === "secp256k1" ? parsed.toStringRaw() : null;
  } catch {
    return null;
  }
}

/** Returns a human-readable config problem, or null when the operator is ready to sign. */
export function getOperatorConfigError(): string | null {
  const id = process.env.HEDERA_OPERATOR_ID;
  const key = process.env.HEDERA_OPERATOR_KEY;
  if (!id || !key) {
    return "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to configure the issuer's operator account.";
  }
  try {
    AccountId.fromString(id);
  } catch {
    return "HEDERA_OPERATOR_ID is not a valid Hedera account id.";
  }
  if (!normalizeEcdsaHex(key)) {
    return "HEDERA_OPERATOR_KEY must be an ECDSA key (raw hex or DER); an ED25519 key cannot sign EVM transactions. Check HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.";
  }
  return null;
}

function requireConfigured() {
  const err = getOperatorConfigError();
  if (err) throw new Error(err);
}

export function getOperatorAccountId(): string {
  requireConfigured();
  return process.env.HEDERA_OPERATOR_ID as string;
}

let cachedHederaClient: Client | undefined;
/** @hiero-ledger/sdk client for native operations (account/token creation, HBAR transfers). */
export function getHederaClient(): Client {
  if (cachedHederaClient) return cachedHederaClient;
  requireConfigured();
  const id = AccountId.fromString(process.env.HEDERA_OPERATOR_ID as string);
  const key = PrivateKey.fromStringECDSA(normalizeEcdsaHex(process.env.HEDERA_OPERATOR_KEY as string) as string);
  cachedHederaClient = Client.forTestnet().setOperator(id, key);
  return cachedHederaClient;
}

/** viem wallet client signing with a raw ECDSA hex key, for contract calls. */
export function walletClientFor(rawHex: string) {
  const account = privateKeyToAccount(`0x${rawHex}`);
  return createWalletClient({ account, chain: hederaTestnet, transport: http(RPC_URL) });
}

let cachedWalletClient: ReturnType<typeof walletClientFor> | undefined;
/** viem wallet client signing with the operator's ECDSA key, for contract calls. */
export function getOperatorWalletClient() {
  if (cachedWalletClient) return cachedWalletClient;
  requireConfigured();
  cachedWalletClient = walletClientFor(normalizeEcdsaHex(process.env.HEDERA_OPERATOR_KEY as string) as string);
  return cachedWalletClient;
}

let cachedPublicClient: ReturnType<typeof createPublicClient> | undefined;
export function getServerPublicClient() {
  if (cachedPublicClient) return cachedPublicClient;
  cachedPublicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC_URL) });
  return cachedPublicClient;
}

export function getOperatorEvmAddress(): `0x${string}` {
  const client = getOperatorWalletClient();
  return client.account!.address as `0x${string}`;
}

/** Waits for a receipt and throws if the transaction reverted; `waitForTransactionReceipt` alone does not. */
export async function assertTransactionSucceeded(hash: `0x${string}`) {
  const publicClient = getServerPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${hash} reverted`);
  }
  return receipt;
}

/** Signs and sends a bond write call with the operator key, waiting for (and checking) the receipt. */
export async function callBond(
  address: `0x${string}`,
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint,
) {
  const walletClient = getOperatorWalletClient();
  const hash = await walletClient.writeContract({
    address,
    abi: abi as any,
    functionName,
    args: args as any,
    value,
    account: walletClient.account!,
    chain: hederaTestnet,
  });
  await assertTransactionSucceeded(hash);
  return hash;
}
