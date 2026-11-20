// Server-only: viem clients talking to Hedera's JSON-RPC relay, and the operator account every
// issuer transaction is signed with. Private keys never leave this module.
import { RPC_URL } from "./constants";
import { parseOperatorKey } from "./operatorKey";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http } from "viem";
import type { Account, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

export type OperatorConfig =
  | {
      configured: true;
      operatorAccountId: string;
      account: Account;
      publicClient: ReturnType<typeof createPublicClient>;
      walletClient: ReturnType<typeof createWalletClient>;
    }
  | { configured: false; missing: string[]; error: string };

let cachedConfig: OperatorConfig | null = null;

export function getOperatorConfig(): OperatorConfig {
  if (cachedConfig) return cachedConfig;

  const operatorAccountId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  const missing = [
    ...(operatorAccountId ? [] : ["HEDERA_OPERATOR_ID"]),
    ...(operatorKey ? [] : ["HEDERA_OPERATOR_KEY"]),
  ];
  if (!operatorAccountId || !operatorKey) {
    cachedConfig = {
      configured: false,
      missing,
      error: `Set ${missing.join(" and ")} to configure the issuer.`,
    };
    return cachedConfig;
  }

  const parsedKey = parseOperatorKey(operatorKey);
  if (!parsedKey.ok) {
    cachedConfig = { configured: false, missing: ["HEDERA_OPERATOR_KEY"], error: parsedKey.error };
    return cachedConfig;
  }

  const account = privateKeyToAccount(parsedKey.privateKeyHex);
  const transport = http(RPC_URL);

  cachedConfig = {
    configured: true,
    operatorAccountId,
    account,
    publicClient: createPublicClient({ chain: hederaTestnet, transport }),
    walletClient: createWalletClient({ chain: hederaTestnet, transport, account }),
  };
  return cachedConfig;
}

/** Narrows a possibly-unconfigured operator to the configured shape, or throws its error. */
export function requireOperator() {
  const operator = getOperatorConfig();
  if (!operator.configured) throw new Error(operator.error);
  return operator;
}

/** A wallet client for a demo officer's or holder's own key, for the transactions they sign themselves. */
export function walletFor(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return {
    account,
    walletClient: createWalletClient({ chain: hederaTestnet, transport: http(RPC_URL), account }),
  };
}

let sharedPublicClient: ReturnType<typeof createPublicClient> | null = null;

/** Read-only client for chain reads that don't need the operator (token and board views). */
export function getPublicClient() {
  if (!sharedPublicClient) {
    sharedPublicClient = createPublicClient({ chain: hederaTestnet, transport: http(RPC_URL) });
  }
  return sharedPublicClient;
}

/**
 * Relay trouble, as opposed to an answer.
 *
 * A revert is an answer — the contract said no, and asking again says no again. These are the
 * public relay failing to ask at all: `Service Unavailable` while simulating, a rate limit, a
 * gateway error. They arrive as HTTP 400s carrying a `-32000` body, so the status alone cannot
 * tell them apart from a refusal.
 */
const TRANSIENT_RELAY =
  /service unavailable|timeout|timed out|too many requests|bad gateway|50[234]\b|ECONNRESET|ETIMEDOUT|fetch failed/i;

export function isTransientRelayError(error: unknown): boolean {
  if (error instanceof BaseError && error.walk(e => e instanceof ContractFunctionRevertedError)) return false;
  const text = [
    error instanceof Error ? error.message : String(error),
    (error as { details?: string })?.details ?? "",
  ].join(" ");
  return TRANSIENT_RELAY.test(text);
}

/**
 * Runs a read-only call again when the relay — not the contract — is the thing that failed.
 * Only ever wrapped around simulations and reads: re-sending a transaction is not a retry.
 */
export async function retryTransient<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientRelayError(error)) throw error;
      console.warn(`[desk] relay unavailable, retrying (${attempt}/${attempts - 1})`);
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}
