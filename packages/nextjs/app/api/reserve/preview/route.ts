import { previewIssue } from "~~/services/reserve/actions";
import { respond } from "~~/services/reserve/http";

export const dynamic = "force-dynamic";

// A simulation: it asks the gate and sends nothing, so it is a GET.
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return respond(() => previewIssue(searchParams.get("amount") ?? "", searchParams.get("holder") ?? undefined));
}
