import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupCash } from "~~/services/dvp/setup";

/** Step 3: deploy the stablecoin through the Stablecoin Studio factory. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, result: await setupCash() });
  } catch (error) {
    return errorResponse(error);
  }
}
