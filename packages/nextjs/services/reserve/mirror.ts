// Server-only: contract ids and EVM addresses from the mirror node.
import { MIRROR_URL } from "./constants";
import type { Address } from "viem";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const evmCache = new Map<string, Address>();

async function mirrorJson(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${MIRROR_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The mirror node answered ${response.status}.`);
  return (await response.json()) as Record<string, unknown>;
}

/** The EVM address of a contract id such as 0.0.9213391. */
export async function contractEvmAddress(contractId: string): Promise<Address> {
  const cached = evmCache.get(contractId);
  if (cached) return cached;
  const body = await mirrorJson(`/api/v1/contracts/${contractId}`);
  const evm = body?.evm_address;
  if (typeof evm !== "string") throw new Error(`The mirror node has no contract ${contractId}.`);
  evmCache.set(contractId, evm as Address);
  return evm as Address;
}

/**
 * The id behind an EVM address. A fresh contract or account takes a few seconds to reach the mirror node,
 * so this waits for it.
 */
export async function entityId(
  kind: "contracts" | "accounts",
  evmAddress: string,
  waitMs = 30_000,
): Promise<string | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const body = await mirrorJson(`/api/v1/${kind}/${evmAddress}`);
      const id = kind === "contracts" ? body?.contract_id : body?.account;
      if (typeof id === "string") return id;
    } catch {
      // keep waiting: the mirror node lags the relay
    }
    if (Date.now() >= deadline) return null;
    await sleep(2_000);
  }
}
