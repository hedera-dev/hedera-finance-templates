import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import { getOperatorConfigError } from "~~/services/coupons/operator";
import { getDeskState } from "~~/services/coupons/state";
import { HEDERA_TESTNET_CHAIN_ID } from "~~/utils/coupons/constants";

/** Desk-wide state: factory address, config health, the stablecoin, demo investors, current bond. */
export async function GET() {
  const configError = getOperatorConfigError();
  const factoryEntry = (deployedContracts as any)[HEDERA_TESTNET_CHAIN_ID]?.CouponBondFactory as
    | { address: string }
    | undefined;
  const state = getDeskState();

  return NextResponse.json({
    configError,
    factory: factoryEntry ? { address: factoryEntry.address } : null,
    stablecoin: state.stablecoin ?? null,
    investors: state.investors,
    currentBond: state.currentBond ?? null,
    tourBonds: state.tourBonds,
  });
}
