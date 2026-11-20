// The calldata a court order becomes, and what it is called on the page. Pure on purpose: no
// client, no desk state, no environment — so `tests/orders.test.ts` can check that each order
// encodes the call it claims to, without a network. A wrong selector here would have the board
// freeze a holder the court asked to unfreeze.
import { tokenAbi } from "./abi";
import { KYC_VALID_YEARS, KYC_VC_ID, PARTITION } from "./constants";
import type { OrderAction } from "./types";
import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

/** What a court order does to the token, as calldata the board will forward. */
export function encodeOrder(action: OrderAction, holder: Address | null, balance: bigint): Hex {
  switch (action) {
    case "freeze":
      return encodeFunctionData({
        abi: tokenAbi,
        functionName: "setAddressFrozen",
        args: [requireHolderAddress(action, holder), true],
      });
    case "unfreeze":
      return encodeFunctionData({
        abi: tokenAbi,
        functionName: "setAddressFrozen",
        args: [requireHolderAddress(action, holder), false],
      });
    case "redeem":
      return encodeFunctionData({
        abi: tokenAbi,
        functionName: "controllerRedeemByPartition",
        args: [PARTITION, requireHolderAddress(action, holder), balance, "0x", "0x"],
      });
    case "revokeKyc":
      return encodeFunctionData({
        abi: tokenAbi,
        functionName: "revokeKyc",
        args: [requireHolderAddress(action, holder)],
      });
    case "pause":
      return encodeFunctionData({ abi: tokenAbi, functionName: "pause", args: [] });
    case "unpause":
      return encodeFunctionData({ abi: tokenAbi, functionName: "unpause", args: [] });
  }
}

function requireHolderAddress(action: OrderAction, holder: Address | null): Address {
  if (!holder) throw new Error(`A ${actionLabel(action, null)} order needs a holder.`);
  return holder;
}

/** Granting KYC is a compliance action like any other, so it goes through the board too. */
/** `issuer` is the KYC credential's issuer, and the token refuses one that does not hold ROLE_ISSUER. */
export function encodeGrantKyc(account: Address, issuer: Address): Hex {
  const validFrom = BigInt(Math.floor(Date.now() / 1000));
  const validTo = validFrom + BigInt(KYC_VALID_YEARS * 365 * 24 * 60 * 60);
  return encodeFunctionData({
    abi: tokenAbi,
    functionName: "grantKyc",
    args: [account, KYC_VC_ID, validFrom, validTo, issuer],
  });
}

export function actionLabel(action: OrderAction, holderLabel: string | null): string {
  const target = holderLabel ? ` ${holderLabel}` : "";
  switch (action) {
    case "freeze":
      return `Freeze${target}`;
    case "unfreeze":
      return `Unfreeze${target}`;
    case "redeem":
      return `Redeem${target}'s holding`;
    case "revokeKyc":
      return `Revoke${target}'s KYC`;
    case "pause":
      return "Pause the token";
    case "unpause":
      return "Unpause the token";
  }
}

/** Which orders need a holder to act on. */
export const ORDER_NEEDS_HOLDER: Record<OrderAction, boolean> = {
  freeze: true,
  unfreeze: true,
  redeem: true,
  revokeKyc: true,
  pause: false,
  unpause: false,
};
