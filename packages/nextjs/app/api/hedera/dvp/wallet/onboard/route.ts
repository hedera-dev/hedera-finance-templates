import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { completeOnboardWallet, prepareOnboardWallet } from "~~/services/hedera/dvp";
import type { WalletRole } from "~~/services/hedera/store";

type Body = {
  stage: "prepare" | "complete";
  accountId: string;
  role: WalletRole;
  transactionId?: string | null;
};

/**
 * Onboards a connected wallet into the market: `prepare` returns the unsigned token
 * association for HashPack to sign and submit; `complete` grants KYC and funds the wallet.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (body.stage === "prepare") {
      const transaction = await prepareOnboardWallet(body.role, body.accountId);
      return NextResponse.json({ transaction });
    }
    if (body.stage === "complete") {
      const market = await completeOnboardWallet(body.role, body.accountId, body.transactionId ?? null);
      return NextResponse.json({ market });
    }
    throw new Error('stage must be "prepare" or "complete"');
  } catch (e) {
    return errorResponse(e);
  }
}
