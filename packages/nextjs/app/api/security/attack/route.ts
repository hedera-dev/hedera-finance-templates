import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { ATTACK_TYPES, AttackRefused, type AttackType, runAttack } from "~~/services/security/attacks";
import { buildDeskStateView } from "~~/services/security/deskView";

/** The tour's attacks: each a real transaction the token or the board is expected to refuse. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type as AttackType;
  if (!ATTACK_TYPES.includes(type)) return errorResponse(new Error("Unknown attack."));
  try {
    const result = await runAttack(type);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error, error instanceof AttackRefused ? 409 : 400);
  }
}
