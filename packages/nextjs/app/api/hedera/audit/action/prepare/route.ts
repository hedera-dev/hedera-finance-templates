import { NextResponse } from "next/server";
import { parseActionRequest, performAction } from "~~/app/api/hedera/audit/_lib/actions";
import { getOperator, getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { flushEntries, prepareEntryForWallet, queueEntry } from "~~/app/api/hedera/audit/_lib/publish";
import { getDesk, requireSetUp } from "~~/app/api/hedera/audit/_lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HashPack mode, step 1: the Issuer performs the real token action, queues its
 * audit entry, and hands back an unsigned HCS submission for the wallet to sign
 * and pay for.
 *
 * The queue is drained first, because the `prev` frozen into the bytes the wallet
 * signs has to be the one it will really chain at. If something is still waiting —
 * an earlier entry held for a signature — this refuses rather than preparing an
 * entry whose `prev` would be wrong by the time it lands.
 */
export async function POST(req: Request) {
  if (!hasOperatorEnv()) {
    return NextResponse.json({ error: "No operator configured." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    amount?: number;
    account?: string;
    walletAccountId?: string;
  } | null;
  const walletAccountId = body?.walletAccountId;
  const desk = getDesk();

  try {
    const request = parseActionRequest(body);
    if (!walletAccountId) throw new Error("Connect HashPack first.");
    requireSetUp(desk);

    const client = getOperatorClient();
    await flushEntries(client, desk).catch(() => undefined);
    if (desk.entries.length > 0) {
      return NextResponse.json({ error: "An entry is already awaiting a signature." }, { status: 409 });
    }

    const { accountId: operatorId } = getOperator();
    const fields = await performAction(client, desk, operatorId.toString(), request);
    // Queued before it is offered to the wallet: if the wallet never signs it, the
    // Issuer publishes this same entry instead of it being lost.
    const queued = queueEntry(desk, fields);
    const prepared = prepareEntryForWallet(client, desk, queued, walletAccountId);

    return NextResponse.json(prepared);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
