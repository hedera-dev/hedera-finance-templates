import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupParties } from "~~/services/dvp/setup";

/** Step 1: create and fund the three demo parties. A connected wallet takes the Buyer's place. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const walletEvm = typeof body?.walletEvm === "string" ? body.walletEvm : undefined;
  try {
    return NextResponse.json({ ok: true, result: await setupParties(walletEvm) });
  } catch (error) {
    return errorResponse(error);
  }
}
