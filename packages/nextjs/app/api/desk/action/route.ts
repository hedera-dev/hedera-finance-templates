import { runAction } from "~~/services/repo/actions";
import { jsonBody, respond } from "~~/services/repo/http";
import type { ActionRequest } from "~~/types/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Every desk action that signs. A POST, so the same-origin guard in `middleware.ts` covers it.
export const POST = (request: Request) =>
  respond(async () => runAction((await jsonBody(request)) as unknown as ActionRequest));
