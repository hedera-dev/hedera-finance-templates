import { NextResponse } from "next/server";
import { proposeTrade } from "~~/services/dvp/actions";
import { errorResponse } from "~~/services/dvp/apiError";
import { buildDeskView } from "~~/services/dvp/deskView";
import type { PartyId } from "~~/services/dvp/types";

/** "Propose as Seller": records the terms on the settlement contract. Nothing is pledged yet. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const buyer: PartyId = body?.buyer === "unverified" ? "unverified" : "buyer";
  const delayMinutes =
    body?.settlementMode === "delayed" && Number.isFinite(Number(body?.delayMinutes))
      ? Math.floor(Number(body.delayMinutes))
      : null;

  try {
    const { tradeId, outcome } = await proposeTrade({
      buyer,
      quantity: BigInt(body?.quantity ?? 0),
      price: BigInt(body?.price ?? 0),
      delayMinutes,
    });
    return NextResponse.json({
      ok: outcome.ok,
      tradeId,
      txHash: outcome.txHash ?? null,
      error: outcome.ok ? null : outcome.error,
      errorName: outcome.ok ? null : outcome.errorName,
      state: await buildDeskView(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
