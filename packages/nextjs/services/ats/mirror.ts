// Server-only: mirror node lookups (contract ids, account ids) used to resolve the ATS
// factory/resolver EVM addresses and to confirm newly-created accounts/contracts.
import { MIRROR_NODE_TESTNET_URL, MIRROR_POLL_ATTEMPTS, MIRROR_POLL_DELAY_MS } from "./constants";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * `fetch`, with the address in the error when it cannot connect. Without it a mirror node
 * that is unreachable is indistinguishable from an RPC relay that is: both say "fetch failed".
 */
async function mirrorFetch(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
    const detail = cause?.code ?? cause?.message;
    throw new Error(`Could not reach the mirror node at ${url}: ${detail ? `${reason} (${detail})` : reason}`);
  }
}

/** EVM address for a Hedera contract id, e.g. "0.0.9213391" -> "0x...". */
export async function getContractEvmAddress(contractId: string): Promise<`0x${string}`> {
  const res = await mirrorFetch(`${MIRROR_NODE_TESTNET_URL}/api/v1/contracts/${contractId}`);
  if (!res.ok) throw new Error(`Mirror node has no contract ${contractId} (status ${res.status})`);
  const data = (await res.json()) as { evm_address?: string };
  if (!data.evm_address) throw new Error(`Mirror node returned no evm_address for contract ${contractId}`);
  return data.evm_address as `0x${string}`;
}

/** Hedera contract id for a bond's EVM address, retrying while the mirror node catches up. */
export async function getContractIdForEvmAddress(evmAddress: string): Promise<string | null> {
  for (let attempt = 0; attempt < MIRROR_POLL_ATTEMPTS; attempt++) {
    const res = await mirrorFetch(`${MIRROR_NODE_TESTNET_URL}/api/v1/contracts/${evmAddress}`);
    if (res.ok) {
      const data = (await res.json()) as { contract_id?: string };
      if (data.contract_id) return data.contract_id;
    }
    await sleep(MIRROR_POLL_DELAY_MS);
  }
  return null;
}

/** Single-shot lookup for an address that should already be indexed (e.g. a connected wallet). */
export async function getAccountIdForEvmAddressOnce(evmAddress: string): Promise<string | null> {
  const res = await mirrorFetch(`${MIRROR_NODE_TESTNET_URL}/api/v1/accounts/${evmAddress}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { account?: string };
  return data.account ?? null;
}

/** Hedera account id for an EVM address, retrying while a freshly-created account propagates. */
export async function getAccountIdForEvmAddress(evmAddress: string): Promise<string | null> {
  for (let attempt = 0; attempt < MIRROR_POLL_ATTEMPTS; attempt++) {
    const res = await mirrorFetch(`${MIRROR_NODE_TESTNET_URL}/api/v1/accounts/${evmAddress}`);
    if (res.ok) {
      const data = (await res.json()) as { account?: string };
      if (data.account) return data.account;
    }
    await sleep(MIRROR_POLL_DELAY_MS);
  }
  return null;
}
