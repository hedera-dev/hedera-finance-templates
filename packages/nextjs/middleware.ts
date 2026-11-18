import { type NextRequest, NextResponse } from "next/server";

// Every mutating API route signs with the operator key. A page open in any other tab can
// POST to this server: the same-origin policy hides the response, not the side effect. So
// refuse anything that is not this app talking to itself.
//
// Reads are left open — none of them sign, and leaving them reachable keeps `curl` useful
// against a running desk.
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(request: NextRequest) {
  if (READ_ONLY.has(request.method)) return NextResponse.next();

  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin") return NextResponse.next();

  // A browser too old to send Sec-Fetch-Site still sends Origin on a cross-origin write.
  if (site === null) {
    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    if (host !== null && origin === `${request.nextUrl.protocol}//${host}`) return NextResponse.next();
  }

  return NextResponse.json({ error: "Refused: this route accepts same-origin requests only." }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
