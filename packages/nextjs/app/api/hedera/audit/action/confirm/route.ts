import { NextResponse } from "next/server";
import { getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { confirmWalletEntry, flushEntries, releaseWalletEntry } from "~~/app/api/hedera/audit/_lib/publish";
import { getDesk } from "~~/app/api/hedera/audit/_lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publishes the entry the wallet declined to, as the Issuer, and reports what happened. */
async function fallBackToIssuer(): Promise<void> {
  const desk = getDesk();
  await releaseWalletEntry(desk);
  if (!hasOperatorEnv() || desk.entries.length === 0) return;
  try {
    await flushEntries(getOperatorClient(), desk);
  } catch (error) {
    // Still queued, and the reconciler keeps trying.
    console.error("[audit] issuer fallback deferred", error);
  }
}

/**
 * HashPack mode, step 2: the browser reports what HashPack did. The server trusts
 * none of it beyond the transaction id — it looks that exact id up on the mirror
 * node itself, confirms the message on the topic is the one it prepared, and only
 * then advances the chain.
 *
 * Nothing here discards an entry. The action it records has already happened, so a
 * cancelled signature, a failed submission or an unreachable mirror node all end
 * the same way: the Issuer publishes the entry instead.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { transactionId?: string; cancelled?: boolean } | null;
  const desk = getDesk();

  if (body?.cancelled) {
    await fallBackToIssuer();
    return NextResponse.json({ ok: true, cancelled: true, publishedByIssuer: true });
  }

  if (!body?.transactionId) {
    return NextResponse.json({ error: "Missing transactionId." }, { status: 400 });
  }

  try {
    const { entry } = await confirmWalletEntry(desk, body.transactionId);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A reservation the confirm gave up on leaves the entry queued; publish it as the
    // Issuer now so the trail is complete even though this submission was not.
    if (desk.entries[0]?.wallet === null) await fallBackToIssuer();
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
