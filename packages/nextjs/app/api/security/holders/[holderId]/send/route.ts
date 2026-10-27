import { NextResponse } from "next/server";
import { sendToHolder } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";
import { getHolder } from "~~/services/security/deskState";
import { buildDeskStateView } from "~~/services/security/deskView";

/** Sends 10 units to a holder from the issuer. The network, not this route, decides whether it lands. */
export async function POST(_req: Request, { params }: { params: Promise<{ holderId: string }> }) {
  const { holderId: rawHolderId } = await params;
  const holderId = rawHolderId === "A" || rawHolderId === "B" ? rawHolderId : null;
  if (!holderId || !getHolder(holderId)) {
    return errorResponse(new Error("This desk did not create that holder."), 404);
  }

  try {
    const result = await sendToHolder(holderId);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error);
  }
}
