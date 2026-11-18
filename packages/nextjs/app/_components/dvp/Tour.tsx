"use client";

import { useEffect, useState } from "react";
import { AuditLog } from "./AuditLog";
import { HashScanLink } from "./HashScanLink";
import { SetupPanel } from "./SetupPanel";
import {
  AttackOutcome,
  Columns,
  Label,
  MarketStrip,
  Panel,
  Refusal,
  SignaturesCard,
  StepCard,
  type TourResult,
  TxLink,
  UnderTheHood,
} from "./TourParts";
import { type Terms, TradeTicket } from "./TradeTicket";
import { TradesList } from "./TradesList";
import { useMarket } from "./useMarket";
import * as dvp from "~~/services/hedera/dvpClient";
import {
  BUYER_INITIAL_PAYMENT,
  type MarketSnapshot,
  SELLER_INITIAL_SECURITY,
  type TradeSnapshot,
  UNVERIFIED_BUYER_INITIAL_PAYMENT,
} from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type Stage = "setup" | "propose" | "sign" | "break" | "trades";
type Chapter = "break" | "trades";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "setup", label: "Set up" },
  { stage: "propose", label: "Propose" },
  { stage: "sign", label: "Sign" },
  { stage: "break", label: "Break it" },
  { stage: "trades", label: "More trades" },
];
const TOTAL = STEPS.length;
const QUANTITY = 100;
const PRICE = 10000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** The tour's own trade, while it waits for the Buyer: the demo Seller's, to the demo Buyer, on signature. */
const waitingForBuyer = (market: MarketSnapshot) =>
  market.trades.find(
    t =>
      t.status === "PENDING" &&
      t.settlementMode === "onSignature" &&
      t.buyerChoice === "buyer" &&
      !t.sellerIsWallet &&
      !t.buyerIsWallet,
  ) ?? null;

/**
 * The step follows the market, not this tab, so a reload or a detour through the Sandbox lands on the right one. Only
 * which of the last two chapters the reader is on is their own.
 */
function stageOf(market: MarketSnapshot | null, chapter: Chapter): Stage {
  if (!market) return "setup";
  if (!market.trades.some(t => t.status === "SETTLED")) return waitingForBuyer(market) ? "sign" : "propose";
  return chapter;
}

type Ctx = {
  market: MarketSnapshot;
  busyKey: string | null;
  results: Record<string, TourResult | null>;
  go: (key: string, run: () => Promise<{ market: MarketSnapshot; result: TourResult }>) => Promise<void>;
};

