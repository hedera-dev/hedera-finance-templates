import { NextResponse } from "next/server";
import { buildDeskStateView } from "~~/services/security/deskView";

/** The single read the page polls: everything the network says, resolved fresh every time. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletEvm = searchParams.get("walletEvm") ?? undefined;
  const state = await buildDeskStateView(walletEvm);
  return NextResponse.json(state);
}
