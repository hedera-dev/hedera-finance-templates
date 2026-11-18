import { NextResponse } from "next/server";
import { getOperator } from "~~/services/repo/clients";
import { isRunning } from "~~/services/repo/desk";
import { respond } from "~~/services/repo/http";
import { runSetup } from "~~/services/repo/setup";
import { invalidateSnapshot } from "~~/services/repo/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Starts the run and answers at once; the page follows it through /api/desk/state. The same-origin guard that every
// signing route needs lives once, in `middleware.ts`.
export function POST() {
  const operator = getOperator();
  if (!operator.ok) return NextResponse.json({ error: operator.error }, { status: 400 });
  if (isRunning()) return NextResponse.json({ error: "Setup is already running." }, { status: 409 });
  return respond(async () => {
    // runSetup marks the run as running synchronously, before its first await.
    void runSetup();
    invalidateSnapshot();
    return { started: true };
  });
}
