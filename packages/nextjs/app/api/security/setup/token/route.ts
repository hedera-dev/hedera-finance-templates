import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { setupToken } from "~~/services/security/setup";

/** Step 2: create the security token through the ATS factory, with the board as the only holder of its compliance roles. */
export async function POST() {
  try {
    const result = await setupToken();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
