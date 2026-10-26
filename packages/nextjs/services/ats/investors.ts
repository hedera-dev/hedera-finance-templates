// Server-only: demo investor creation plus the control-list/issue actions the issuer performs
// on them. Every write simulates first (a plain `eth_call`, no signature, no HBAR spent) so a
// revert is caught and decoded before a real transaction is ever sent.
import { bondAbi } from "./abi";
import { requireOperator, retryTransient } from "./clients";
import { GAS_LIMIT_CONTROL_LIST, GAS_LIMIT_FUND_INVESTOR, GAS_LIMIT_ISSUE, INVESTOR_FUNDING_HBAR } from "./constants";
import { decodeAtsError } from "./errors";
import { getAccountIdForEvmAddress } from "./mirror";
import type { InvestorLabel, InvestorRecord } from "./state";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

/**
 * Creates a demo investor: a fresh ECDSA keypair (EVM address derived from the public key),
 * funded from the operator with a small HBAR transfer. Hedera lazily auto-creates the account
 * from that transfer; the investor signs nothing and its key never leaves this module.
 */
export async function createDemoInvestor(label: InvestorLabel): Promise<{ record: InvestorRecord; txHash: Hex }> {
  const operator = requireOperator();
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const txHash = await operator.walletClient.sendTransaction({
    account: operator.account,
    chain: chains.hederaTestnet,
    to: account.address,
    value: BigInt(Math.round(Number(INVESTOR_FUNDING_HBAR) * 1e18)),
    gas: GAS_LIMIT_FUND_INVESTOR,
  });
  await operator.publicClient.waitForTransactionReceipt({ hash: txHash });

  const hederaAccountId = await getAccountIdForEvmAddress(account.address);
  return { record: { label, address: account.address, hederaAccountId }, txHash };
}

export type WriteOutcome = { ok: true; txHash: Hex } | { ok: false; error: string; errorName: string };

async function simulateAndSend(
  bondAddress: Address,
  functionName: "addToControlList" | "removeFromControlList" | "issue",
  args: readonly unknown[],
  gas: bigint,
): Promise<WriteOutcome> {
  const operator = requireOperator();
  try {
    const { request } = await retryTransient(() =>
      operator.publicClient.simulateContract({
        address: bondAddress,
        abi: bondAbi,
        functionName,

        args: args as any,
        account: operator.account,
        gas,
      }),
    );
    const txHash = await operator.walletClient.writeContract(request);
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, error: `Transaction ${txHash} failed on-chain`, errorName: "Error" };
    }
    return { ok: true, txHash };
  } catch (error) {
    const decoded = decodeAtsError(error);
    return { ok: false, error: decoded.message, errorName: decoded.name };
  }
}

export const approveInvestor = (bondAddress: Address, investor: Address) =>
  simulateAndSend(bondAddress, "addToControlList", [investor], GAS_LIMIT_CONTROL_LIST);

export const revokeInvestor = (bondAddress: Address, investor: Address) =>
  simulateAndSend(bondAddress, "removeFromControlList", [investor], GAS_LIMIT_CONTROL_LIST);

export const issueToInvestor = (bondAddress: Address, investor: Address, amount: bigint) =>
  simulateAndSend(bondAddress, "issue", [investor, amount, "0x"], GAS_LIMIT_ISSUE);
