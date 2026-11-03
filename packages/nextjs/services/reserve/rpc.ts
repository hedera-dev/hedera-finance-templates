// Server-only: reads that retry, and sends that never do.
import { chain, getPublicClient, getWalletClient } from "./clients";
import { GAS_ESTIMATE_MARGIN_PERCENT } from "./constants";
import { decodeFailure, isTransient } from "./errors";
import { type Abi, type Address, type Hex, encodeFunctionData } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Retries a read or a simulation on a transient relay failure. Never use it around a send. */
export async function withReadRetry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) throw error;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastError;
}

/** A contract read with transient-failure retries. */
export function read<T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return withReadRetry(() => getPublicClient().readContract({ address, abi, functionName, args })) as Promise<T>;
}

/** Operator transactions are serialised: one nonce at a time, so two button presses never collide. */
let queue: Promise<unknown> = Promise.resolve();
export function withTxLock<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export type SendRequest = {
  account: PrivateKeyAccount;
  to?: Address;
  data: Hex;
  value?: bigint;
  /** Fixed gas limit; otherwise the estimate plus a margin. */
  gas?: bigint;
};

export type SendOutcome = {
  hash: Hex;
  status: "success" | "reverted";
  logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[];
  contractAddress?: Address | null;
};

/**
 * Prepares (retryable reads), signs once, sends once, then waits for the receipt (a retryable read).
 * If the send itself fails the transaction is not re-sent: the caller learns it failed.
 */
export async function sendTransaction(request: SendRequest): Promise<SendOutcome> {
  const publicClient = getPublicClient();
  const wallet = getWalletClient(request.account);

  const gas =
    request.gas ??
    (await withReadRetry(async () => {
      const estimate = await publicClient.estimateGas({
        account: request.account,
        to: request.to,
        data: request.data,
        value: request.value,
      });
      return (estimate * GAS_ESTIMATE_MARGIN_PERCENT) / 100n;
    }));
  const [nonce, gasPrice] = await withReadRetry(() =>
    Promise.all([
      publicClient.getTransactionCount({ address: request.account.address, blockTag: "pending" }),
      publicClient.getGasPrice(),
    ]),
  );

  const serialized = await wallet.signTransaction({
    account: request.account,
    chain,
    type: "legacy",
    to: request.to,
    data: request.data,
    value: request.value,
    gas,
    gasPrice,
    nonce,
  });
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });

  const receipt = await withReadRetry(
    () => publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1_000, timeout: 90_000 }),
    3,
  );
  return {
    hash,
    status: receipt.status,
    logs: receipt.logs,
    contractAddress: receipt.contractAddress,
  };
}

export type CallOutcome<T> = { ok: true; result: T } | { ok: false; name: string; message: string; reverted: boolean };

/** Simulates a call as `account`. A refusal comes back decoded to its error name; nothing is sent. */
export async function simulate(request: {
  account: Address;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  gas?: bigint;
}): Promise<CallOutcome<unknown>> {
  try {
    const data = encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args });
    await withReadRetry(() =>
      getPublicClient().call({ account: request.account, to: request.address, data, gas: request.gas }),
    );
    return { ok: true, result: undefined };
  } catch (error) {
    const decoded = decodeFailure(error);
    return { ok: false, name: decoded.name, message: decoded.message, reverted: decoded.reverted };
  }
}
