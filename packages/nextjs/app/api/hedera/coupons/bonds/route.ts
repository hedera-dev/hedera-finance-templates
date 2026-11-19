import { NextResponse } from "next/server";
import { decodeEventLog } from "viem";
import { hederaTestnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import { getOperatorConfigError, getOperatorWalletClient, getServerPublicClient } from "~~/services/coupons/operator";
import { getDeskState, setCurrentBond } from "~~/services/coupons/state";
import { HEDERA_TESTNET_CHAIN_ID } from "~~/utils/coupons/constants";

type IssueBondBody = {
  name: string;
  faceValue: number;
  couponRatePercent: number;
  periodMinutes: number;
  couponCount: number;
  /** Set by the tour, so its steps can follow this bond. */
  tourRole?: "main" | "miss";
};

/** Issues a bond through the factory: `createBond(...)`, owned by the issuer (the operator). */
export async function POST(req: Request) {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const factoryEntry = (deployedContracts as any)[HEDERA_TESTNET_CHAIN_ID]?.CouponBondFactory as
    | { address: `0x${string}`; abi: any }
    | undefined;
  if (!factoryEntry) {
    return NextResponse.json(
      { error: "CouponBondFactory is not deployed. Run `yarn coupons:deploy`." },
      { status: 400 },
    );
  }

  const stablecoin = getDeskState().stablecoin;
  if (!stablecoin) {
    return NextResponse.json(
      { error: "Set up the desk (create the stablecoin) before issuing a bond." },
      { status: 400 },
    );
  }

  let body: IssueBondBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, faceValue, couponRatePercent, periodMinutes, couponCount, tourRole } = body;
  if (tourRole !== undefined && tourRole !== "main" && tourRole !== "miss") {
    return NextResponse.json({ error: "tourRole must be main or miss" }, { status: 400 });
  }
  if (!name?.trim()) return NextResponse.json({ error: "Bond name is required" }, { status: 400 });
  if (!Number.isInteger(faceValue) || faceValue <= 0) {
    return NextResponse.json({ error: "Face value must be a positive whole number" }, { status: 400 });
  }
  if (!(couponRatePercent >= 0.01 && couponRatePercent <= 20)) {
    return NextResponse.json({ error: "Coupon rate must be between 0.01 and 20 percent" }, { status: 400 });
  }
  if (!Number.isInteger(periodMinutes) || periodMinutes < 1 || periodMinutes > 60) {
    return NextResponse.json({ error: "Period must be a whole number of minutes between 1 and 60" }, { status: 400 });
  }
  if (!Number.isInteger(couponCount) || couponCount < 1 || couponCount > 12) {
    return NextResponse.json({ error: "Coupon count must be a whole number between 1 and 12" }, { status: 400 });
  }

  const couponRateBps = Math.round(couponRatePercent * 100);

  try {
    const walletClient = getOperatorWalletClient();
    const publicClient = getServerPublicClient();

    const hash = await walletClient.writeContract({
      address: factoryEntry.address,
      abi: factoryEntry.abi,
      functionName: "createBond",
      args: [
        name.trim(),
        stablecoin.evmAddress,
        BigInt(faceValue),
        BigInt(couponRateBps),
        BigInt(periodMinutes * 60),
        BigInt(couponCount),
      ],
      value: 0n,
      account: walletClient.account!,
      chain: hederaTestnet,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    let bondAddress: `0x${string}` | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: factoryEntry.abi, data: log.data, topics: log.topics }) as {
          eventName: string;
          args: { bond: `0x${string}` };
        };
        if (decoded.eventName === "BondCreated") {
          bondAddress = decoded.args.bond;
          break;
        }
      } catch {
        // Not a BondCreated log; skip.
      }
    }
    if (!bondAddress) throw new Error("Bond creation transaction did not emit BondCreated");

    setCurrentBond(bondAddress, tourRole);
    return NextResponse.json({ address: bondAddress, txHash: hash });
  } catch (e) {
    console.error("[api/hedera/coupons/bonds]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to issue bond" }, { status: 500 });
  }
}
