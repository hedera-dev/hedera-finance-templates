"use client";

import {
  Card,
  DASH,
  Link,
  Stat,
  UNAVAILABLE,
  accountLink,
  contractLink,
  localTime,
  show,
  tokenLink,
  txLink,
} from "./ui";
import type { ActivityEntry, DeskView } from "~~/types/repo";

export function PlaceholderCard() {
  return (
    <Card
      id="desk-placeholder"
      title="The desk will appear here"
      caption="The bill, the position, the cash, the encumbrance and the activity log are all read from the network."
    >
      <p className="m-0 text-sm">
        Nothing appears here until the desk is set up. Press <strong>Set up desk</strong> and the bill, the stablecoin,
        the price feed and the repo contract are deployed; then every number on this side is read from the chain, once a
        second.
      </p>
    </Card>
  );
}

export function BillCard({ desk }: { desk: DeskView }) {
  const { bill } = desk;
  const terms = bill.terms;
  return (
    <Card
      title="The bill"
      caption="A 13-week Treasury bill issued through Asset Tokenization Studio, priced by a feed this app deployed."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat
          label="Bill contract (EVM)"
          id="bill-address-wrap"
          value={
            <Link id="bill-address" href={contractLink(bill.contractId)}>
              {bill.address}
            </Link>
          }
        />
        <Stat
          label="Bill contract id"
          id="bill-contract-id-wrap"
          value={
            <Link id="bill-contract-id" href={contractLink(bill.contractId)}>
              {bill.contractId}
            </Link>
          }
        />
      </div>
      <Stat
        label="Terms, read back from the bill contract"
        id="bill-terms"
        value={
          terms
            ? `${terms.name} · ${terms.symbol} · ISIN ${terms.isin} · face value ${terms.faceValue} per bill · matures ${localTime(terms.maturityMs)}`
            : DASH
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat
          label="Demo days to maturity"
          id="bill-days-remaining"
          value={show(bill.daysRemaining)}
          note="counting down once a second"
        />
        <Stat
          label="Discount rate (bp)"
          id="bill-discount-rate"
          value={show(bill.discountRateBps)}
          note="published by the feed"
        />
        <Stat
          label="Price per bill"
          id="bill-price"
          value={show(bill.price, UNAVAILABLE)}
          note="face × (1 − rate × days / 360)"
        />
        <Stat
          label="Feed updated"
          id="price-updated-at"
          value={localTime(bill.priceUpdatedAt === null ? null : bill.priceUpdatedAt * 1000)}
        />
      </div>
      <Stat
        label="Price feed"
        id="feed-address-wrap"
        value={
          <Link id="feed-address" href={contractLink(bill.feed.contractId)}>
            {bill.feed.address}
          </Link>
        }
        note="This app deployed it because Hedera carries no Treasury price feed. It implements Chainlink's AggregatorV3Interface, so a real one is a drop-in replacement."
      />
      <div className="rounded-box bg-base-200 p-3 text-sm flex flex-col gap-1">
        <div>
          Demo clock: <strong>1 second = 1 day</strong> (stated at the top of the page)
        </div>
        <div>
          The bill&apos;s own maturity date, set 91 real days out:{" "}
          <strong id="real-maturity">{localTime(terms?.maturityMs)}</strong>
        </div>
        <p className="m-0 text-xs text-base-content/70">
          The two differ by 86,400× on purpose. Without the compression, the interest on a ten-minute loan at 4.8% is
          nine thousandths of a cent and the page would read $0.00. The price feed and the loan share one knob,
          <code> secondsPerDay</code>: 1 here, 86,400 in production. Nothing else in the app has a clock of its own.
        </p>
      </div>
    </Card>
  );
}

export function PositionCard({ desk }: { desk: DeskView }) {
  const p = desk.position;
  const stale = p.status === "UNKNOWN";
  return (
    <Card
      id="position-card"
      title="The position"
      caption="What is pledged, what it is worth, what is owed, and how close the lender is to taking the collateral."
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat
          label="Bills pledged"
          id="collateral-pledged"
          value={show(p.pledged)}
          note="under hold, from getHeldAmountForByPartition"
        />
        <Stat
          label="Bills free"
          id="collateral-free"
          value={show(p.free)}
          note="the borrower's balanceOf. ATS excludes held units from it, so pledged + free is what the borrower owns."
        />
        <Stat
          label="Collateral value"
          id="collateral-value"
          value={show(p.value, UNAVAILABLE)}
          note="the pledge at the feed's price"
        />
        <Stat label="Haircut" id="haircut" value={p.haircut} note="set when the repo contract was deployed" />
        <Stat
          label="Borrowing capacity"
          id="borrowing-capacity"
          value={show(p.capacity, UNAVAILABLE)}
          note="collateral value after the haircut"
        />
        <Stat label="Principal (stablecoin)" id="principal" value={show(p.principal)} />
        <Stat label="Interest accrued" id="interest-accrued" value={show(p.interest)} note="on the demo clock" />
        <Stat label="Debt" id="debt" value={show(p.debt)} note="principal plus interest" />
        <Stat label="Loan to value" id="ltv" value={show(p.ltv, UNAVAILABLE)} note="debt over collateral value" />
        <Stat
          label="Liquidation threshold"
          id="liquidation-threshold"
          value={p.threshold}
          note="the LTV at which the lender may seize"
        />
        <Stat
          label="Liquidation price (per bill)"
          id="liquidation-price"
          value={show(p.liquidationPrice)}
          note="rises as interest accrues"
        />
        <Stat
          label="Headroom (stablecoin)"
          id="headroom"
          value={show(p.headroom, UNAVAILABLE)}
          note="how much more the position can borrow"
        />
        <Stat
          label="Bill accretion since the loan opened"
          id="accretion"
          value={show(p.accretion)}
          note="what the bill has earned on its own"
        />
        <Stat label="Term remaining (demo days)" id="term-remaining" value={show(p.termRemaining)} />
        <Stat label="Loan status" id="loan-status" value={p.status} />
      </div>
      <div className="text-sm rounded-box bg-base-200 p-3 flex flex-col gap-1">
        <div>
          Carry (accretion − interest): <strong id="carry">{show(p.carry)}</strong>
        </div>
        <div id="carry-note" className="text-xs text-base-content/70">
          {p.carryNote ??
            "Once a loan is open, the page compares what the bill gains with what the funding costs, and names the larger."}
        </div>
      </div>
      <div id="loan-status-note" className={`alert ${stale ? "alert-warning" : "alert-info"} text-sm`}>
        {p.statusNote}
      </div>
      <p className="m-0 text-xs text-base-content/70">
        Over a 30-day term the bill accretes about $41.67 while the loan costs $38.40: about $3.27 of carry on money
        that was never the borrower&apos;s. That gap is the whole reason the trade exists, and at the 50× leverage a 2%
        haircut permits, the whole reason it is dangerous.
      </p>
    </Card>
  );
}

export function CashCard({ desk }: { desk: DeskView }) {
  const { cash } = desk;
  return (
    <Card title="The cash" caption="A USD stablecoin issued through Stablecoin Studio, with its own proof of reserve.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="Stablecoin proxy"
          id="stablecoin-proxy-wrap"
          value={
            <Link id="stablecoin-proxy" href={contractLink(cash.proxy.contractId)}>
              {cash.proxy.address}
            </Link>
          }
        />
        <Stat
          label="Stablecoin token"
          id="stablecoin-token-wrap"
          value={
            <Link id="stablecoin-token" href={tokenLink(cash.token.contractId)}>
              {cash.token.address}
            </Link>
          }
        />
        <Stat
          label="Token id"
          id="stablecoin-id-wrap"
          value={
            <Link id="stablecoin-id" href={tokenLink(cash.token.contractId)}>
              {cash.token.contractId}
            </Link>
          }
        />
      </div>
      <p className="m-0 text-xs text-base-content/70">
        The proxy is where management lives; the token address is where value moves. The proxy has no transfer function.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Lender cash" id="lender-cash" value={show(cash.lenderCash)} />
        <Stat label="Borrower cash" id="borrower-cash" value={show(cash.borrowerCash)} />
        <Stat
          label="Reserve"
          id="stablecoin-reserve-wrap"
          value={
            cash.reserve ? (
              <Link id="stablecoin-reserve" href={contractLink(cash.reserve.contractId)}>
                {cash.reserve.address}
              </Link>
            ) : (
              DASH
            )
          }
        />
        <Stat
          label="Reserve amount"
          id="reserve-amount"
          value={show(cash.reserveAmount)}
          note="the Studio's own proof of reserve: it caps what can ever be minted"
        />
      </div>
    </Card>
  );
}

export function EncumbranceCard({ desk }: { desk: DeskView }) {
  const e = desk.encumbrance;
  return (
    <Card
      id="encumbrance-card"
      title="The encumbrance"
      caption="The pledge is a right over the bill in place; the repo contract holds the bill in no sense at all."
    >
      <div className="grid grid-cols-1 gap-4">
        <Stat
          label="Escrow (the repo contract)"
          id="escrow-address-wrap"
          value={
            <Link id="escrow-address" href={contractLink(e.escrow.contractId)}>
              {e.escrow.address}
            </Link>
          }
        />
        <Stat
          label="Hold destination, read from the hold"
          id="hold-destination-wrap"
          value={
            e.holdDestination ? (
              <Link id="hold-destination" href={accountLink(e.holdDestination)}>
                {e.holdDestination}
              </Link>
            ) : (
              <span id="hold-destination">{DASH}</span>
            )
          }
          note="Where the pledged bills go on default, as getHoldForByPartition reports it: not what the app intended."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat
            label="Hold expiry"
            id="hold-expiry"
            value={localTime(e.holdExpiryMs)}
            note="Real time. It must outlast the loan, or the borrower's own way out opens mid-term."
          />
          <Stat label="Repo on the bill's control list" id="repo-in-control-list" value={show(e.repoInControlList)} />
          <Stat label="Roles the repo holds on the bill" id="repo-roles" value={show(e.repoRoles)} />
        </div>
      </div>
      <p id="encumbrance-explainer" className="m-0 text-sm">
        Together these two lines say the escrow is not a privilege over the token: the repo contract is on no list and
        holds no role. The collateral was never transferred to it, and the destination was fixed by the borrower at
        pledge time and cannot be changed afterwards by anyone.
      </p>
      <p className="m-0 text-xs text-base-content/70">
        One asymmetry worth a line: on the ATS bill a holder encumbers their own units freely and needs no role;
        creating a hold on the stablecoin would need <code>_HOLD_CREATOR_ROLE</code>. This template holds only the bill,
        so that role is never granted.
      </p>
    </Card>
  );
}

export function ActivityCard({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card title="Activity" caption="Every action the desk performed, newest first, with the transaction on HashScan.">
      <ol id="activity" className="m-0 p-0 list-none flex flex-col gap-2">
        {entries.length === 0 ? (
          <li className="text-sm text-base-content/60">Nothing yet.</li>
        ) : (
          entries.map(entry => (
            <li key={entry.id} className="activity-entry text-sm border-b border-base-200 pb-2">
              <span className="text-base-content/60 mr-2">{new Date(entry.at).toLocaleTimeString()}</span>
              <span className="mr-2">{entry.action}</span>
              <span className={`font-mono mr-2 ${entry.result === "SUCCESS" ? "text-success" : "text-error"}`}>
                {entry.result}
              </span>
              {entry.txHash ? (
                <a
                  className="link link-primary font-mono text-xs break-all"
                  href={txLink(entry.txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {entry.txHash}
                </a>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </Card>
  );
}
