import { previewOpen } from "~~/services/repo/actions";
import { respond } from "~~/services/repo/http";

export const dynamic = "force-dynamic";

// Read-only: asks the repo contract what it would say to a loan of this size, and sends nothing.
export const GET = (request: Request) => respond(() => previewOpen(new URL(request.url).searchParams.get("amount")));
