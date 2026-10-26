import { NextResponse } from "next/server";
import { hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { getDesk } from "~~/app/api/hedera/audit/_lib/state";
import type { DeskState } from "~~/services/hcsAudit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = getDesk();
  const body: DeskState = {
    configured: hasOperatorEnv(),
    network: "testnet",
    topicId: desk.topicId,
    tokenId: desk.tokenId,
    holderAccountId: desk.holderAccountId,
    publishers: desk.publishers,
  };
  return NextResponse.json(body);
}
