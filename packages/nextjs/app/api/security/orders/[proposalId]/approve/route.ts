import { NextResponse } from "next/server";
import { approveOrder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";

/** "Approve as Officer 2": the second approval, which is the transaction that makes the token's call. */
export async function POST(_req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  try {
    const result = await approveOrder(decodeURIComponent(proposalId), "2");
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error);
  }
}
