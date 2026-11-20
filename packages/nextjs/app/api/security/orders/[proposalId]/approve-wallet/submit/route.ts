import { NextResponse } from "next/server";
import { recordWalletApproval } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";

/** The wallet has signed and the board has acted; this records what the chain already did. */
export async function POST(req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  const body = await req.json().catch(() => ({}));
  const txHash = typeof body?.txHash === "string" ? body.txHash : null;
  if (!txHash) return errorResponse(new Error("The approval's transaction hash is missing."));
  try {
    const result = await recordWalletApproval(decodeURIComponent(proposalId), txHash);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error);
  }
}
