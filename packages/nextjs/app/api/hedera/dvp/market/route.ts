import { NextResponse } from "next/server";
import { errorMessage, errorResponse } from "~~/services/hedera/apiError";
import { getSnapshot, setupMarket } from "~~/services/hedera/dvp";
import type { SetupEvent, SetupStepId } from "~~/services/hedera/setupSteps";

/** Current market snapshot, or `{ market: null }` before setup has run. */
export async function GET() {
  try {
    const market = await getSnapshot();
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Sets up a brand new market: tokens, demo accounts, KYC grants and opening balances.
 * Streams one JSON object per line (`SetupEvent`) so the page can show each step as it runs;
 * the last line is either `{ type: "done", market }` or `{ type: "error", step, error }`.
 */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SetupEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let current: SetupStepId | null = null;
      try {
        const market = await setupMarket((step, status, detail) => {
          current = step;
          send({ type: "step", step, status, detail });
        });
        send({ type: "done", market });
      } catch (e) {
        send({ type: "error", step: current, error: errorMessage(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
