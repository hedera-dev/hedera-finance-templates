import { NextResponse } from "next/server";
import { cancelTrade } from "~~/services/dvp/actions";
import { errorResponse } from "~~/services/dvp/apiError";
import { buildDeskView } from "~~/services/dvp/deskView";
import type { PartyId } from "~~/services/dvp/types";

/** Either party, before settlement: releases whichever legs are pledged. */
export async function POST(req: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isInteger(id) || id < 1) return errorResponse(new Error(`${tradeId} is not a trade id.`));

  const body = await req.json().catch(() => ({}));
  const by: PartyId = body?.by === "buyer" || body?.by === "unverified" ? body.by : "seller";
  try {
    const outcome = await cancelTrade(id, by);
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
