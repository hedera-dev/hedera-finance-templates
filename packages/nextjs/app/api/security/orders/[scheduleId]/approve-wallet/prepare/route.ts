import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { prepareWalletApproval } from "~~/services/security/walletApproval";

/** First half of the wallet-officer approval: the transaction the wallet must send to sign the schedule. */
export async function POST(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  try {
    const prepared = prepareWalletApproval(decodeURIComponent(scheduleId));
    return NextResponse.json({ ok: true, ...prepared });
  } catch (error) {
    return errorResponse(error);
  }
}
