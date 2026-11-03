"use client";

import { useEffect, useRef } from "react";
import { SimulationsCard, TicketCard, WalletCard } from "./_reserve/ControlCards";
import { ActivityCard, AssetCard, HoldersCard, Placeholder, ReserveCard, RolesCard } from "./_reserve/DeskCards";
import { SetupCard } from "./_reserve/SetupCard";
import { useReserveState } from "./_reserve/api";
import { Card } from "./_reserve/ui";
import type { NextPage } from "next";

const Home: NextPage = () => {
  const { data: snapshot, error } = useReserveState();
  const desk = snapshot?.desk ?? null;
  const running = snapshot?.setup.running ?? false;

  // Scroll the reserve into view when a setup finishes while the page is open.
  const seenCompletion = useRef<number | null | undefined>(undefined);
  const completedAt = snapshot?.setup.completedAt ?? null;
  useEffect(() => {
    if (snapshot === undefined) return;
    if (seenCompletion.current !== undefined && completedAt !== null && completedAt !== seenCompletion.current) {
      document.getElementById("reserve")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    seenCompletion.current = completedAt;
  }, [snapshot, completedAt]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-5 flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold">Proof of reserve</h1>
        <p className="m-0 text-sm max-w-4xl">
          Proof of reserve ties what an issuer can issue to what it holds. Here the asset is a tokenised security issued
          through Hedera&apos;s Asset Tokenization Studio, and it cannot be issued beyond its collateral: a gate
          contract holds the asset&apos;s issuer role, so every issuance has to pass through it, and the gate reads the
          reserve before it mints and refuses if the reserve does not cover the supply. The collateral balance is read
          from the chain, and so is the price that values it, from Chainlink&apos;s live BTC/USD feed, so coverage moves
          as the market does.
        </p>
        {error && !snapshot ? (
          <p role="alert" className="m-0 text-sm text-error">
            The desk could not be reached: {error.message}
          </p>
        ) : null}
        {snapshot?.readError ? (
          <p role="alert" className="m-0 text-sm text-error">
            The chain could not be read: {snapshot.readError}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <SetupCard snapshot={snapshot} />
          <TicketCard snapshot={snapshot} />
          <SimulationsCard desk={desk} disabled={running} />
          <WalletCard desk={desk} disabled={running} />
          <Card
            title="What this desk does and does not guarantee"
            caption="Given an honestly held admin role, no issuance exceeds the reserve; the gate cannot bind the role above it."
          >
            <ul className="m-0 pl-5 text-sm flex flex-col gap-2">
              <li>
                The gate decides twice, on two different questions: whether the caller is on its own list of accounts
                allowed to ask, and whether the reserve covers the supply after the issuance. The reserve check caps how
                much, never who.
              </li>
              <li>
                The admin role can grant itself the issuer role and bypass the gate. Unbacked issuance therefore needs
                an explicit <code>RoleGranted</code> event rather than happening silently. This desk holds the admin
                role on one key, deliberately: Hedera cannot schedule a contract call, so the admin role cannot be made
                multi-party by scheduling the gate.
              </li>
              <li>
                There is no login. The operator key sits in this machine&apos;s <code>.env.local</code>, and routes that
                sign accept only same-origin requests. Anyone able to run code on this machine can spend the operator
                account.
              </li>
              <li>
                The collateral token stands for custodied BTC, one unit to one BTC. That mapping is this template&apos;s
                one unverifiable assumption.
              </li>
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          {desk ? (
            <>
              <ReserveCard desk={desk} />
              <AssetCard desk={desk} />
              <RolesCard roles={desk.roles} />
              <HoldersCard holders={desk.holders} />
              <ActivityCard activity={snapshot?.activity ?? []} />
            </>
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
