import { respond } from "~~/services/reserve/http";
import { getSnapshot } from "~~/services/reserve/snapshot";

export const dynamic = "force-dynamic";

export const GET = () => respond(getSnapshot);
