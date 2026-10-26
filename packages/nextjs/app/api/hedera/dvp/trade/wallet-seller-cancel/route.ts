import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { completeWalletSellerCancel, prepareWalletSellerCancel } from "~~/services/hedera/dvp";

type Body = { stage: "prepare"; scheduleId: string } | { stage: "complete"; scheduleId: string; transactionId: string };

/**
 * Seller is a connected wallet: `prepare` returns the unsigned schedule-delete transaction for
 * HashPack to sign and submit; `complete` records the cancellation HashPack just submitted.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (body.stage === "prepare") {
      const transaction = await prepareWalletSellerCancel(body.scheduleId);
      return NextResponse.json({ transaction });
    }
    if (body.stage === "complete") {
      const market = await completeWalletSellerCancel(body.scheduleId, body.transactionId);
      return NextResponse.json({ market });
    }
    throw new Error('stage must be "prepare" or "complete"');
  } catch (e) {
    return errorResponse(e);
  }
}
