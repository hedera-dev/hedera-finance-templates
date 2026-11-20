import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupSettlement } from "~~/services/dvp/setup";

/** Step 4: deploy this repo's settlement contract against the two tokens. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, result: await setupSettlement() });
  } catch (error) {
    return errorResponse(error);
  }
}
