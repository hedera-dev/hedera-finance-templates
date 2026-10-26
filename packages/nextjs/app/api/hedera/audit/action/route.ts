import { NextResponse } from "next/server";
import { parseActionRequest, performAction } from "~~/app/api/hedera/audit/_lib/actions";
import { getOperator, getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { publishEntry } from "~~/app/api/hedera/audit/_lib/publish";
import { getDesk, requireSetUp } from "~~/app/api/hedera/audit/_lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issuer mode: the operator performs the token action and publishes its entry.
 *
 * The entry is queued before anything is reported back, so a publish that fails
 * here is retried rather than dropped — an action on chain with no entry is the
 * one outcome this trail must never have.
 */
export async function POST(req: Request) {
  if (!hasOperatorEnv()) {
    return NextResponse.json({ error: "No operator configured." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { action?: string; amount?: number; account?: string } | null;
  const desk = getDesk();
  try {
    const request = parseActionRequest(body);
    requireSetUp(desk);

    const client = getOperatorClient();
    const { accountId: operatorId } = getOperator();
    const fields = await performAction(client, desk, operatorId.toString(), request);
    const entry = await publishEntry(client, desk, fields);

    return NextResponse.json({ entry, pending: desk.entries.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
