import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TopicCreateTransaction,
} from "@hiero-ledger/sdk";
import { getOperator, getOperatorClient, hasOperatorEnv } from "~~/app/api/hedera/audit/_lib/operator";
import { publishEntry } from "~~/app/api/hedera/audit/_lib/publish";
import { resetDesk } from "~~/app/api/hedera/audit/_lib/state";
import type { SetupEvent, SetupStepId } from "~~/services/hcsAudit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thrown after a step-failed event has already been sent, so the outer handler doesn't double-report it. */
class StepFailure extends Error {}

export async function POST() {
  if (!hasOperatorEnv()) {
    return new Response(JSON.stringify({ type: "error", message: "No operator configured." }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SetupEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const fail = (step: SetupStepId, error: unknown): never => {
        send({ type: "step", step, status: "failed", error: error instanceof Error ? error.message : String(error) });
        throw new StepFailure();
      };

      try {
        const client = getOperatorClient();
        const { accountId: operatorId, key: operatorKey } = getOperator();
        const desk = resetDesk();
        desk.publishers = [{ accountId: operatorId.toString(), role: "issuer" }];

        // 1. Audit topic: admin key and submit key both the issuer's.
        send({ type: "step", step: "topic", status: "active" });
        let topicId: string;
        try {
          const response = await new TopicCreateTransaction()
            .setAdminKey(operatorKey.publicKey)
            .setSubmitKey(operatorKey.publicKey)
            .setTopicMemo("HCS audit trail")
            .execute(client);
          const receipt = await response.getReceipt(client);
          if (!receipt.topicId) throw new Error("Topic creation did not return a topic id.");
          topicId = receipt.topicId.toString();
        } catch (error) {
          return fail("topic", error);
        }
        desk.topicId = topicId;
        send({ type: "step", step: "topic", status: "done", id: topicId });

        // 2. Security token: 0 decimals, supply 1000 held by the issuer, KYC + freeze keys the issuer's.
        send({ type: "step", step: "token", status: "active" });
        let tokenId: string;
        let tokenCreateTx: string;
        let tokenCreateResult: string;
        try {
          const response = await new TokenCreateTransaction()
            .setTokenName("Compliance Security Token")
            .setTokenSymbol("CST")
            .setDecimals(0)
            .setInitialSupply(1000)
            .setTreasuryAccountId(operatorId)
            .setKycKey(operatorKey.publicKey)
            .setFreezeKey(operatorKey.publicKey)
            .execute(client);
          const receipt = await response.getReceipt(client);
          if (!receipt.tokenId) throw new Error("Token creation did not return a token id.");
          tokenId = receipt.tokenId.toString();
          tokenCreateTx = response.transactionId.toString();
          tokenCreateResult = receipt.status.toString();
        } catch (error) {
          return fail("token", error);
        }
        desk.tokenId = tokenId;
        send({ type: "step", step: "token", status: "done", id: tokenId });

        // 3. Holder account: funded with at most 1 HBAR, no KYC yet.
        send({ type: "step", step: "holder", status: "active" });
        let holderAccountId: string;
        let holderKey: PrivateKey;
        try {
          holderKey = PrivateKey.generateECDSA();
          const response = await new AccountCreateTransaction()
            .setKeyWithoutAlias(holderKey.publicKey)
            .setInitialBalance(new Hbar(1))
            .setAccountMemo("HCS audit demo holder")
            .execute(client);
          const receipt = await response.getReceipt(client);
          if (!receipt.accountId) throw new Error("Account creation did not return an account id.");
          holderAccountId = receipt.accountId.toString();
        } catch (error) {
          return fail("holder", error);
        }
        desk.holderAccountId = holderAccountId;
        desk.holderKey = holderKey;
        send({ type: "step", step: "holder", status: "done", id: holderAccountId });

        // 4. Associate the holder with the token.
        send({ type: "step", step: "associate", status: "active" });
        try {
          const transaction = await new TokenAssociateTransaction()
            .setAccountId(holderAccountId)
            .setTokenIds([tokenId])
            .freezeWith(client)
            .sign(holderKey);
          const response = await transaction.execute(client);
          await response.getReceipt(client);
        } catch (error) {
          return fail("associate", error);
        }
        send({ type: "step", step: "associate", status: "done" });

        // The first entry, referencing the token-creation transaction. Queued like every
        // other entry, so a failure here is retried instead of leaving a trail with no
        // genesis entry and a token that exists.
        await publishEntry(client, desk, {
          event: "issue",
          token: tokenId,
          account: null,
          amount: null,
          tx: tokenCreateTx,
          result: tokenCreateResult,
        });

        send({ type: "complete", topicId, tokenId, holderAccountId });
      } catch (error) {
        if (!(error instanceof StepFailure)) {
          send({ type: "error", message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
