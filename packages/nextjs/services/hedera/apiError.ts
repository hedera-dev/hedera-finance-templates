import { NextResponse } from "next/server";

/** The message to show for a thrown error: never a stack trace or key material. Logs the full error server-side. */
export function errorMessage(e: unknown): string {
  console.error("[api/hedera/dvp]", e);
  return e instanceof Error ? e.message : "Unexpected error";
}

/** Turns a thrown error into a JSON 400 response. */
export function errorResponse(e: unknown) {
  return NextResponse.json({ error: errorMessage(e) }, { status: 400 });
}
