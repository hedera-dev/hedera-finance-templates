import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getAccountIdForEvmAddressOnce } from "~~/services/ats/mirror";
import { addActivity, getDesk, setWalletInvestor } from "~~/services/ats/state";
import { buildDeskStatus } from "~~/services/ats/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const address =
    typeof (body as { address?: unknown }).address === "string" ? (body as { address: string }).address : "";
  if (!EVM_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }

  const desk = getDesk();
  if (!desk.bond) {
    return NextResponse.json({ error: "No bond has been issued yet." }, { status: 400 });
  }

  const hederaAccountId = await getAccountIdForEvmAddressOnce(address).catch(() => null);
  setWalletInvestor({ label: "Your wallet", address: address as Address, hederaAccountId });
  addActivity({ action: "Added wallet as investor", result: "SUCCESS" });

  return NextResponse.json(await buildDeskStatus());
}
