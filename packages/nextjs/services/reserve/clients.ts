// Server-only: one shared viem client per process. A route never closes it.
import { readOperatorConfig } from "./config";
import { HASHIO_RPC_URL } from "./constants";
import { type Chain, createPublicClient, createWalletClient, defineChain, http } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

// The relay is hashio. `retryCount: 0` matters: viem would otherwise retry any request, including
// `eth_sendRawTransaction`, and a transaction is never re-sent. Reads are retried by `rpc.ts`.
const chain: Chain = defineChain({ ...hederaTestnet, rpcUrls: { default: { http: [HASHIO_RPC_URL] } } });
const transport = () => http(HASHIO_RPC_URL, { retryCount: 0, timeout: 30_000 });

const publicClient = createPublicClient({ chain, transport: transport() });
export type PublicClient = typeof publicClient;

export type Operator = {
  accountId: string;
  account: PrivateKeyAccount;
};

const globalForOperator = globalThis as unknown as { __reserveOperator?: { key: string; operator: Operator } };

/** The operator account, or the readable reason there is none. */
export function getOperator(): { ok: true; operator: Operator } | { ok: false; error: string } {
  const config = readOperatorConfig();
  if (!config.ok) return config;
  if (globalForOperator.__reserveOperator?.key !== config.key) {
    globalForOperator.__reserveOperator = {
      key: config.key,
      operator: { accountId: config.accountId, account: privateKeyToAccount(config.key) },
    };
  }
  return { ok: true, operator: globalForOperator.__reserveOperator.operator };
}

export function getPublicClient(): PublicClient {
  return publicClient;
}

export function getWalletClient(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain, transport: transport() });
}

export { chain };
