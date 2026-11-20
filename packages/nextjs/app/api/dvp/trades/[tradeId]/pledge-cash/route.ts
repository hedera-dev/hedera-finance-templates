import { NextResponse } from "next/server";
import { pledgeCash } from "~~/services/dvp/actions";
import { errorResponse } from "~~/services/dvp/apiError";
import { buildDeskView } from "~~/services/dvp/deskView";

/** The Buyer's pledge: a hold on the cash naming the contract as escrow, then recorded against the trade. */
export async function POST(req: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isInteger(id) || id < 1) return errorResponse(new Error(`${tradeId} is not a trade id.`));

  try {
    const outcome = await pledgeCash(id);
    return NextResponse.json({
      ok: outcome.ok,
      txHash: outcome.txHash ?? null,
      error: outcome.ok ? null : outcome.error,
      errorName: outcome.ok ? null : outcome.errorName,
      state: await buildDeskView(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
