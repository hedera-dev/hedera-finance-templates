import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { ATTACK_TYPES, AttackRefused, type AttackType, runAttack } from "~~/services/hedera/attacks";

/** One of the tour's attacks, sent to the network. A 409 means it could not run on the market as it stands. */
export async function POST(req: Request) {
  const { type } = ((await req.json().catch(() => null)) ?? {}) as { type?: AttackType };
  if (!type || !ATTACK_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of ${ATTACK_TYPES.join(", ")}` }, { status: 400 });
  }
  try {
    return NextResponse.json(await runAttack(type));
  } catch (e) {
    if (e instanceof AttackRefused) return NextResponse.json({ error: e.message }, { status: 409 });
    return errorResponse(e);
  }
}
