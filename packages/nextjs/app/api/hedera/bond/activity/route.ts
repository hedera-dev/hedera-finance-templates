// Logs an activity entry for an action the server didn't perform itself: the wallet investor's
// own transfer, signed in the browser through wagmi. The server only records the outcome here;
// it never sees the wallet's private key.
import { NextResponse } from "next/server";
import { addActivity } from "~~/services/ats/state";
import { buildDeskStatus } from "~~/services/ats/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action, result, txHash } = body as { action?: unknown; result?: unknown; txHash?: unknown };

  if (typeof action !== "string" || !action.trim() || typeof result !== "string" || !result.trim()) {
    return NextResponse.json({ error: "action and result are required." }, { status: 400 });
  }

  addActivity({
    action: action.trim(),
    result: result.trim(),
    txHash: typeof txHash === "string" && txHash ? txHash : undefined,
  });

  return NextResponse.json(await buildDeskStatus());
}
