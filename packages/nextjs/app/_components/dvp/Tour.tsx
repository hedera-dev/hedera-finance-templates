"use client";

import { useEffect, useState } from "react";
import { SetupPanel } from "./SetupPanel";
import {
  AttackOutcome,
  Columns,
  Label,
  MarketStrip,
  Panel,
  PledgeCard,
  Refusal,
  StepCard,
  TxLink,
  UnderTheHood,
} from "./TourParts";
import { TradeTicket } from "./TradeTicket";
import { TradesList } from "./TradesList";
import type { DeskResult, DvpDeskHook } from "./useDesk";
import type { AttackResult, AttackType } from "~~/services/dvp/attacks";
import type { DeskView, TradeView } from "~~/services/dvp/types";

type Stage = "setup" | "propose" | "lock" | "settle" | "break" | "trades";
type Chapter = "break" | "trades";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "propose", label: "Propose" },
  { stage: "lock", label: "Lock" },
  { stage: "settle", label: "Settle" },
  { stage: "break", label: "Break it" },
  { stage: "trades", label: "More trades" },
];
const TOTAL = STEPS.length;

/** The trade the tour has in hand: the newest one still open. */
const openTrade = (state: DeskView): TradeView | null =>
  state.trades.find(trade => trade.state === "AWAITING PLEDGES" || trade.state === "READY") ?? null;

/**
 * The step follows the market, not this tab, so a reload or a detour through the Sandbox lands on
 * the right one. Only which of the last two chapters the reader is on is their own.
 */
function stageOf(state: DeskView | null, settingUp: boolean, chapter: Chapter): Stage {
  if (!state || !state.setupComplete || settingUp) return "setup";
  if (state.trades.some(trade => trade.state === "SETTLED")) return chapter;
  const open = openTrade(state);
  if (!open) return "propose";
  return open.securityPledged && open.cashPledged ? "settle" : "lock";
}

type Ctx = {
  state: DeskView;
  desk: DvpDeskHook;
  results: Record<string, DeskResult | null>;
  run: (key: string, action: () => Promise<DeskResult>) => Promise<DeskResult>;
};

export function Tour({ desk }: { desk: DvpDeskHook }) {
  const { state, isSettingUp } = desk;
  const [chapter, setChapter] = useState<Chapter>("break");
  const [results, setResults] = useState<Record<string, DeskResult | null>>({});
  const [flash, setFlash] = useState<{ text: string; result: DeskResult } | null>(null);

  // A fresh market forgets the last one's results and starts its chapters over.
  const marketId = state?.market.settlement?.contractId ?? null;
  useEffect(() => {
    setResults({});
    setFlash(null);
    setChapter("break");
  }, [marketId]);

  const run = async (key: string, action: () => Promise<DeskResult>) => {
    setResults(previous => ({ ...previous, [key]: null }));
    setFlash(null);
    desk.clearMessage();
    const result = await action();
    setResults(previous => ({ ...previous, [key]: result }));
    return result;
  };

  const pick = (next: Chapter) => {
    setChapter(next);
    setFlash(null);
    desk.clearMessage();
  };

  const stage = stageOf(state, isSettingUp, chapter);
  const ctx: Ctx | null = state && state.market.settlement ? { state, desk, results, run } : null;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={state ? stage : null} pickable={stage === "break" || stage === "trades"} onPick={pick} />
      {flash ? (
        <div role="status" className={`alert ${flash.result.ok ? "alert-success" : "alert-error"} text-sm py-2`}>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {flash.text} {flash.result.txHash ? <TxLink hash={flash.result.txHash} /> : null}
          </span>
        </div>
      ) : null}
      {desk.message ? (
        <div role="alert" className="alert alert-error text-sm py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">{desk.message}</span>
        </div>
      ) : null}
      {ctx && stage !== "setup" ? <MarketStrip state={ctx.state} /> : null}
      {!state ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the market…
        </div>
      ) : stage === "setup" || !ctx ? (
        <SetupScreen desk={desk} state={state} />
      ) : stage === "propose" ? (
        <ProposeScreen ctx={ctx} announce={setFlash} />
      ) : stage === "lock" ? (
        <LockScreen ctx={ctx} />
      ) : stage === "settle" ? (
        <SettleScreen ctx={ctx} announce={setFlash} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => pick("trades")} />
      ) : (
        <TradesScreen ctx={ctx} />
      )}
    </div>
  );
}

