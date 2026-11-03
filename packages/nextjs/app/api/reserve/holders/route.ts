import { addWalletHolder } from "~~/services/reserve/actions";
import { jsonBody, respond } from "~~/services/reserve/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function POST(request: Request) {
  return respond(async () => {
    const body = await jsonBody(request);
    return addWalletHolder(body.address);
  });
}
