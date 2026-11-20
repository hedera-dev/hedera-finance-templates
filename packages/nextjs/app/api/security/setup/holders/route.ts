import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { setupHolders } from "~~/services/security/setup";

/** Step 3: create Holder A and Holder B as funded demo accounts. */
export async function POST() {
  try {
    const result = await setupHolders();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
