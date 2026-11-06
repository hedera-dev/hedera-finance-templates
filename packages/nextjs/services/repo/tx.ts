// Server-only: operator transactions, each simulated first so a refusal is decoded before anything is sent,
// and each recorded in the activity log.
import { logActivity } from "./desk";
import { decodeFailure } from "./errors";
import { type SendOutcome, sendTransaction, simulate, withTxLock } from "./rpc";
import { type Abi, type Address, type Hex, encodeDeployData, encodeFunctionData } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

export type Executed =
  | { ok: true; hash: Hex; logs: SendOutcome["logs"]; contractAddress?: Address | null }
  | { ok: false; name: string; message: string; hash?: Hex };

type CallSpec = {
  account: PrivateKeyAccount;
  /** What the activity log says was done. */
  action: string;
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  gas?: bigint;
  value?: bigint;
  /** Record the action in the log. Setup records its own, coarser, entries. */
  log?: boolean;
};

/** Simulate, and only if the network would accept it, send once. Never throws for a refusal. */
export function execute(spec: CallSpec): Promise<Executed> {
  return withTxLock(async () => {
    const record = (result: string, hash?: Hex) => {
      if (spec.log !== false) logActivity({ action: spec.action, result, txHash: hash });
    };

    const simulation = await simulate({
      account: spec.account.address,
      address: spec.to,
      abi: spec.abi,
      functionName: spec.functionName,
      args: spec.args,
      gas: spec.gas,
      value: spec.value,
    });
    if (!simulation.ok) {
      record(simulation.name);
      return { ok: false, name: simulation.name, message: simulation.message };
    }

    try {
      const outcome = await sendTransaction({
        account: spec.account,
        to: spec.to,
        data: encodeFunctionData({ abi: spec.abi, functionName: spec.functionName, args: spec.args }),
        gas: spec.gas,
        value: spec.value,
      });
      if (outcome.status !== "success") {
        record("Reverted", outcome.hash);
        return {
          ok: false,
          name: "Reverted",
          message: "The transaction was mined and reverted: the state it was simulated against had changed.",
          hash: outcome.hash,
        };
      }
      record("SUCCESS", outcome.hash);
      return { ok: true, hash: outcome.hash, logs: outcome.logs };
    } catch (error) {
      const decoded = decodeFailure(error);
      record(decoded.name);
      return { ok: false, name: decoded.name, message: decoded.message };
    }
  });
}

/** Deploys a contract of the desk's own. */
export function deployContract(spec: {
  account: PrivateKeyAccount;
  action: string;
  abi: Abi;
  bytecode: Hex;
  args: readonly unknown[];
}): Promise<Executed> {
  return withTxLock(async () => {
    try {
      const outcome = await sendTransaction({
        account: spec.account,
        data: encodeDeployData({ abi: spec.abi, bytecode: spec.bytecode, args: spec.args }),
      });
      if (outcome.status !== "success" || !outcome.contractAddress) {
        logActivity({ action: spec.action, result: "Reverted", txHash: outcome.hash });
        return { ok: false, name: "Reverted", message: "The deployment was mined and reverted.", hash: outcome.hash };
      }
      logActivity({ action: spec.action, result: "SUCCESS", txHash: outcome.hash });
      return { ok: true, hash: outcome.hash, logs: outcome.logs, contractAddress: outcome.contractAddress };
    } catch (error) {
      const decoded = decodeFailure(error);
      logActivity({ action: spec.action, result: decoded.name });
      return { ok: false, name: decoded.name, message: decoded.message };
    }
  });
}
