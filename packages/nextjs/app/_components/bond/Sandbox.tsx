"use client";

import { useEffect, useRef } from "react";
import { ActivityLog } from "./ActivityLog";
import { BondCard } from "./BondCard";
import { InvestorsCard } from "./InvestorsCard";
import { IssueBondForm } from "./IssueBondForm";
import { WalletInvestorCard } from "./WalletInvestorCard";
import type { BondDesk } from "./useBondDesk";

/** Every control at once: what the desk was before the tour, kept for anyone who wants it all on one page. */
export function Sandbox({ desk }: { desk: BondDesk }) {
  const {
    status,
    statusLoaded,
    refreshStatus,
    steps,
    issuing,
    issueError,
    justIssued,
    clearJustIssued,
    issueBond,
    busyAddress,
    actionResult,
    approveInvestor,
    revokeInvestor,
    issueToInvestor,
    addingWallet,
    addWalletInvestor,
    logActivity,
  } = desk;

  const bondSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (justIssued) {
      bondSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      clearJustIssued();
    }
  }, [justIssued, clearJustIssued]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-6">
        <IssueBondForm
          configured={statusLoaded ? (status?.configured ?? false) : false}
          configError={status?.configError}
          issuing={issuing}
          issueError={issueError}
          steps={steps}
          onIssue={issueBond}
        />

        {status?.bond ? (
          <InvestorsCard
            investors={status.investors}
            actionResult={actionResult}
            busyAddress={busyAddress}
            onApprove={approveInvestor}
            onRevoke={revokeInvestor}
            onIssue={issueToInvestor}
          />
        ) : null}

        {/* Always rendered: #wallet-state must say what to do next (connect, switch network,
            add the wallet, wait for approval, transfer) from the very first page load, before
            any bond has been issued. */}
        <WalletInvestorCard
          bondAddress={status?.bond?.address ?? null}
          investors={status?.investors ?? []}
          addingWallet={addingWallet}
          onAddWalletInvestor={addWalletInvestor}
          onLogActivity={logActivity}
          onTransferred={refreshStatus}
        />
      </div>

      <div className="flex flex-col gap-6" ref={bondSectionRef}>
        {status?.bond ? (
          <>
            <BondCard bond={status.bond} />
            <ActivityLog entries={status.activity} />
          </>
        ) : (
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-lg">The bond</h2>
              <p className="text-sm text-base-content/60 m-0">
                Once you issue a bond, its address, terms, investors and activity will appear here, read live from the
                contract.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
