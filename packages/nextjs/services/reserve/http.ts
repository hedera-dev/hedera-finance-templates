// Server-only: shared plumbing for the reserve routes. The same-origin guard for every route that signs lives once,
// in `middleware.ts`; a route that signs must be a POST so that guard covers it.
import { NextResponse } from "next/server";
import { ActionRefused } from "./actions";
import { shortText } from "./errors";

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function respond(run: () => Promise<unknown>) {
  try {
    return NextResponse.json(await run(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ActionRefused) return NextResponse.json({ error: error.message }, { status: error.status });
    // Never log the error object itself: a viem error carries the request body, which is a signed transaction.
    const message = shortText(error);
    console.error("[reserve]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
