"use client";

import { useEffect, useRef } from "react";
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

/** Every control on one page: any target, freezes, decisions, and HashPack as a publisher. */
export function Sandbox() {
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
    if (!isHashPack) return desk.performIssuerRecord(payload);
    if (!wallet.accountId) return Promise.resolve(null);
    return desk.performHashPackRecord(payload, wallet.accountId, wallet.signAndSubmit);
  };

  /** A failed record belongs to the card that submitted it, not to both of them. */
  const errorFor = (kind: RecordPayload["kind"]) => (desk.recordError?.kind === kind ? desk.recordError.message : null);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
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
            actionError={errorFor("action")}
            onRecord={handleRecord}
          />

          <DecisionPanel
            holderAccountId={desk.desk?.holderAccountId ?? null}
            disabled={actionsDisabled}
            busyRecord={desk.busyRecord}
            decisionError={errorFor("decision")}
            onRecord={handleRecord}
          />

          <ForgeCard disabled={false} forging={desk.forging} forgeResult={desk.forgeResult} onForge={desk.forge} />

          <div ref={trailRef}>
            <TrailTable topicId={desk.desk.topicId} />
          </div>
        </>
      )}
    </div>
  );
}
