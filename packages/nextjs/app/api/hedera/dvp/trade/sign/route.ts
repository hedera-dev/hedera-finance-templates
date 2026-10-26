import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { signTradeDemo } from "~~/services/hedera/dvp";

/** Buyer (demo account) signs the pending schedule: settles immediately for an on-signature trade, else waits. */
export async function POST(req: Request) {
  try {
    const { scheduleId } = (await req.json()) as { scheduleId?: string };
    if (!scheduleId) throw new Error("scheduleId is required");
    const market = await signTradeDemo(scheduleId);
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
