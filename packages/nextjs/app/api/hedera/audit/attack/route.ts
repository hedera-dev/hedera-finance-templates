import { NextResponse } from "next/server";
import { ATTACK_TYPES, type AttackType, runAttack } from "~~/app/api/hedera/audit/_lib/attacks";
import { hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs one of the tour's attacks on the topic. A refusal is the expected answer, so it is a 200. */
export async function POST(req: Request) {
  if (!hasOperatorEnv()) return NextResponse.json({ error: "No operator configured." }, { status: 400 });

  const { type } = (await req.json().catch(() => ({}))) as { type?: string };
  if (!ATTACK_TYPES.includes(type as AttackType))
    return NextResponse.json({ error: `type must be one of ${ATTACK_TYPES.join(", ")}` }, { status: 400 });

  try {
    return NextResponse.json(await runAttack(type as AttackType));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
