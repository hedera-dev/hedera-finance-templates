"use client";

import { useState } from "react";
import { SetupPanel } from "./SetupPanel";
import { TradeTicket } from "./TradeTicket";
import { TradesList } from "./TradesList";
import type { DvpDeskHook } from "./useDesk";
import { hashscanAccount, hashscanContract } from "~~/services/dvp/hashscan";
import type { DeskView, PartyView } from "~~/services/dvp/types";

const Card = ({
  title,
  caption,
  children,
  className = "",
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`card bg-base-100 border border-base-300 shadow-none ${className}`}>
    <div className="card-body gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        <p className="m-0 text-xs text-base-content/60">{caption}</p>
      </div>
      {children}
    </div>
  </section>
);

const Amount = ({ value }: { value: string }) => (
  <span className={value === "unavailable" ? "text-base-content/50" : ""}>
    {value === "unavailable" ? "Unknown" : value}
  </span>
);

/** Free, with what a pledge has committed beside it. Both numbers, in one column. */
const Holding = ({ free, held }: { free: string; held: string }) => (
  <span className="tabular-nums whitespace-nowrap">
    <Amount value={free} />
    {held !== "unavailable" && held !== "0" ? (
      <span className="text-base-content/60">
        {" "}
        (+
        <Amount value={held} /> held)
      </span>
    ) : null}
  </span>
);

function PartyRow({ party }: { party: PartyView }) {
  return (
    <tr className="party-row" data-party={party.id}>
      <td>
        <span className="flex flex-col gap-0.5">
          <span className="whitespace-nowrap">
            <span className="font-medium">{party.label}</span>
            {party.isWallet && <span className="badge badge-ghost badge-sm ml-2">wallet</span>}
            {party.kyc === false && <span className="badge badge-warning badge-sm ml-2">no KYC</span>}
          </span>
          <span className="font-mono text-xs text-base-content/60">
            {party.accountId ? (
              <a className="link" href={hashscanAccount(party.accountId)} target="_blank" rel="noreferrer">
                {party.accountId}
              </a>
            ) : (
              party.address
            )}
          </span>
        </span>
      </td>
      <td className="text-right" data-security-free={party.securityFree} data-security-held={party.securityHeld}>
        <Holding free={party.securityFree} held={party.securityHeld} />
      </td>
      <td className="text-right" data-cash-free={party.cashFree} data-cash-held={party.cashHeld}>
        <Holding free={party.cashFree} held={party.cashHeld} />
      </td>
    </tr>
  );
}

function MarketCard({ state }: { state: DeskView }) {
  const { security, cash, settlement } = state.market;
  if (!security || !cash || !settlement) {
    return (
      <Card title="The market" caption="What setup deploys, and where to find it.">
        <p className="m-0 text-sm text-base-content/70">
          Nothing is deployed yet. Set up the market and the security, the stablecoin and the settlement contract appear
          here, each linked to HashScan.
        </p>
      </Card>
    );
  }
  return (
    <Card title="The market" caption="Two tokens from testnet factories, and one contract this repo owns.">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-base-content/60">Security</dt>
        <dd className="m-0 font-mono text-xs">
          <a
            id="security-id"
            className="link"
            href={hashscanContract(security.contractId)}
            target="_blank"
            rel="noreferrer"
          >
            {security.contractId}
          </a>{" "}
          <span id="security-address" className="text-base-content/50">
            {security.address}
          </span>
        </dd>
        <dt className="text-base-content/60">Cash</dt>
        <dd className="m-0 font-mono text-xs">
          <a
            id="cash-id"
            className="link"
            href={`https://hashscan.io/testnet/token/${cash.tokenId}`}
            target="_blank"
            rel="noreferrer"
          >
            {cash.tokenId}
          </a>{" "}
          <span className="text-base-content/50">proxy {cash.proxyContractId}</span>
        </dd>
        <dt className="text-base-content/60">Settlement</dt>
        <dd className="m-0 font-mono text-xs">
          <a
            id="contract-id"
            className="link"
            href={hashscanContract(settlement.contractId)}
            target="_blank"
            rel="noreferrer"
          >
            {settlement.contractId}
          </a>
        </dd>
      </dl>
    </Card>
  );
}

function WalletCard({ state }: { state: DeskView }) {
  const text =
    state.wallet.kind === "none"
      ? "No wallet is connected. The three parties are demo accounts this desk signs for."
      : state.wallet.kind === "buyer"
        ? "The connected wallet is the Buyer for this market: it pledges its own cash, and pays for it."
        : "A wallet is connected, but it was not connected before setup, so it can watch this desk without being a party to it.";
  return (
    <Card title="Your wallet" caption="Connect before setup to take the Buyer's side.">
      <p id="wallet-state" className="m-0 text-sm">
        {text}
      </p>
    </Card>
  );
}

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { timeStyle: "medium" });

function HistoryCard({ state }: { state: DeskView }) {
  return (
    <Card title="What this desk did" caption="Newest first, with the transaction each step produced.">
      <ol id="history" className="m-0 p-0 list-none flex flex-col gap-1 text-xs">
        {state.history.length === 0 && <li className="text-base-content/60">Nothing yet.</li>}
        {state.history.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="history-row flex flex-wrap gap-x-2" data-kind={entry.kind}>
            <span className="text-base-content/50 tabular-nums">{formatTime(entry.at)}</span>
            <span>{entry.action}</span>
            {entry.reference && <span className="text-base-content/60">{entry.reference}</span>}
            <span className={entry.result === "SUCCESS" ? "text-success" : "text-error"}>{entry.result}</span>
            {entry.txHash && (
              <a
                className="link"
                href={`https://hashscan.io/testnet/transaction/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                tx
              </a>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Every control on one page: what the learner does on the left, what the chain shows on the right. */
export function Sandbox({ desk }: { desk: DvpDeskHook }) {
  const { state } = desk;
  const [lastResult, setLastResult] = useState<string | null>(null);

  if (!state) {
    return <p className="text-sm text-base-content/60">Reading the market…</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <div className="flex flex-col gap-4">
        <SetupPanel desk={desk} />
        {state.setupComplete && <TradeTicket desk={desk} onResult={setLastResult} />}
        <WalletCard state={state} />
        {lastResult && (
          <p className="m-0 text-xs text-base-content/70" role="status">
            {lastResult}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <MarketCard state={state} />
        {state.parties.length > 0 ? (
          <Card
            title="The parties"
            caption="Free is what this party can still move; held is what a pledge has committed to a trade."
          >
            <div className="overflow-x-auto">
              <table className="table table-sm m-0">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th className="text-right">Security</th>
                    <th className="text-right">Cash</th>
                  </tr>
                </thead>
                <tbody id="parties">
                  {state.parties.map(party => (
                    <PartyRow key={party.id} party={party} />
                  ))}
                </tbody>
              </table>
            </div>
            <p id="starting-position" className="m-0 text-xs text-base-content/60">
              Setup gives the Seller 200 security and no cash, the Buyer 20000 cash and no security, and the Unverified
              Buyer 10000 cash, no security and no KYC on the security.
            </p>
          </Card>
        ) : (
          <Card title="The parties" caption="Who trades on this desk.">
            <p className="m-0 text-sm text-base-content/70">
              The Seller, the Buyer and an Unverified Buyer appear here once the market exists, each with both balances,
              free and held.
            </p>
          </Card>
        )}
        <TradesList desk={desk} onResult={setLastResult} />
        <HistoryCard state={state} />
      </div>
    </div>
  );
}
