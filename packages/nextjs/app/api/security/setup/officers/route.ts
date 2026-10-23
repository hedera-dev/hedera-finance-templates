import { NextResponse } from "next/server";
import { setupOfficers } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";

/** Step 1: generate Officer 1 and Officer 2's demo keys, and resolve Officer 3 — the wallet
 * connected right now, or a third demo key if none is. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const walletEvm = typeof body?.walletEvm === "string" ? body.walletEvm : undefined;
    const result = await setupOfficers(walletEvm);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
