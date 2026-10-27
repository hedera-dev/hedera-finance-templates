import { NextResponse } from "next/server";
import { deleteOrder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";

/** "Delete": withdraws a pending order, signed by Officer 1 (who proposed it, and holds the schedule's admin key). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  try {
    await deleteOrder(decodeURIComponent(scheduleId));
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return errorResponse(error);
  }
}
