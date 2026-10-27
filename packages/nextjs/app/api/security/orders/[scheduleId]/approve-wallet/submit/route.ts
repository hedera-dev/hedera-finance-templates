import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";
import { submitWalletApproval } from "~~/services/security/walletApproval";

/** Second half: the wallet's signature is on the schedule, so run the real admin transaction. */
export async function POST(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  try {
    await submitWalletApproval(decodeURIComponent(scheduleId));
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return errorResponse(error);
  }
}
