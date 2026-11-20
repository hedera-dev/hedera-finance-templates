import { NextResponse } from "next/server";
import { prepareWalletCashHold } from "~~/services/dvp/actions";
import { errorResponse } from "~~/services/dvp/apiError";

/** The transaction the wallet buyer's browser sends: an ordinary `createHold` on the stablecoin. */
export async function POST(_req: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isInteger(id) || id < 1) return errorResponse(new Error(`${tradeId} is not a trade id.`));
  try {
    return NextResponse.json({ ok: true, ...(await prepareWalletCashHold(id)) });
  } catch (error) {
    return errorResponse(error);
  }
}
