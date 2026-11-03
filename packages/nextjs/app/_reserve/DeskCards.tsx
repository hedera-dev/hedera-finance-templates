"use client";

import { hashscan } from "./api";
import { Card, Fact, HashLink, UNAVAILABLE, orUnavailable } from "./ui";
import type { ActivityEntry, DeskView, HolderView, ReserveStatus, RoleView } from "~~/types/reserve";

export function Placeholder() {
  return (
    <Card
      title="The desk will appear here"
      caption="Nothing is shown until the desk is set up, because every figure is read from the chain."
    >
      <ul className="m-0 pl-5 text-sm flex flex-col gap-1">
        <li>The reserve: the collateral balance held at the reserve address, its BTC/USD price and its value.</li>
        <li>The asset: its terms, supply, coverage ratio and how many more units the reserve covers.</li>
        <li>The roles on the asset, who holds each, and the holders and their balances.</li>
        <li>An activity log of everything the desk does.</li>
      </ul>
    </Card>
  );
}

const STATUS_CLASS: Record<ReserveStatus, string> = {
  BACKED: "badge-success",
  "AT CAPACITY": "badge-warning",
  "UNDER-RESERVED": "badge-error",
  UNKNOWN: "badge-neutral",
};

const formatTime = (seconds: number) => new Date(seconds * 1000).toLocaleString();

export function ReserveCard({ desk }: { desk: DeskView }) {
  const { reserve } = desk;
  return (
    <Card
      id="reserve"
      title="The reserve"
      caption="The collateral token held at the reserve address, valued at the live Chainlink BTC/USD price."
    >
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Reserve address">
          <HashLink id="reserve-account" href={hashscan.account(reserve.account)}>
            {reserve.account}
          </HashLink>
        </Fact>
        <Fact label="Collateral token">
          <HashLink id="collateral-address" href={hashscan.contract(reserve.collateralAddress)}>
            {reserve.collateralAddress}
          </HashLink>
          <span className="block">
            <HashLink id="collateral-contract-id" href={hashscan.contract(reserve.collateralContractId)}>
              {reserve.collateralContractId}
            </HashLink>
          </span>
        </Fact>
        <Fact label="Collateral held (units, 1 unit = 1 BTC)">
          <span id="reserve-quantity" className="text-lg">
            {orUnavailable(reserve.quantity)}
          </span>
        </Fact>
        <Fact label="BTC/USD price">
          <span id="reserve-price" className="text-lg">
            {orUnavailable(reserve.price)}
          </span>
        </Fact>
        <Fact label="Price last updated">
          <span id="price-updated-at">
            {reserve.priceUpdatedAt === null ? UNAVAILABLE : formatTime(reserve.priceUpdatedAt)}
          </span>
        </Fact>
        <Fact label="Reserve value">
          <span id="reserve-value" className="text-lg">
            {orUnavailable(reserve.value)}
          </span>
        </Fact>
        <Fact label="Price feed (Chainlink)">
          <HashLink id="price-feed-address" href={hashscan.contract(reserve.priceFeedAddress)}>
            {reserve.priceFeedAddress}
          </HashLink>
        </Fact>
        <Fact label="Reserve feed (this app)">
          <HashLink id="reserve-feed-address" href={hashscan.contract(reserve.reserveFeedAddress)}>
            {reserve.reserveFeedAddress}
          </HashLink>
        </Fact>
      </dl>
      <p className="m-0 text-xs text-base-content/70">
        The price feed is Chainlink&apos;s BTC/USD feed on Hedera testnet. The reserve feed is the contract this app
        deployed: it reports the live collateral balance of the reserve address and stores no amount of its own. There
        is no proof-of-reserve feed on Hedera, only price feeds, so the quantity comes from a token balance. The balance
        is real and the price is real; that each unit stands for one custodied BTC is a custodian&apos;s claim, which is
        exactly what a real proof-of-reserve feed exists to attest.
      </p>
    </Card>
  );
}

