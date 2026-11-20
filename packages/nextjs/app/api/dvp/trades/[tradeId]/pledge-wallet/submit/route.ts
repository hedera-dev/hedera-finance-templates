import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { submitWalletCashPledge } from "~~/services/dvp/actions";
import { errorResponse } from "~~/services/dvp/apiError";
import { buildDeskView } from "~~/services/dvp/deskView";

/** The wallet has created its hold; this reads the hold out of its receipt and records the pledge. */
export async function POST(req: Request, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isInteger(id) || id < 1) return errorResponse(new Error(`${tradeId} is not a trade id.`));

  const body = await req.json().catch(() => ({}));
  const txHash = typeof body?.txHash === "string" ? (body.txHash as Hex) : null;
  if (!txHash) return errorResponse(new Error("The hold's transaction hash is missing."));
  try {
    const outcome = await submitWalletCashPledge(id, txHash);
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
