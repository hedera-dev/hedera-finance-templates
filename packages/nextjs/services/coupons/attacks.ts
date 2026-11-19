// Server-only: the tour's three attempts to make a matured bond pay, or be rewritten, out of turn. Each is a real
// transaction the bond reverts, so each refusal is the network's own record, with a hash anyone can look up.
import { type Hex, decodeErrorResult } from "viem";
import { hederaTestnet } from "viem/chains";
import { getOperatorWalletClient, getServerPublicClient, walletClientFor } from "~~/services/coupons/operator";
import { getDeskState } from "~~/services/coupons/state";
import { BOND_STATUS, couponBondAbi } from "~~/utils/coupons/abi";
import { GREEDY_UNITS, MIRROR_BASE } from "~~/utils/coupons/constants";

export const ATTACK_TYPES = ["pay-twice", "investor-allocates", "issuer-reallocates"] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];

/** The attack cannot run on the desk as it stands; nothing was sent. */
export class AttackRefused extends Error {}

export type AttackResult = { ok: boolean; result: string; transaction: Hex };

// Enough for each call to reach its revert. Set by hand: estimating a call that reverts fails before anything is sent.
const GAS = 150_000n;

/** The network's verdict on a sent transaction: its result code and, for a revert, the bond's error name. */
async function verdict(hash: Hex): Promise<string> {
  const receipt = await getServerPublicClient().waitForTransactionReceipt({ hash });
  if (receipt.status === "success") return "SUCCESS";
  // The receipt comes from the mirror node, so its record of the call is already there, or a moment behind.
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${MIRROR_BASE.testnet}/api/v1/contracts/results/${hash}`).catch(() => null);
    if (res?.ok) {
      const { result, error_message } = (await res.json()) as { result: string; error_message?: Hex };
      try {
        return `${result} · ${decodeErrorResult({ abi: couponBondAbi, data: error_message! }).errorName}`;
      } catch {
        return result;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return "REVERTED";
}

export async function runAttack(type: AttackType): Promise<AttackResult> {
  const desk = getDeskState();
  const bond = desk.tourBonds.main;
  if (!bond) throw new AttackRefused("Issue the tour's bond first.");
  const status =
    BOND_STATUS[
      await getServerPublicClient().readContract({ address: bond, abi: couponBondAbi, functionName: "status" })
    ];
  if (status !== "MATURED" && status !== "STOPPED")
    throw new AttackRefused(`The tour's bond is ${status}. These attacks are for a bond that has finished paying.`);

  const [investorA, investorB] = desk.investors;
  const signer = (id: "A" | "B") => {
    const key = desk.investorKeys[id];
    if (!key)
      throw new AttackRefused(
        "This desk was set up before the tour kept investor keys. Restart the server and set up again.",
      );
    return walletClientFor(key);
  };

  const call =
    type === "pay-twice"
      ? { wallet: signer("A"), functionName: "payCoupon" as const, args: [] as const }
      : type === "investor-allocates"
        ? {
            wallet: signer("B"),
            functionName: "allocate" as const,
            args: [investorB.evmAddress, BigInt(GREEDY_UNITS)] as const,
          }
        : {
            wallet: getOperatorWalletClient(),
            functionName: "allocate" as const,
            args: [investorA.evmAddress, 0n] as const,
          };

  const transaction = await call.wallet.writeContract({
    address: bond,
    abi: couponBondAbi,
    functionName: call.functionName,
    args: call.args,
    gas: GAS,
    account: call.wallet.account,
    chain: hederaTestnet,
  } as Parameters<typeof call.wallet.writeContract>[0]);
  const result = await verdict(transaction);
  return { ok: result === "SUCCESS", result, transaction };
}
