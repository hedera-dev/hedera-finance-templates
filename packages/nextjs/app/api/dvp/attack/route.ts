import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/dvp/apiError";
import { runAttack } from "~~/services/dvp/attacks";
import type { AttackType } from "~~/services/dvp/attacks";
import { buildDeskView } from "~~/services/dvp/deskView";

const ATTACKS: AttackType[] = ["settle-one-leg", "settle-no-kyc", "seller-reclaims", "settle-twice"];

/** One "Break it" attack, sent on-chain even though it will be refused, so the refusal is public. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type;
  if (typeof type !== "string" || !ATTACKS.includes(type as AttackType)) {
    return errorResponse(new Error("Unknown attack."));
  }
  try {
    const result = await runAttack(type as AttackType);
    return NextResponse.json({ ok: true, result, state: await buildDeskView() });
  } catch (error) {
    return errorResponse(error);
  }
}
