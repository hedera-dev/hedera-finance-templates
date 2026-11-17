"use client";

import { useEffect, useRef } from "react";
import type { NextPage } from "next";
import { ActionsPanel } from "~~/app/_components/audit/ActionsPanel";
import { DecisionPanel } from "~~/app/_components/audit/DecisionPanel";
import { DeskIds } from "~~/app/_components/audit/DeskIds";
import { ForgeCard } from "~~/app/_components/audit/ForgeCard";
import { SetupCard } from "~~/app/_components/audit/SetupCard";
import { SigningModePanel } from "~~/app/_components/audit/SigningModePanel";
import { TrailTable } from "~~/app/_components/audit/TrailTable";
import { useAuditDesk } from "~~/hooks/hcsAudit/useAuditDesk";
import { useHashPackWallet } from "~~/hooks/hcsAudit/useHashPackWallet";
import type { RecordPayload } from "~~/services/hcsAudit/types";

const Home: NextPage = () => {
  const desk = useAuditDesk();
  const wallet = useHashPackWallet();
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (desk.justCompleted) {
      trailRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [desk.justCompleted]);

  const isHashPack = desk.signingMode === "hashpack";
  const isAuthorizedPublisher = Boolean(
    wallet.accountId && desk.desk?.publishers.some(p => p.accountId === wallet.accountId),
  );

  const actionsDisabled = !desk.desk?.topicId || (isHashPack && (!wallet.accountId || !isAuthorizedPublisher));

  const handleRecord = (payload: RecordPayload) => {
    if (isHashPack) {
      if (!wallet.accountId) return;
      desk.performHashPackRecord(payload, wallet.accountId, wallet.signAndSubmit);
    } else {
      desk.performIssuerRecord(payload);
    }
  };

  return (
    <div className="flex items-center flex-col grow">
      <div className="w-full max-w-5xl mx-auto px-5 py-10 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Issuer compliance desk</h1>
          <p className="text-sm text-base-content/70 m-0">
            Issuance, KYC, transfers and freezes on this security token are each logged as an entry on an HCS topic with
            a submit key, so only authorised publishers can write to it and every entry chains to the one before it —
            nothing can be rewritten, reordered, or skipped. The regulator&apos;s feed verifies this from the public
            mirror node alone, no server or key required.
          </p>
          <p className="text-sm text-base-content/70 m-0 mt-2">
            The entries carry what the ledger cannot: why an action was taken, the authority behind it, and the hash of
            the document that supports it. Decisions that never reach the network at all — a KYC review, a sanctions
            screening, a board approval — are recorded the same way, and are the entries the mirror node has nothing to
            compare against.
          </p>
        </div>

        <SetupCard
          configured={Boolean(desk.desk?.configured)}
          deskLoaded={desk.deskLoaded}
          desk={desk.desk}
          steps={desk.steps}
          setupRunning={desk.setupRunning}
          setupError={desk.setupError}
          onRunSetup={desk.runSetup}
        />

        {desk.desk?.topicId && desk.desk.tokenId && desk.desk.holderAccountId && (
          <>
            <DeskIds
              topicId={desk.desk.topicId}
              tokenId={desk.desk.tokenId}
              holderAccountId={desk.desk.holderAccountId}
            />

            <SigningModePanel
              signingMode={desk.signingMode}
              onSigningModeChange={desk.setSigningMode}
              wallet={wallet}
              publishers={desk.desk.publishers}
              authorizing={desk.authorizing}
              authorizeError={desk.authorizeError}
              onAuthorize={() => wallet.accountId && desk.authorize(wallet.accountId)}
            />

            <ActionsPanel
              holderAccountId={desk.desk?.holderAccountId ?? null}
              disabled={actionsDisabled}
              busyRecord={desk.busyRecord}
              actionError={desk.actionError}
              onRecord={handleRecord}
            />

            <DecisionPanel
              holderAccountId={desk.desk?.holderAccountId ?? null}
              disabled={actionsDisabled}
              busyRecord={desk.busyRecord}
              decisionError={desk.actionError}
              onRecord={handleRecord}
            />

            <ForgeCard disabled={false} forging={desk.forging} forgeResult={desk.forgeResult} onForge={desk.forge} />

            <div ref={trailRef}>
              <TrailTable topicId={desk.desk.topicId} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
