import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/security/apiError";
import { AttackRefused, type AttackType, runAttack } from "~~/services/security/attacks";
import { buildDeskStateView } from "~~/services/security/deskView";

const ATTACKS: AttackType[] = ["send-no-kyc", "send-frozen", "one-officer"];

/** The tour's attacks: each a real transaction the network is expected to refuse. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type as AttackType;
  if (!ATTACKS.includes(type)) return errorResponse(new Error("Unknown attack."));
  try {
    const result = await runAttack(type);
    const state = await buildDeskStateView();
    return NextResponse.json({ ok: true, result, state });
  } catch (error) {
    return errorResponse(error, error instanceof AttackRefused ? 409 : 400);
  }
}
