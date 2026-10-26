import { NextResponse } from "next/server";
import { buildDeskStatus } from "~~/services/ats/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await buildDeskStatus());
}
