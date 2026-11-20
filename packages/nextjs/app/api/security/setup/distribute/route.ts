import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { setupDistribute } from "~~/services/security/setup";

/** Step 4: admit the issuer and both holders to the control list, grant KYC through the board, and distribute. */
export async function POST() {
  try {
    const result = await setupDistribute();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
