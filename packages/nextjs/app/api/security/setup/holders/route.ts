import { NextResponse } from "next/server";
import { setupHolders } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";

/** Step 3: create Holder A and Holder B's demo accounts and associate them with the token. */
export async function POST() {
  try {
    const result = await setupHolders();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
