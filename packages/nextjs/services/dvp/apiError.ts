import { NextResponse } from "next/server";

/** A uniform `{ error }` JSON response for the desk's routes; never leaks more than a message. */
export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}
