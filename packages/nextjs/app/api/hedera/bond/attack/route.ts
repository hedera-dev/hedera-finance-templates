import { NextResponse } from "next/server";
import { AttackRefused, runAttack } from "~~/services/ats/attacks";
import { statusAfter } from "~~/services/ats/status";
import type { AttackType } from "~~/types/ats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATTACKS: AttackType[] = ["issue-unapproved", "over-cap", "transfer-unapproved"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = (body as { type?: unknown }).type as AttackType;
  if (!ATTACKS.includes(type)) return NextResponse.json({ error: "Unknown attack." }, { status: 400 });

  try {
    const { outcome, success } = await runAttack(type);
    return NextResponse.json(await statusAfter(outcome, success));
  } catch (error) {
    if (error instanceof AttackRefused) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
