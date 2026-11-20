import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupPermissions } from "~~/services/dvp/setup";

/** Step 5: control list, KYC, association and the hold-creator role. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, result: await setupPermissions() });
  } catch (error) {
    return errorResponse(error);
  }
}