export function Tour() {
  const { market, setMarket, loaded, auditEntries, auditTopicId, configLoaded, operatorConfigured } = useMarket();
  const [chapter, setChapter] = useState<Chapter>("break");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TourResult | null>>({});
  const [flash, setFlash] = useState<{ text: string; ok: boolean; transaction: string | null } | null>(null);

  // A fresh market forgets the last one's results and starts its chapters over.
  const securityTokenId = market?.securityTokenId ?? null;
  useEffect(() => {
    setResults({});
    setFlash(null);
    setChapter("break");
  }, [securityTokenId]);

  const go: Ctx["go"] = async (key, run) => {
    setBusyKey(key);
    setResults(previous => ({ ...previous, [key]: null }));
    setFlash(null);
    let result: TourResult;
    try {
      const outcome = await run();
      setMarket(outcome.market);
      result = outcome.result;
    } catch (e) {
      result = { ok: false, result: "Error", message: errorMessage(e), transaction: null };
    }
    setResults(previous => ({ ...previous, [key]: result }));
    setBusyKey(null);
    // Signing moves the tour on, so the settlement is announced above the next step.
    if (key === "sign" && result.result !== "Error")
      setFlash({
        text: result.ok
          ? "Settled: both legs moved in one transaction."
          : `The network refused the settlement: ${result.result}. Nothing moved.`,
        ok: result.ok,
        transaction: result.transaction,
      });
  };

  // Moving between chapters retires the last announcement: it belonged to the step it was made on.
  const pick = (next: Chapter) => {
    setChapter(next);
    setFlash(null);
  };

  const stage = stageOf(market, chapter);
  const ctx = market ? { market, busyKey, results, go } : null;

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={loaded ? stage : null} pickable={stage === "break" || stage === "trades"} onPick={pick} />
      {flash ? (
        <div role="status" className={`alert ${flash.ok ? "alert-success" : "alert-error"} text-sm py-2`}>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {flash.text}{" "}
            {flash.transaction ? <TxLink transaction={flash.transaction}>The settlement on HashScan</TxLink> : null}
          </span>
        </div>
      ) : null}
      {ctx ? <MarketStrip market={ctx.market} /> : null}
      {!loaded ? (
        <div className="flex items-center gap-3 text-base-content/70">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          Reading the market…
        </div>
      ) : !ctx ? (
        <SetupScreen configLoaded={configLoaded} operatorConfigured={operatorConfigured} onMarket={setMarket} />
      ) : stage === "propose" ? (
        <ProposeScreen ctx={ctx} />
      ) : stage === "sign" ? (
        <SignScreen ctx={ctx} trade={waitingForBuyer(ctx.market)!} />
      ) : stage === "break" ? (
        <BreakScreen ctx={ctx} onNext={() => pick("trades")} />
      ) : (
        <TradesScreen
          market={ctx.market}
          setMarket={setMarket}
          auditEntries={auditEntries}
          auditTopicId={auditTopicId}
        />
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

function SetupScreen({
  configLoaded,
  operatorConfigured,
  onMarket,
}: {
  configLoaded: boolean;
  operatorConfigured: boolean;
  onMarket: (market: MarketSnapshot) => void;
}) {
  return (
    <Columns
      main={
        <SetupPanel
          configLoaded={configLoaded}
          operatorConfigured={operatorConfigured}
          onMarket={onMarket}
          step={{ label: `Step 1 of ${TOTAL} · Issuer`, title: "Open the market" }}
        />
      }
      aside={
        <>
          <Panel title="Who is who" caption="Three demo accounts the app signs for, and you as the issuer.">
            <ul className="m-0 pl-5 list-disc flex flex-col gap-1.5 text-sm">
              <li>
                <strong>Issuer</strong>: your operator account. Creates both tokens, grants KYC, pays every fee.
              </li>
              <li>
                <strong>Seller</strong>: starts with {SELLER_INITIAL_SECURITY} security.
              </li>
              <li>
                <strong>Buyer</strong>: starts with {BUYER_INITIAL_PAYMENT.toLocaleString()} stablecoin, KYC granted.
              </li>
              <li>
                <strong>Unverified Buyer</strong>: starts with {UNVERIFIED_BUYER_INITIAL_PAYMENT.toLocaleString()}{" "}
                stablecoin, no KYC on the security.
              </li>
            </ul>
          </Panel>
          <Panel title="What happens next" caption="Four steps, one action each.">
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-1.5 text-sm">
              <li>
                <strong>Propose</strong>: the Seller proposes and signs a trade. Nothing moves yet.
              </li>
              <li>
                <strong>Sign</strong>: the Buyer signs, and both legs settle in one transaction.
              </li>
              <li>
                <strong>Break it</strong>: three trades that should fail. Each fails whole.
              </li>
              <li>
                <strong>More trades</strong>: any terms, settling now or at a set time.
              </li>
            </ol>
          </Panel>
        </>
      }
    />
  );
}

const SCHEDULE_CODE = `const settlement = new TransferTransaction()
  .addTokenTransfer(security, seller, -${QUANTITY})     // delivery
  .addTokenTransfer(security, buyer, ${QUANTITY})
  .addTokenTransfer(stablecoin, buyer, -${PRICE})  // payment
  .addTokenTransfer(stablecoin, seller, ${PRICE});

new ScheduleCreateTransaction()
  .setScheduledTransaction(settlement)
  .setAdminKey(sellerKey)                   // only the Seller can cancel
  .setExpirationTime(now + 30 minutes)
  .sign(sellerKey)                          // the first of the two signatures`;

function ProposeScreen({ ctx }: { ctx: Ctx }) {
  const { busyKey, results, go } = ctx;
  return (
    <Columns
      main={
        <>
          <StepCard
            step={2}
            total={TOTAL}
            who="Seller"
            title={`Propose: ${QUANTITY} security for ${PRICE.toLocaleString()} stablecoin`}
          >
            <p className="m-0 text-base-content/80 max-w-2xl">
              The Seller writes both legs into one transfer: {QUANTITY} security from the Seller to the Buyer, and{" "}
              {PRICE.toLocaleString()} stablecoin from the Buyer to the Seller. It wraps the transfer in a scheduled
              transaction and signs it. The Buyer has not signed, so the network holds it and nothing moves.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-propose"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null}
                onClick={() =>
                  void go("propose", async () => {
                    const market = await dvp.proposeTrade(QUANTITY, PRICE, "buyer", "onSignature");
                    return { market, result: { ok: true, result: "SUCCESS", message: "", transaction: null } };
                  })
                }
              >
                {busyKey === "propose" ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
                Propose and sign as Seller
              </button>
            </div>
            <Refusal id="tour-propose-error" result={results.propose ?? null} />
          </StepCard>
          <UnderTheHood title="the calls this step makes" code={SCHEDULE_CODE} />
        </>
      }
      aside={<SignaturesCard trade={null} quantity={QUANTITY} price={PRICE} />}
    />
  );
}

function SignScreen({ ctx, trade }: { ctx: Ctx; trade: TradeSnapshot }) {
  const { busyKey, results, go } = ctx;
  return (
    <Columns
      main={
        <>
          <StepCard step={3} total={TOTAL} who="Buyer" title="Sign as the Buyer: both legs settle together">
            <p className="m-0 text-base-content/80 max-w-2xl">
              Schedule <HashScanLink hederaId={trade.scheduleId} kind="schedule" /> holds the Seller&apos;s signature.
              Nothing has moved: the balances above are where setup left them. The Buyer&apos;s signature is the last
              one the transfer needs, so the network runs it the moment it lands, both legs in one transaction.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                id="tour-sign"
                type="button"
                className="btn btn-primary"
                disabled={busyKey !== null}
                onClick={() =>
                  void go("sign", async () => {
                    const market = await dvp.signTrade(trade.scheduleId);
                    const settled = market.trades.find(t => t.scheduleId === trade.scheduleId);
                    const ok = settled?.status === "SETTLED";
                    return {
                      market,
                      result: {
                        ok,
                        result: settled?.settlementResult ?? settled?.status ?? "UNKNOWN",
                        message: "",
                        transaction: settled?.executedAt ?? null,
                      },
                    };
                  })
                }
              >
                {busyKey === "sign" ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
                Sign as Buyer
              </button>
            </div>
            <Refusal id="tour-sign-error" result={results.sign ?? null} />
          </StepCard>
          <UnderTheHood
            title="the call this step makes"
            code={`new ScheduleSignTransaction()
  .setScheduleId("${trade.scheduleId}")
  .sign(buyerKey)   // the last signature: the network executes the transfer now
// If either leg fails (no KYC, not enough stablecoin), the whole transfer fails and nothing moves.`}
          />
        </>
      }
      aside={<SignaturesCard trade={trade} quantity={trade.quantity} price={trade.price} />}
    />
  );
}

const ATTACKS: { type: string; who: string; title: string; text: string; meaning: string; code: string }[] = [
  {
    type: "no-kyc",
    who: "Seller and Unverified Buyer",
    title: "Sell to a buyer without KYC",
    text: "Sell 10 security for 1,000 stablecoin to the Unverified Buyer, who has no KYC on the security. Both sign.",
    meaning:
      "The security leg needs KYC, so it failed, and the stablecoin leg failed with it: the Unverified Buyer kept its stablecoin.",
    code: "transfer(security, seller → unverifiedBuyer, 10)\ntransfer(stablecoin, unverifiedBuyer → seller, 1000)\n.schedule() · seller signs · buyer signs",
  },
  {
    type: "short-payment",
    who: "Seller and Buyer",
    title: "Pay with money you don't have",
    text: `Sell 10 security to the Buyer for ${(BUYER_INITIAL_PAYMENT * 5).toLocaleString()} stablecoin, five times what setup gave it. Both sign.`,
    meaning:
      "The Buyer cannot cover the payment leg, so it failed, and the delivery leg failed with it: the Seller kept its security.",
    code: `transfer(security, seller → buyer, 10)\ntransfer(stablecoin, buyer → seller, ${BUYER_INITIAL_PAYMENT * 5})\n.schedule() · seller signs · buyer signs`,
  },
  {
    type: "buyer-cancels",
    who: "Buyer",
    title: "Cancel someone else's trade",
    text: "The Seller proposes a trade. Instead of signing it, the Buyer tries to delete the schedule.",
    meaning:
      "Only the schedule's admin key can delete it, and that key is the Seller's. The desk then cancelled the trade properly, as the Seller.",
    code: "new ScheduleDeleteTransaction()\n  .setScheduleId(schedule)\n  .sign(buyerKey)   // the admin key is the Seller's",
  },
];

function BreakScreen({ ctx, onNext }: { ctx: Ctx; onNext: () => void }) {
  const { busyKey, results, go } = ctx;
  const tried = ATTACKS.map(attack => results[attack.type]).filter(result => result && result.result !== "Error");
  const refused = tried.filter(result => result && !result.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <Label>Step 4 of {TOTAL} · optional</Label>
          <h2 className="m-0 text-xl font-bold">Try to break it</h2>
          <p className="m-0 text-sm text-base-content/80">
            Try to move one leg without the other, or undo the other party&apos;s trade. Each attempt is a real
            transaction: <strong>a refusal is a pass</strong>, and the balances above should not move.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span role="status" className="badge badge-lg badge-outline">
            {tried.length} of {ATTACKS.length} tried · {refused} refused
          </span>
          <button id="next-trades" type="button" className="btn btn-primary" onClick={onNext}>
            Next: more trades →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {ATTACKS.map(attack => (
          <Panel key={attack.type} title={attack.title}>
            <p className="m-0 text-sm">{attack.text}</p>
            <pre className="m-0 rounded-box bg-[#11151d] text-[#f0f0f2] px-3 py-2 text-[12px] whitespace-pre-wrap font-mono">
              {attack.code}
            </pre>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <button
                id={attack.type}
                type="button"
                className={`btn ${results[attack.type] ? "btn-outline" : "btn-neutral"}`}
                disabled={busyKey !== null}
                onClick={() =>
                  void go(attack.type, async () => {
                    const { market, ok, result, transaction } = await dvp.runAttack(attack.type);
                    return { market, result: { ok, result, message: "", transaction } };
                  })
                }
              >
                {busyKey === attack.type ? <span className="loading loading-spinner loading-xs" aria-hidden /> : null}
                {results[attack.type] ? "Try again" : "Run this attack"}
              </button>
              <span className="text-xs text-base-content/60">{attack.who}</span>
            </div>
            <AttackOutcome
              id={`${attack.type}-result`}
              result={results[attack.type] ?? null}
              meaning={attack.meaning}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}

function TradesScreen({
  market,
  setMarket,
  auditEntries,
  auditTopicId,
}: {
  market: MarketSnapshot;
  setMarket: (market: MarketSnapshot) => void;
  auditEntries: Parameters<typeof AuditLog>[0]["entries"];
  auditTopicId: string | null;
}) {
  const [busyPropose, setBusyPropose] = useState(false);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);

  // The tour signs for the demo parties only; a wallet's side of a trade is the Sandbox's.
  const canSign = (trade: TradeSnapshot) => trade.status === "PENDING" && !trade.buyerIsWallet;
  const canCancel = (trade: TradeSnapshot) =>
    (trade.status === "PENDING" || trade.status === "SCHEDULED") && !trade.sellerIsWallet;

  const run = async (work: () => Promise<MarketSnapshot>, done: string) => {
    try {
      setMarket(await work());
      notification.success(done);
    } catch (e) {
      notification.error(errorMessage(e));
    }
  };

  const propose = async ({ quantity, price, buyerChoice, settlementMode, settlementDelay }: Terms) => {
    setBusyPropose(true);
    await run(
      () => dvp.proposeTrade(quantity, price, buyerChoice, settlementMode, settlementDelay),
      "Trade proposed. The demo Seller signed.",
    );
    setBusyPropose(false);
  };

  const act = async (trade: TradeSnapshot, kind: "sign" | "cancel") => {
    setBusyScheduleId(trade.scheduleId);
    await run(
      () => (kind === "sign" ? dvp.signTrade(trade.scheduleId) : dvp.cancelTrade(trade.scheduleId)),
      kind === "sign" ? "Signed as Buyer." : "Trade cancelled.",
    );
    setBusyScheduleId(null);
  };

  return (
    <Columns
      wideAside
      main={
        <>
          <div className="flex flex-col gap-1 max-w-4xl">
            <Label>Step 5 of {TOTAL} · Seller and Buyer</Label>
            <h2 id="step-title" className="m-0 text-xl font-bold">
              Trade again
            </h2>
            <p className="m-0 text-sm text-base-content/80">
              Any terms, either buyer. <em>At a set time</em> trades settle by themselves once the Buyer has signed,
              with no one pressing anything. To sign with HashPack, use the Sandbox.
            </p>
          </div>
          <Panel title="Trades" caption="Every trade of this market, newest first.">
            <div className="max-h-[18rem] overflow-y-auto">
              <TradesList
                trades={market.trades}
                yourTurnScheduleId={market.trades.find(canSign)?.scheduleId ?? null}
                busyScheduleId={busyScheduleId}
                canSign={canSign}
                canCancel={canCancel}
                onSign={trade => void act(trade, "sign")}
                onCancel={trade => void act(trade, "cancel")}
              />
            </div>
          </Panel>
        </>
      }
      aside={
        <>
          <TradeTicket
            market={market}
            busy={busyPropose}
            onPropose={propose}
            caption="The demo Seller signs as you propose."
          />
          <details className="card bg-base-100 border border-base-300 shadow-sm">
            <summary className="cursor-pointer p-5 font-semibold">
              Audit log · {auditEntries.length} {auditEntries.length === 1 ? "entry" : "entries"}
            </summary>
            <div className="px-5 pb-5">
              <AuditLog entries={auditEntries} topicId={auditTopicId} />
            </div>
          </details>
        </>
      }
    />
  );
}
