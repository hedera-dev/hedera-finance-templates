import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { prepareWalletApproval } from "~~/services/security/walletApproval";

/** First half of the wallet-officer approval: hands back the exact bytes Officer 3's wallet must sign. */
export async function POST(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  try {
    const prepared = await prepareWalletApproval(decodeURIComponent(scheduleId));
    return NextResponse.json({ ok: true, ...prepared });
  } catch (error) {
    return errorResponse(error);
  }
}
