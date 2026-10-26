import { NextResponse } from "next/server";
import type { Address } from "viem";
import { revokeInvestor } from "~~/services/ats/investors";
import { addActivity, findInvestor, getDesk } from "~~/services/ats/state";
import { buildDeskStatus } from "~~/services/ats/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!EVM_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid investor address." }, { status: 400 });
  }

  const desk = getDesk();
  if (!desk.bond) {
    return NextResponse.json({ error: "No bond has been issued yet." }, { status: 400 });
  }
  const investor = findInvestor(address);
  if (!investor) {
    return NextResponse.json({ error: "Unknown investor." }, { status: 404 });
  }

  const outcome = await revokeInvestor(desk.bond.address, address as Address);
  addActivity({
    action: `Revoked ${investor.label}`,
    result: outcome.ok ? "SUCCESS" : outcome.errorName,
    txHash: outcome.ok ? outcome.txHash : undefined,
  });

  // 200 with the refusal attached: the action was carried out, and its answer was no. The
  // page shows `actionError`; without it a refusal was visible only in the activity log.
  const status = await buildDeskStatus();
  return NextResponse.json(outcome.ok ? status : { ...status, actionError: outcome.error });
}
