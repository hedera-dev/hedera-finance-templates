import { respond } from "~~/services/repo/http";
import { getSnapshot } from "~~/services/repo/snapshot";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => respond(() => getSnapshot(new URL(request.url).searchParams.get("wallet")));
