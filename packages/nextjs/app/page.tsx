"use client";

import { useEffect, useRef } from "react";
import type { NextPage } from "next";
import { ActivityLog } from "~~/app/_components/bond/ActivityLog";
import { BondCard } from "~~/app/_components/bond/BondCard";
import { InvestorsCard } from "~~/app/_components/bond/InvestorsCard";
import { IssueBondForm } from "~~/app/_components/bond/IssueBondForm";
import { WalletInvestorCard } from "~~/app/_components/bond/WalletInvestorCard";
import { useBondDesk } from "~~/app/_components/bond/useBondDesk";

const Home: NextPage = () => {
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
    actionError,
    approveInvestor,
    revokeInvestor,
    issueToInvestor,
    addingWallet,
    addWalletInvestor,
    logActivity,
  } = useBondDesk();

  const bondSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (justIssued) {
      bondSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      clearJustIssued();
    }
  }, [justIssued, clearJustIssued]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold m-0">Bond issuance desk</h1>
        <p className="text-base-content/70 m-0 max-w-3xl">
          A tokenised bond is a debt instrument represented as a security token. This desk issues one through
          Hedera&apos;s Asset Tokenization Studio (ATS), which deploys it from audited contracts already on Hedera
          testnet &mdash; this app deploys none of its own. Once issued, only investors the issuer approves may hold it.
        </p>
      </div>

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
              actionError={actionError}
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
    </div>
  );
};

export default Home;
