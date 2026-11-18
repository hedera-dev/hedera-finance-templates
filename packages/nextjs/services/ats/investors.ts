// Server-only: demo investor creation plus the control-list/issue actions the issuer performs
// on them. Every write simulates first (a plain `eth_call`, no signature, no HBAR spent) so a
// revert is caught and decoded before a real transaction is sent. The tour's attacks are the
// exception: their refusal is the point, so they are sent anyway and the refusal is on HashScan.
import { bondAbi } from "./abi";
import { isTransientRelayError, requireOperator, retryTransient, walletFor } from "./clients";
import {
  GAS_LIMIT_ATTACK,
  GAS_LIMIT_CONTROL_LIST,
  GAS_LIMIT_FUND_INVESTOR,
  GAS_LIMIT_ISSUE,
  INVESTOR_FUNDING_HBAR,
} from "./constants";
import { decodeAtsError } from "./errors";
import { getAccountIdForEvmAddress } from "./mirror";
import { type InvestorLabel, type InvestorRecord, rememberInvestorKey } from "./state";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

/**
 * Creates a demo investor: a fresh ECDSA keypair (EVM address derived from the public key),
 * funded from the operator with a small HBAR transfer. Hedera lazily auto-creates the account
 * from that transfer. The key stays in server memory, apart from the record, and signs only the
 * tour's refused transfer.
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

  rememberInvestorKey(account.address, privateKey);
  const hederaAccountId = await getAccountIdForEvmAddress(account.address);
  return { record: { label, address: account.address, hederaAccountId }, txHash };
}

/** `txHash` on a refusal: the refused transaction, when it was sent so the refusal is on the ledger. */
export type WriteOutcome = { ok: true; txHash: Hex } | { ok: false; error: string; errorName: string; txHash?: Hex };

type Signer = {
  account: ReturnType<typeof requireOperator>["account"];
  walletClient: ReturnType<typeof walletFor>["walletClient"];
};

async function simulateAndSend(
  bondAddress: Address,
  functionName: "addToControlList" | "removeFromControlList" | "issue" | "transfer",
  args: readonly unknown[],
  gas: bigint,
  options: { signer?: Signer; sendRefusal?: boolean } = {},
): Promise<WriteOutcome> {
  const operator = requireOperator();
  const signer = options.signer ?? operator;
  let refusal: ReturnType<typeof decodeAtsError> | null = null;
  try {
    const { request } = await retryTransient(() =>
      operator.publicClient.simulateContract({
        address: bondAddress,
        abi: bondAbi,
        functionName,

        args: args as any,
        account: signer.account,
        gas,
      }),
    );
    const txHash = await signer.walletClient.writeContract(request);
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return { ok: false, error: `Transaction ${txHash} failed on-chain`, errorName: "Error" };
    }
    return { ok: true, txHash };
  } catch (error) {
    refusal = decodeAtsError(error);
    // Only a refusal is worth sending: a relay that failed to answer has said nothing yet.
    if (!options.sendRefusal || isTransientRelayError(error)) {
      return { ok: false, error: refusal.message, errorName: refusal.name };
    }
  }

  // Sent with the limit given, since a call that reverts cannot be estimated.
  try {
    const txHash = await signer.walletClient.writeContract({
      address: bondAddress,
      abi: bondAbi,
      functionName,
      args: args as any,
      account: signer.account,
      chain: chains.hederaTestnet,
      gas,
    });
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === "success") return { ok: true, txHash };
    return { ok: false, error: refusal.message, errorName: refusal.name, txHash };
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

/** An issue the bond is expected to refuse, sent anyway with a limit sized for the refusal. */
export const attemptIssue = (bondAddress: Address, investor: Address, amount: bigint) =>
  simulateAndSend(bondAddress, "issue", [investor, amount, "0x"], GAS_LIMIT_ATTACK, { sendRefusal: true });

/** One demo investor sends bonds to another, signed with the sender's own key and sent even if refused. */
export const transferBetweenInvestors = (bondAddress: Address, fromKey: Hex, to: Address, amount: bigint) =>
  simulateAndSend(bondAddress, "transfer", [to, amount], GAS_LIMIT_ATTACK, {
    signer: walletFor(fromKey),
    sendRefusal: true,
  });
