import { NextResponse } from "next/server";
import { getOperator } from "~~/services/reserve/clients";
import { isRunning } from "~~/services/reserve/desk";
import { respond } from "~~/services/reserve/http";
import { runSetup } from "~~/services/reserve/setup";
import { invalidateSnapshot } from "~~/services/reserve/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Starts the run and answers at once; the page follows it through /api/reserve/state.
export function POST() {
  const operator = getOperator();
  if (!operator.ok) return NextResponse.json({ error: operator.error }, { status: 400 });
  if (isRunning()) return NextResponse.json({ error: "Setup is already running." }, { status: 409 });
  return respond(async () => {
    const started = runSetup();
    invalidateSnapshot();
    // runSetup marks the run as running synchronously, before its first await.
    void started;
    return { started: true };
  });
}
