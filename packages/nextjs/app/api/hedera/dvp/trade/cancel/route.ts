import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { cancelTradeDemo } from "~~/services/hedera/dvp";

/** The Seller (demo account) deletes a trade's schedule before it executes, expires, or is already cancelled. */
export async function POST(req: Request) {
  try {
    const { scheduleId } = (await req.json()) as { scheduleId?: string };
    if (!scheduleId) throw new Error("scheduleId is required");
    const market = await cancelTradeDemo(scheduleId);
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
