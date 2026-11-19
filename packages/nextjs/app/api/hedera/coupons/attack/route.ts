import { NextResponse } from "next/server";
import { ATTACK_TYPES, AttackRefused, type AttackType, runAttack } from "~~/services/coupons/attacks";
import { getOperatorConfigError } from "~~/services/coupons/operator";

/** Runs one of the tour's attacks on its matured bond. A revert is the expected answer, so it is a 200. */
export async function POST(req: Request) {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const { type } = (await req.json().catch(() => ({}))) as { type?: string };
  if (!ATTACK_TYPES.includes(type as AttackType))
    return NextResponse.json({ error: `type must be one of ${ATTACK_TYPES.join(", ")}` }, { status: 400 });

  try {
    return NextResponse.json(await runAttack(type as AttackType));
  } catch (e) {
    if (e instanceof AttackRefused) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[api/hedera/coupons/attack]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The attack could not be sent" },
      { status: 500 },
    );
  }
}