export function AssetCard({ desk }: { desk: DeskView }) {
  const { asset } = desk;
  const terms = asset.terms;
  return (
    <Card
      title="The asset"
      caption="The tokenised asset, its terms and supply read back from its contract, and whether the reserve covers it."
    >
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Asset token">
          <HashLink id="asset-address" href={hashscan.contract(asset.address)}>
            {asset.address}
          </HashLink>
          <span className="block">
            <HashLink id="asset-contract-id" href={hashscan.contract(asset.contractId)}>
              {asset.contractId}
            </HashLink>
          </span>
        </Fact>
        <Fact label="Gate (holds the issuer role)">
          <HashLink id="gate-address" href={hashscan.contract(asset.gateAddress)}>
            {asset.gateAddress}
          </HashLink>
        </Fact>
        <div className="sm:col-span-2">
          <Fact label="Terms, read from the asset contract">
            <div id="asset-terms">
              {terms ? (
                <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-sm">
                  <li>Name: {terms.name}</li>
                  <li>Symbol: {terms.symbol}</li>
                  <li>ISIN: {terms.isin}</li>
                  <li>Currency: {terms.currency}</li>
                  <li>Face value per unit: {terms.faceValue}</li>
                  <li>Maximum supply: {terms.maxSupply} units</li>
                </ul>
              ) : (
                UNAVAILABLE
              )}
            </div>
          </Fact>
        </div>
        <Fact label="Units issued">
          <span id="asset-supply" className="text-lg">
            {orUnavailable(asset.supply)}
          </span>
        </Fact>
        <Fact label="Liability at face value">
          <span id="asset-liability" className="text-lg">
            {orUnavailable(asset.liability)}
          </span>
        </Fact>
        <Fact label="Coverage ratio (reserve value ÷ liability)">
          <span id="coverage-ratio" className="text-lg">
            {orUnavailable(asset.coverage)}
          </span>
        </Fact>
        <Fact label="Headroom (more units the reserve covers)">
          <span id="headroom" className="text-lg">
            {orUnavailable(asset.headroom)}
          </span>
        </Fact>
        <Fact label="Status">
          <span id="reserve-status" className={`badge ${STATUS_CLASS[asset.status]}`}>
            {asset.status}
          </span>
        </Fact>
      </dl>
      {asset.statusReason ? (
        <p id="status-reason" role="status" className="m-0 text-sm text-warning">
          {asset.statusReason}
        </p>
      ) : null}
    </Card>
  );
}

const ROLE_ATTRIBUTE: Record<RoleView["key"], string> = {
  admin: "admin",
  issuer: "issuer",
  agent: "agent",
  controlList: "control-list",
};

export function RolesCard({ roles }: { roles: RoleView[] }) {
  return (
    <Card
      title="The roles"
      caption="Every role that can affect issuance, and who holds it, read from the asset contract."
    >
      <ul id="roles" className="m-0 p-0 list-none flex flex-col gap-3">
        {roles.map(role => (
          <li
            key={role.key}
            className="role-row flex flex-col gap-1"
            data-role={ROLE_ATTRIBUTE[role.key]}
            data-role-id={role.role}
          >
            <span className="text-sm font-medium">{role.name}</span>
            {role.members === null ? (
              <span className="text-sm">{UNAVAILABLE}</span>
            ) : role.members.length === 0 ? (
              <span className="text-sm">nobody</span>
            ) : (
              role.members.map(member => (
                <HashLink key={member} href={hashscan.account(member)}>
                  {member}
                </HashLink>
              ))
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-base-content/70">
        The gate holding the issuer role is what makes the reserve check unavoidable: the asset accepts{" "}
        <code>issue</code> from the issuer role (or the agent role, which nobody holds), so every issuance has to pass
        through the gate.
      </p>
    </Card>
  );
}

export function HoldersCard({ holders }: { holders: HolderView[] }) {
  return (
    <Card
      title="Holders"
      caption="Who can hold the asset, whether they are allowlisted, and their balances read from the contract."
    >
      <ul id="holders" className="m-0 p-0 list-none flex flex-col gap-3">
        {holders.map(holder => (
          <li key={holder.address} className="holder-row flex flex-col gap-0.5" data-address={holder.address}>
            <span className="text-sm font-medium">{holder.label}</span>
            <HashLink href={hashscan.account(holder.address)}>{holder.address}</HashLink>
            <span className="text-sm">
              Allowlisted: {holder.allowlisted === null ? UNAVAILABLE : holder.allowlisted ? "yes" : "no"} · Balance:{" "}
              {orUnavailable(holder.balance)} units
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ActivityCard({ activity }: { activity: ActivityEntry[] }) {
  return (
    <Card title="Activity" caption="Everything the desk has done, newest first, with the network's answer to each.">
      <ul id="activity" className="m-0 p-0 list-none flex flex-col gap-2">
        {activity.length === 0 ? <li className="text-sm text-base-content/70">Nothing yet.</li> : null}
        {activity.map(entry => (
          <li key={entry.id} className="activity-entry flex flex-col gap-0.5 text-sm border-b border-base-200 pb-2">
            <span className="text-xs text-base-content/60">{new Date(entry.at).toLocaleTimeString()}</span>
            <span>{entry.action}</span>
            <span className={entry.result === "SUCCESS" ? "text-success font-medium" : "text-error font-medium"}>
              {entry.result}
            </span>
            {entry.txHash ? (
              <HashLink href={hashscan.transaction(entry.txHash)} className="activity-hash">
                {entry.txHash}
              </HashLink>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
