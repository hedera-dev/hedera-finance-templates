// Server-only: how every write this desk makes reaches the chain.
//
// Each one simulates first — a plain `eth_call`, no signature, no HBAR spent — so a revert is
// caught and decoded before a real transaction is sent. The tour's attacks are the exception:
// their refusal is the point, so they are sent anyway and the refusal ends up on HashScan where
// a reader can see the network's own record of it.
import { isTransientRelayError, requireOperator, retryTransient, walletFor } from "./clients";
import { GAS_FUND_ACCOUNT } from "./constants";
import { decodeDeskError } from "./errors";
import { getRevertData } from "./mirror";
import { decodeErrorResult } from "viem";
import type { Abi, Address, Hex, TransactionReceipt } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";

/** `txHash` on a refusal: the refused transaction, when it was sent so the refusal is on the ledger. */
export type WriteOutcome =
  | { ok: true; txHash: Hex; logs: TransactionReceipt["logs"] }
  | { ok: false; error: string; errorName: string; txHash?: Hex };

export type Signer = { privateKey: Hex } | "operator";

function signerFor(signer: Signer) {
  if (signer === "operator") {
    const operator = requireOperator();
    return { account: operator.account, walletClient: operator.walletClient };
  }
  return walletFor(signer.privateKey);
}

export type WriteOptions = {
  /** Who signs. The operator unless the point of the action is that somebody else signed it. */
  signer?: Signer;
  /** Send the transaction even when the simulation says it reverts, so the refusal is on the ledger. */
  sendRefusal?: boolean;
};

export async function simulateAndSend(
  address: Address,
  abi: Abi | readonly unknown[],
  functionName: string,
  args: readonly unknown[],
  gas: bigint,
  options: WriteOptions = {},
): Promise<WriteOutcome> {
  const operator = requireOperator();
  const signer = signerFor(options.signer ?? "operator");
  const call = { address, abi: abi as Abi, functionName, args: args as never, gas };

  let refusal: ReturnType<typeof decodeDeskError> | null = null;
  try {
    const { request } = await retryTransient(() =>
      operator.publicClient.simulateContract({ ...call, account: signer.account }),
    );
    const txHash = await signer.walletClient.writeContract(request);
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, error: `Transaction ${txHash} failed on-chain.`, errorName: "Error", txHash };
    }
    return { ok: true, txHash, logs: receipt.logs };
  } catch (error) {
    refusal = decodeDeskError(error);
    // Only a refusal is worth sending: a relay that failed to answer has said nothing yet.
    if (!options.sendRefusal || isTransientRelayError(error)) {
      return { ok: false, error: refusal.message, errorName: refusal.name };
    }
  }

  // Sent with the limit given, since a call that reverts cannot be estimated.
  try {
    const txHash = await signer.walletClient.writeContract({
      ...call,
      account: signer.account,
      chain: hederaTestnet,
    });
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === "success") return { ok: true, txHash, logs: receipt.logs };
    // What the network actually answered, which can differ from what the simulation predicted: the
    // relay simulates against the mirror node's state, and that lags consensus by a moment.
    const executed = await decodeRevertOnChain(txHash, abi);
    return {
      ok: false,
      error: executed?.message ?? refusal.message,
      errorName: executed?.name ?? refusal.name,
      txHash,
    };
  } catch (error) {
    const decoded = decodeDeskError(error);
    return { ok: false, error: decoded.message, errorName: decoded.name };
  }
}

/** The refusal the mirror node recorded for a sent transaction, decoded against the call's own ABI. */
async function decodeRevertOnChain(txHash: Hex, abi: Abi | readonly unknown[]) {
  try {
    const data = await getRevertData(txHash);
    if (!data) return null;
    const decoded = decodeErrorResult({ abi: abi as Abi, data });
    const args = (decoded.args ?? []) as readonly unknown[];
    return {
      name: decoded.errorName,
      message: args.length ? `${decoded.errorName}(${args.join(", ")})` : decoded.errorName,
    };
  } catch {
    // An error the ABI does not describe, or a mirror node that will not answer: the simulation's
    // reading stands rather than nothing at all.
    return null;
  }
}

/** Like `simulateAndSend`, but throws the decoded refusal: for setup, where a failure stops the run. */
export async function send(
  address: Address,
  abi: Abi | readonly unknown[],
  functionName: string,
  args: readonly unknown[],
  gas: bigint,
  options: WriteOptions = {},
) {
  const outcome = await simulateAndSend(address, abi, functionName, args, gas, options);
  if (!outcome.ok) throw new Error(`${functionName} was refused: ${outcome.error}`);
  return outcome;
}

/**
 * A fresh ECDSA keypair funded from the operator, which is what lazily creates the account on
 * Hedera. The key stays in server memory and never reaches the browser.
 */
export async function createFundedAccount(hbar: string): Promise<{ privateKey: Hex; address: Address; txHash: Hex }> {
  const operator = requireOperator();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const txHash = await operator.walletClient.sendTransaction({
    account: operator.account,
    chain: hederaTestnet,
    to: account.address,
    value: BigInt(Math.round(Number(hbar) * 1e18)),
    gas: GAS_FUND_ACCOUNT,
  });
  await operator.publicClient.waitForTransactionReceipt({ hash: txHash });

  return { privateKey, address: account.address, txHash };
}
