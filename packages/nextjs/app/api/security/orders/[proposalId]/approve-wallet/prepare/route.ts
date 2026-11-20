import { NextResponse } from "next/server";
import { prepareWalletApproval } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";

/** The transaction the wallet officer's browser sends: an ordinary `approve(id)` call to the board. */
export async function POST(_req: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  try {
    const prepared = prepareWalletApproval(decodeURIComponent(proposalId));
    return NextResponse.json({ ok: true, ...prepared });
  } catch (error) {
    return errorResponse(error);
  }
}
