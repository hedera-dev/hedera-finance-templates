import { NextResponse } from "next/server";
import { proposeOrder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { buildDeskStateView } from "~~/services/security/deskView";
import type { HolderId, OrderAction } from "~~/services/security/types";

const ACTIONS: OrderAction[] = ["freeze", "unfreeze", "wipe", "pause", "unpause"];
const HOLDER_ACTIONS: OrderAction[] = ["freeze", "unfreeze", "wipe"];

/** "Propose as Officer 1": wraps the order in a scheduled transaction, signed by Officer 1 alone. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const rawHolderId = body?.holderId;
  const reference =
    typeof body?.reference === "string" && body.reference.trim() ? body.reference.trim() : "CASE-2026-114";

  if (typeof action !== "string" || !ACTIONS.includes(action as OrderAction)) {
    return errorResponse(new Error("Unknown order action."));
  }
  const holderId: HolderId | null = rawHolderId === "A" || rawHolderId === "B" ? rawHolderId : null;
  if (HOLDER_ACTIONS.includes(action as OrderAction) && !holderId) {
    return errorResponse(new Error("This order needs a holder."));
  }

  try {
    await proposeOrder(action as OrderAction, holderId, reference);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return errorResponse(error);
  }
}
