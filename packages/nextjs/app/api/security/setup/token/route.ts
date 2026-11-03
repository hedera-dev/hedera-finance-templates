import { NextResponse } from "next/server";
import { setupToken } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";

/** Step 2: create the security token with the 2-of-3 threshold key as its KYC/freeze/wipe/pause/admin key. */
export async function POST() {
  try {
    const result = await setupToken();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
