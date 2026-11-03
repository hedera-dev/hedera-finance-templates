import { NextResponse } from "next/server";
import { approveOrder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";

/** "Approve as Officer 2": the second signature. The network executes the order the moment it has it. */
export async function POST(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  try {
    await approveOrder(decodeURIComponent(scheduleId), "2");
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return errorResponse(error);
  }
}
