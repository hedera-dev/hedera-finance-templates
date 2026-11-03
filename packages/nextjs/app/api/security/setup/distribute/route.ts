import { NextResponse } from "next/server";
import { setupDistribute } from "~~/services/security/actions";
import { errorResponse } from "~~/services/security/apiError";

/** Step 4: grant KYC to Holder A (signed by Officer 1 and Officer 2) and transfer it 100 units. */
export async function POST() {
  try {
    const result = await setupDistribute();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
