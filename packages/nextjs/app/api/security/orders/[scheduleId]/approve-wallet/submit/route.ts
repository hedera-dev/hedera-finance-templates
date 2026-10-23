import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";
import { submitWalletApproval } from "~~/services/security/walletApproval";

/** Second half: attaches the wallet's own signature to the schedule and submits it. */
export async function POST(req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  const body = await req.json().catch(() => ({}));
  const { nodeAccountId, transactionId, signatureHex } = body ?? {};
  if (typeof nodeAccountId !== "string" || typeof transactionId !== "string" || typeof signatureHex !== "string") {
    return errorResponse(new Error("Missing node id, transaction id, or signature."));
  }

  try {
    await submitWalletApproval(decodeURIComponent(scheduleId), nodeAccountId, transactionId, signatureHex);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return errorResponse(error);
  }
}
