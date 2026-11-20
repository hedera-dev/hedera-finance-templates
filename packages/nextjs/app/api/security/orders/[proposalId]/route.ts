import { NextResponse } from "next/server";
import { cancelOrder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";

/** "Cancel": withdraws a pending proposal, signed by Officer 1, who proposed it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  try {
    const result = await cancelOrder(decodeURIComponent(proposalId));
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error);
  }
}
