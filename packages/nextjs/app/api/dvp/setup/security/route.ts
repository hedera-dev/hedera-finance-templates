import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupSecurity } from "~~/services/dvp/setup";

/** Step 2: deploy the security through the ATS factory. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, result: await setupSecurity() });
  } catch (error) {
    return errorResponse(error);
  }
}
