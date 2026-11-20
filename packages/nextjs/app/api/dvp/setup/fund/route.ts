import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { setupFund } from "~~/services/dvp/setup";

/** Step 6: the starting position — security to the Seller, cash to both Buyers. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, result: await setupFund() });
  } catch (error) {
    return errorResponse(error);
  }
}
