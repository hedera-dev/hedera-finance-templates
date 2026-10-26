import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { fetchAuditLog } from "~~/services/hedera/audit";
import { getMarket } from "~~/services/hedera/store";

/** The market's audit entries read straight from the mirror node, newest first. */
export async function GET() {
  try {
    const market = getMarket();
    if (!market?.auditTopicId) return NextResponse.json({ entries: [], topicId: null });
    const entries = await fetchAuditLog(market.auditTopicId);
    return NextResponse.json({ entries, topicId: market.auditTopicId });
  } catch (e) {
    return errorResponse(e);
  }
}
