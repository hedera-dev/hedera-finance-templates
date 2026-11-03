import { directIssue } from "~~/services/reserve/actions";
import { respond } from "~~/services/reserve/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function POST() {
  return respond(directIssue);
}