function Stepper({
  stage,
  pickable,
  onPick,
}: {
  /** `null` until the first read lands: no step is claimed before the market is known. */
  stage: Stage | null;
  pickable: boolean;
  onPick: (chapter: Chapter) => void;
}) {
  const current = stage === null ? -1 : STEPS.findIndex(step => step.stage === stage);
  return (
    <nav id="tour-progress" aria-label="Progress" className="flex flex-wrap gap-2 items-center">
      {STEPS.map((step, index) => {
        const done = index < current;
        const here = index === current;
        const look = here
          ? "bg-primary text-primary-content font-semibold"
          : done
            ? "bg-success/20 border border-success/50 font-semibold"
            : "bg-base-100 border border-base-300 text-base-content/70";
        const text = done ? `✓ ${step.label}` : `${index + 1} ${step.label}`;
        // Once a trade has settled, the last two chapters are the reader's to move between.
        const canPick = pickable && !here && (step.stage === "break" || step.stage === "trades");
        return (
          <span key={step.stage} className="contents">
            {index > 0 ? (
              <span aria-hidden className="text-base-content/40">
                —
              </span>
            ) : null}
            {canPick ? (
              <button
                type="button"
                className={`px-3.5 py-2 rounded-full text-sm cursor-pointer hover:ring-2 hover:ring-primary/40 ${look}`}
                onClick={() => onPick(step.stage as Chapter)}
              >
                {text}
              </button>
            ) : (
              <span aria-current={here ? "step" : undefined} className={`px-3.5 py-2 rounded-full text-sm ${look}`}>
                {text}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SetupScreen({ desk, state }: { desk: DvpDeskHook; state: DeskView }) {
  return (
    <Columns
      main={
        <>
          <StepCard step={1} total={TOTAL} who="Issuer" title="Deploy the market and the contract that settles it">
            <p className="m-0 text-base-content/80 max-w-2xl">
              One press creates three demo parties, deploys a security through the Asset Tokenization Studio factory and
              a stablecoin through the Stablecoin Studio factory — both already on testnet — then deploys this
              repo&apos;s settlement contract against the two of them and deals out a starting position. The Seller gets
              200 security, the Buyer 20000 cash, and an Unverified Buyer gets 10000 cash and no KYC on the security.
            </p>
            <p className="m-0 text-sm text-base-content/70 max-w-2xl">
              Connect a wallet <strong>before</strong> you press it to take the Buyer&apos;s side with your own testnet
              account: pledging the cash is then one ordinary transaction your wallet signs and pays for.
            </p>
          </StepCard>
          <SetupPanel desk={desk} />
        </>
      }
      aside={
        <Panel title="What happens next" caption="Five steps, one action each.">
          <ul className="m-0 pl-5 flex flex-col gap-2 text-sm">
            <li>
              <strong>Propose</strong>: the Seller records the terms. Nothing moves and nothing is pledged.
            </li>
            <li>
              <strong>Lock</strong>: each side pledges its own leg. Both balances fall and neither token changes hands.
            </li>
            <li>
              <strong>Settle</strong>: one call executes both holds, in one transaction.
            </li>
            <li>
              <strong>Break it</strong>: four ways to cheat the settlement. Each should be refused.
            </li>
            <li>
              <strong>More trades</strong>: a timed settlement, a cancellation, the Unverified Buyer.
            </li>
          </ul>
          <p className="m-0 text-xs text-base-content/60">
            {state.wallet.kind === "none"
              ? "No wallet is connected, so all three parties are demo accounts this desk signs for."
              : state.wallet.kind === "buyer"
                ? "The connected wallet is this market's Buyer."
                : "A wallet is connected; connect it before setup to be the Buyer."}
          </p>
        </Panel>
      }
    />
  );
}

const TOUR_QUANTITY = "100";
const TOUR_PRICE = "10000";

function ProposeScreen({
  ctx,
  announce,
}: {
  ctx: Ctx;
  announce: (flash: { text: string; result: DeskResult } | null) => void;
}) {
  const { state, desk, results, run } = ctx;
  const result = results["propose"] ?? null;
  return (
    <Columns
      main={
        <StepCard step={2} total={TOTAL} who="Seller" title={`Sell ${TOUR_QUANTITY} security for ${TOUR_PRICE} cash`}>
          <p className="m-0 text-base-content/80 max-w-2xl">
            The Seller records the terms on the settlement contract: who buys, how much, at what price, and that it may
            settle as soon as both legs are pledged. This moves nothing — no balance changes, and neither leg is
            encumbered yet.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              id="tour-propose"
              type="button"
              className="btn btn-primary"
              disabled={desk.busyKey !== null}
              onClick={async () => {
                const r = await run("propose", () =>
                  desk.propose({
                    quantity: TOUR_QUANTITY,
                    price: TOUR_PRICE,
                    buyer: "buyer",
                    settlementMode: "immediate",
                    delayMinutes: "2",
                  }),
                );
                if (r.ok) announce({ text: `Proposed as trade ${r.tradeId}. Nothing has moved.`, result: r });
              }}
            >
              {desk.busyKey === "propose" && <span className="loading loading-spinner loading-xs" />}
              Propose as Seller
            </button>
          </div>
          <Refusal id="tour-propose-result" result={result} />
          <UnderTheHood
            title="one call, no token touched"
            code={`settlement.propose(
  buyer,        // the Buyer's address
  ${TOUR_QUANTITY},          // security units
  ${TOUR_PRICE} * 100,   // cash, in the stablecoin's 2 decimals
  0             // notBefore: as soon as both legs are pledged
)`}
          />
        </StepCard>
      }
      aside={<PledgeCard trade={null} state={state} />}
    />
  );
}

function LockScreen({ ctx }: { ctx: Ctx }) {
  const { state, desk, results, run } = ctx;
  const trade = openTrade(state);
  if (!trade) return null;
  const walletPledges = state.wallet.kind === "buyer" && state.parties.find(p => p.id === trade.buyer)?.isWallet;

  return (
    <Columns
      main={
        <StepCard step={3} total={TOTAL} who="Seller, then Buyer" title="Pledge both legs, without moving either">
          <p className="m-0 text-base-content/80 max-w-2xl">
            Each side creates a <em>hold</em> on its own token: the amount, the settlement contract as the only address
            that can move it, and the counterparty as the only address it can move to. Watch each party&apos;s free
            balance fall and its held balance rise by the same amount in the strip above — committed, and not delivered.
            The security stays in the Seller&apos;s own account, excluded from its balance; the cash moves into the
            stablecoin&apos;s custody, because HTS has no way to encumber units in place.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              id="tour-lock-security"
              type="button"
              className="btn btn-primary"
              disabled={trade.securityPledged || desk.busyKey !== null}
              onClick={() => run("lock-security", () => desk.pledgeSecurity(trade.tradeId))}
            >
              {desk.busyKey === `pledge-security-${trade.tradeId}` && (
                <span className="loading loading-spinner loading-xs" />
              )}
              {trade.securityPledged ? "Security pledged ✓" : "Pledge the security as Seller"}
            </button>
            <button
              id="tour-lock-cash"
              type="button"
              className="btn btn-primary"
              disabled={trade.cashPledged || desk.busyKey !== null}
              onClick={() =>
                run("lock-cash", () =>
                  walletPledges ? desk.pledgeAsWallet(trade.tradeId) : desk.pledgeCash(trade.tradeId),
                )
              }
            >
              {(desk.busyKey === `pledge-cash-${trade.tradeId}` || desk.busyKey === `wallet-${trade.tradeId}`) && (
                <span className="loading loading-spinner loading-xs" />
              )}
              {trade.cashPledged
                ? "Cash pledged ✓"
                : walletPledges
                  ? "Pledge the cash from my wallet"
                  : "Pledge the cash as Buyer"}
            </button>
          </div>
          <Refusal id="tour-lock-security-result" result={results["lock-security"] ?? null} />
          <Refusal id="tour-lock-cash-result" result={results["lock-cash"] ?? null} />
          <UnderTheHood
            title="a hold on each token, then recorded against the trade"
            code={`// the Seller, on the security
security.createHoldByPartition(PARTITION, {
  amount: ${trade.quantity}, escrow: settlement, to: buyer, expirationTimestamp: …
})
settlement.lockSecurity(${trade.tradeId}, holdId)   // reads the hold back and checks it

// the Buyer, on the stablecoin
cash.createHold({ amount: ${trade.price} * 100, escrow: settlement, to: seller, … })
settlement.lockCash(${trade.tradeId}, holdId)`}
          />
        </StepCard>
      }
      aside={<PledgeCard trade={trade} state={state} />}
    />
  );
}

function SettleScreen({
  ctx,
  announce,
}: {
  ctx: Ctx;
  announce: (flash: { text: string; result: DeskResult } | null) => void;
}) {
  const { state, desk, results, run } = ctx;
  const trade = openTrade(state);
  if (!trade) return null;

  return (
    <Columns
      main={
        <StepCard step={4} total={TOTAL} who="Anyone" title="Move both legs in one transaction">
          <p className="m-0 text-base-content/80 max-w-2xl">
            Both legs are pledged, so one call executes both holds: the security to the Buyer and the cash to the
            Seller, in the same transaction. If either leg could not land, the whole call reverts and both pledges stay
            exactly as they are. Anyone may press it — the terms and both destinations were fixed by the parties
            themselves.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              id="tour-settle"
              type="button"
              className="btn btn-primary"
              disabled={!trade.settleable || desk.busyKey !== null}
              onClick={async () => {
                const r = await run("settle", () => desk.settle(trade.tradeId));
                if (r.ok) {
                  announce({
                    text: `Trade ${trade.tradeId} settled: ${trade.quantity} security to the Buyer and ${trade.price} cash to the Seller, in one transaction.`,
                    result: r,
                  });
                }
              }}
            >
              {desk.busyKey === `settle-${trade.tradeId}` && <span className="loading loading-spinner loading-xs" />}
              Settle both legs
            </button>
            {!trade.settleable && trade.notBefore > 0 && (
              <span className="text-sm text-base-content/70">
                Not before {new Date(trade.notBefore * 1000).toLocaleTimeString(undefined, { timeStyle: "short" })}.
              </span>
            )}
          </div>
          <Refusal id="tour-settle-result" result={results["settle"] ?? null} />
          <UnderTheHood
            title="one call, two holds"
            code={`settlement.settle(${trade.tradeId})
  ├─ security.executeHoldByPartition({ seller, holdId }, buyer, ${trade.quantity})
  └─ cash.executeHold({ buyer, holdId }, seller, ${trade.price} * 100)
// either reverting reverts both`}
          />
        </StepCard>
      }
      aside={<PledgeCard trade={trade} state={state} />}
    />
  );
}

type Attack = {
  type: AttackType;
  who: string;
  title: string;
  text: string;
  meaning: string;
  code: string;
};

const ATTACKS: Attack[] = [
  {
    type: "settle-one-leg",
    who: "Anyone",
    title: "Take delivery without paying",
    text: "Proposes a small trade, pledges only the security, and settles it. The cash leg is missing.",
    meaning: "Half a trade is not a trade: the contract will not move one leg without the other.",
    code: "settlement.settle(id)   // with cashHoldId == 0",
  },
  {
    type: "settle-no-kyc",
    who: "Anyone",
    title: "Settle to a buyer who was never verified",
    text: "Proposes a trade to the Unverified Buyer, pledges both legs in full, and settles it.",
    meaning:
      "The security cannot land on an unverified holder, and because both legs move in one call, the cash does not move either. The buyer's cash is still its own.",
    code: "settlement.settle(id)   // security.executeHoldByPartition → InvalidKycStatus",
  },
  {
    type: "seller-reclaims",
    who: "Seller",
    title: "Take the pledged security back",
    text: "Pledges the security to a live trade, then has the Seller try to reclaim its own hold.",
    meaning:
      "Only the escrow can release a hold, and the holder's own way out does not open until the hold expires. A pledge is a commitment, not a reservation.",
    code: "security.reclaimHoldByPartition({ partition, seller, holdId })",
  },
  {
    type: "settle-twice",
    who: "Anyone",
    title: "Settle the same trade twice",
    text: "Settles a trade that has already settled, to be paid for the same security again. Needs a settled trade.",
    meaning: "A settled trade is finished, and its holds are spent. The contract knows which state it is in.",
    code: "settlement.settle(id)   // on a trade already settled",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { desk } = ctx;
  const [outcomes, setOutcomes] = useState<Record<string, AttackResult | null>>({});
  const results = ATTACKS.map(attack => outcomes[attack.type] ?? null);
  const tried = results.filter(r => r && r.outcome !== "blocked").length;
  const refused = results.filter(r => r?.outcome === "refused").length;

  return (
    <div className="flex flex-col gap-4">
      <StepCard step={5} total={TOTAL} who="You" title="Try to break the settlement">
        <p className="m-0 text-base-content/80 max-w-3xl">
          Four ways to come out of this desk with something you are not owed. Each one is a real transaction, sent even
          though it is going to fail, so you can follow it to HashScan and read the network&apos;s own record of the
          refusal.
        </p>
        <p className="m-0 text-sm text-base-content/70">
          {tried === 0 ? "None tried yet." : `${refused} of ${tried} tried were refused.`}
        </p>
      </StepCard>

      <div className="grid gap-4 md:grid-cols-2">
        {ATTACKS.map(attack => {
          const result = outcomes[attack.type] ?? null;
          return (
            <Panel key={attack.type} title={attack.title} caption={attack.text}>
              <Label>{attack.who}</Label>
              <button
                id={attack.type}
                type="button"
                className="btn btn-outline btn-sm self-start"
                disabled={desk.busyKey !== null}
                onClick={async () => {
                  setOutcomes(previous => ({ ...previous, [attack.type]: null }));
                  const outcome = await desk.attack(attack.type);
                  setOutcomes(previous => ({ ...previous, [attack.type]: outcome }));
                }}
              >
                {desk.busyKey === `attack-${attack.type}` && <span className="loading loading-spinner loading-xs" />}
                Try it
              </button>
              <AttackOutcome id={`${attack.type}-result`} result={result} meaning={attack.meaning} />
              <UnderTheHood title="the call" code={attack.code} />
            </Panel>
          );
        })}
      </div>

      <button id="next-trades" type="button" className="btn btn-primary self-start" onClick={onNext}>
        On to more trades
      </button>
    </div>
  );
}

function TradesScreen({ ctx }: { ctx: Ctx }) {
  const { desk } = ctx;
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <StepCard step={6} total={TOTAL} who="You" title="Trade again, on your own terms">
        <p className="m-0 text-base-content/80 max-w-3xl">
          Propose anything you like: a different size, the Unverified Buyer, or a settlement that cannot happen before a
          set time. Pledge one leg and cancel to watch it come back. Nothing here needs a new market.
        </p>
      </StepCard>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <TradeTicket desk={desk} onResult={setNote} />
        <TradesList desk={desk} onResult={setNote} />
      </div>
      {note && (
        <p className="m-0 text-sm text-base-content/70" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
