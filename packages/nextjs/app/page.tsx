"use client";

import { useEffect, useRef, useState } from "react";
import { LoanTicketCard, PledgeCard, type Run, SimulationsCard } from "./_desk/ControlCards";
import { ActivityCard, BillCard, CashCard, EncumbranceCard, PlaceholderCard, PositionCard } from "./_desk/DeskCards";
import { SetupCard } from "./_desk/SetupCard";
import { Card } from "./_desk/ui";
import { useDesk, usePreview } from "./_desk/useDesk";
import { WalletCard, useWalletPledge } from "./_desk/wallet";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import type { ActionResult } from "~~/types/repo";

const Home: NextPage = () => {
  const { address } = useAccount();
  const { snapshot, offline, startSetup, act } = useDesk(address);
  const desk = snapshot?.desk ?? null;

  // One action at a time: a control that is working shows it and cannot be pressed twice.
  const [busy, setBusy] = useState<string | null>(null);
  const run: Run = async (key, request) => {
    setBusy(key);
    try {
      return await act(request);
    } finally {
      setBusy(null);
    }
  };

  const [borrowAmount, setBorrowAmount] = useState("9600");
  const preview = usePreview(borrowAmount, desk !== null);
  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const [pledgeResult, setPledgeResult] = useState<ActionResult | null>(null);
  const walletPledge = useWalletPledge(desk, act);

  // When setup finishes, bring the position into view.
  const seenCompletion = useRef<number | null>(null);
  const completedAt = snapshot?.setup.completedAt ?? null;
  useEffect(() => {
    if (completedAt !== null && seenCompletion.current !== null && seenCompletion.current !== completedAt) {
      document.getElementById("position-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (snapshot) seenCompletion.current = completedAt ?? 0;
  }, [completedAt, snapshot]);
  // A first load that already has a finished desk should not scroll; seenCompletion starts null until a snapshot lands.

  const startSetupAndReset = async () => {
    setBusy("setup");
    setPledgeResult(null);
    try {
      await startSetup();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold">Collateral mobility: a repo desk</h1>
        <p className="m-0 text-base max-w-4xl">
          In a repo, a borrower raises cash against a bill for a fixed term, then repays principal plus interest to get
          the bill back, or loses it to the lender. Here the pledged bills never leave the borrower&apos;s own account:
          an Asset Tokenization Studio hold encumbers them in place, naming the repo contract as escrow and the lender
          as destination. The bill&apos;s price is not typed in: a feed computes it from a published discount rate and
          the days remaining.
        </p>
        <p className="m-0 text-sm max-w-4xl">
          The one compression, applied in one place: <strong id="demo-clock">1 second = 1 day</strong> of the
          bill&apos;s life. The 30-day term runs in 30 seconds and the 91-day bill matures in 91 seconds.
        </p>
        {offline && !snapshot ? (
          <div className="alert alert-warning text-sm">The desk could not be reached yet: {offline}</div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0" id="controls-column">
          <SetupCard snapshot={snapshot} busy={busy !== null} onSetup={startSetupAndReset} />
          <WalletCard
            desk={desk}
            busy={busy}
            mode={mode}
            setMode={setMode}
            onAdd={walletAddress => void run("add-wallet", { type: "add-wallet", address: walletAddress })}
          />
          <PledgeCard
            desk={desk}
            busy={busy}
            run={run}
            mode={desk?.wallet?.added ? mode : "demo"}
            onWalletPledge={walletPledge.pledge}
            pledgeError={pledgeResult}
            setPledgeError={setPledgeResult}
            walletBusy={walletPledge.pending}
          />
          <LoanTicketCard
            desk={desk}
            busy={busy}
            run={run}
            preview={preview}
            amount={borrowAmount}
            setAmount={setBorrowAmount}
          />
          <SimulationsCard desk={desk} busy={busy} run={run} />
        </div>

        <div className="flex flex-col gap-6 min-w-0" id="network-column">
          {desk ? (
            <>
              <PositionCard desk={desk} />
              <BillCard desk={desk} />
              <CashCard desk={desk} />
              <EncumbranceCard desk={desk} />
              <ActivityCard entries={snapshot?.activity ?? []} />
            </>
          ) : (
            <PlaceholderCard />
          )}
        </div>
      </div>

      <Card title="Notes" caption="Four meanings of one word, and what this template does and does not claim.">
        <div className="text-sm flex flex-col gap-2">
          <p className="m-0">
            <strong>Four meanings of &quot;discount&quot;.</strong> (1) The issue discount: the bill sells below face
            and pays no coupon, so the discount is the return. (2) The discount rate the feed publishes: annualised, so
            a 5% rate on a 91-day bill is a 1.264% price discount, not a 5% one, because the factor is 91/360. (3) The
            haircut, also called a discount, which is unrelated to either. (4) The discount rate of present value, the
            time value of money, which is what makes the first one worth anything.
          </p>
          <p className="m-0">
            <strong>What this claims.</strong> Collateral mobility and atomic settlement: the pledge is a right over an
            asset in place, and it settles in seconds against the cash leg in the same transaction. It does not claim
            legal equivalence to a repurchase agreement: a real repo transfers title, and a hold is a pledge, the weaker
            of the two legal forms.
          </p>
          <p className="m-0">
            <strong>Units.</strong> The bill has 0 decimals, the stablecoin 2, the feed 8. Every comparison is made in
            8-decimal US dollars, day counts use 360, and the haircut, threshold and rates are in basis points. ATS
            holds take uint256 amounts and Studio holds take int64: every crossing is a checked conversion.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Home;
