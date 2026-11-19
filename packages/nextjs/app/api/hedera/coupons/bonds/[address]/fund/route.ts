import { NextResponse } from "next/server";
import { hederaTestnet } from "viem/chains";
import {
  callBond,
  getOperatorConfigError,
  getOperatorWalletClient,
  getServerPublicClient,
} from "~~/services/coupons/operator";
import { getDeskState, requireKnownBond } from "~~/services/coupons/state";
import { couponBondAbi, erc20Abi } from "~~/utils/coupons/abi";
import { MAX_FUNDING_WHOLE, hbarNeededFor } from "~~/utils/coupons/constants";

/**
 * Sends the bond the stablecoin it still needs plus whatever HBAR it is still missing to pay
 * for its own schedules. The stablecoin amount is the caller's choice (`#fund-amount`); the
 * HBAR amount is always exactly the shortfall, computed here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const stablecoin = getDeskState().stablecoin;
  if (!stablecoin) return NextResponse.json({ error: "The stablecoin has not been created yet" }, { status: 400 });

  const { address } = await params;
  let bondAddress: `0x${string}`;
  try {
    bondAddress = requireKnownBond(address);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown bond" }, { status: 400 });
  }

  let body: { stablecoinWhole?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const stablecoinWhole = body.stablecoinWhole ?? 0;
  if (!Number.isInteger(stablecoinWhole) || stablecoinWhole < 0 || stablecoinWhole > MAX_FUNDING_WHOLE) {
    return NextResponse.json(
      { error: `Stablecoin amount must be a whole number between 0 and ${MAX_FUNDING_WHOLE}` },
      { status: 400 },
    );
  }

  try {
    const publicClient = getServerPublicClient();
    const walletClient = getOperatorWalletClient();

    const [status, couponCount, currentCoupon, holdersCount, nativeBalance, gasPrice] = await Promise.all([
      publicClient.readContract({ address: bondAddress, abi: couponBondAbi, functionName: "status" }),
      publicClient.readContract({ address: bondAddress, abi: couponBondAbi, functionName: "couponCount" }),
      publicClient.readContract({ address: bondAddress, abi: couponBondAbi, functionName: "currentCoupon" }),
      publicClient.readContract({ address: bondAddress, abi: couponBondAbi, functionName: "holdersCount" }),
      publicClient.getBalance({ address: bondAddress }),
      publicClient.getGasPrice(),
    ]);

    // CREATED (0): every coupon is still ahead. RUNNING (1): from the current one onward.
    // MATURED/STOPPED: nothing more is ever paid, so nothing more is needed.
    const remainingCoupons = status === 0 ? couponCount : status === 1 ? couponCount - currentCoupon + 1n : 0n;
    const hbarNeeded = hbarNeededFor(remainingCoupons, Number(holdersCount), gasPrice);
    const hbarShortfall = hbarNeeded > nativeBalance ? hbarNeeded - nativeBalance : 0n;

    const txHashes: `0x${string}`[] = [];

    if (stablecoinWhole > 0) {
      const amount = BigInt(stablecoinWhole) * 10n ** BigInt(stablecoin.decimals);
      txHashes.push(await callBond(stablecoin.evmAddress, erc20Abi, "transfer", [bondAddress, amount]));
    }

    if (hbarShortfall > 0n) {
      const hash = await walletClient.sendTransaction({
        to: bondAddress,
        value: hbarShortfall,
        account: walletClient.account!,
        chain: hederaTestnet,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      txHashes.push(hash);
    }

    return NextResponse.json({ txHashes, hbarSent: hbarShortfall.toString() });
  } catch (e) {
    console.error("[api/hedera/coupons/bonds/[address]/fund]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fund the bond" }, { status: 500 });
  }
}
