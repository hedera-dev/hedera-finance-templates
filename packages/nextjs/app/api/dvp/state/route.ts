import { NextResponse } from "next/server";
import { buildDeskView } from "~~/services/dvp/deskView";

/** The single read the page polls: everything the two tokens and the contract say, read fresh. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletEvm = searchParams.get("walletEvm") ?? undefined;
  return NextResponse.json(await buildDeskView(walletEvm));
}
