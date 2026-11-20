"use client";

import type { DvpDeskHook } from "./useDesk";
import type { DeskView, TradeView } from "~~/services/dvp/types";

const STATUS_STYLE: Record<TradeView["state"], string> = {
  "AWAITING PLEDGES": "badge-ghost",
  "WAITING FOR THE TIME": "badge-info",
  READY: "badge-primary",
  SETTLED: "badge-success",
  CANCELLED: "badge-neutral",
  EXPIRED: "badge-warning",
};

const labelFor = (state: DeskView, trade: TradeView, which: "seller" | "buyer") => {
  const id = which === "seller" ? trade.seller : trade.buyer;
  const party = state.parties.find(p => p.id === id);
  return party?.label ?? (which === "seller" ? trade.sellerAddress : trade.buyerAddress);
};

const settleTime = (trade: TradeView) =>
  trade.notBefore === 0
    ? "as soon as both legs are pledged"
    : `not before ${new Date(trade.notBefore * 1000).toLocaleTimeString(undefined, { timeStyle: "short" })}`;

/** What a settled trade changed for each party. Settlement is atomic, so it is exactly the terms. */
function Changes({ state, trade }: { state: DeskView; trade: TradeView }) {
  if (trade.state === "SETTLED") {
    return (
      <span className="text-xs">
        {labelFor(state, trade, "seller")}: <span className="text-error">−{trade.quantity} security</span>,{" "}
        <span className="text-success">+{trade.price} cash</span> · {labelFor(state, trade, "buyer")}:{" "}
        <span className="text-success">+{trade.quantity} security</span>,{" "}
        <span className="text-error">−{trade.price} cash</span>
      </span>
    );
  }
  const text =
    trade.state === "CANCELLED"
      ? "Nothing moved: cancelled, and both pledges were released."
      : trade.state === "EXPIRED"
        ? "Nothing moved: the pledges outlived their holds, and each party can reclaim its own units."
        : trade.securityPledged && trade.cashPledged
          ? "Nothing delivered yet: both legs are pledged, waiting to settle."
          : "Nothing delivered yet: waiting for a pledge.";
  return <span className="text-xs text-base-content/60">{text}</span>;
}

type Props = {
  desk: DvpDeskHook;
  onResult: (text: string) => void;
};

/** Every trade of the current market, newest first, each with the controls the contract would accept. */
export function TradesList({ desk, onResult }: Props) {
  const { state, pledgeSecurity, pledgeCash, settle, cancel, pledgeAsWallet, busyKey } = desk;
  if (!state) return null;

  const walletIsBuyer = state.wallet.kind === "buyer";

  return (
    <section className="card bg-base-100 border border-base-300 shadow-none">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold">Trades</h2>
          <p className="m-0 text-xs text-base-content/60">
            Read from the settlement contract: the terms, which legs are pledged, and what each trade changed.
          </p>
        </div>

        <ol id="trades" className="m-0 p-0 list-none flex flex-col gap-2">
          {state.trades.length === 0 && <li className="text-sm text-base-content/60">No trades yet.</li>}
          {state.trades.map(trade => {
            const buyerIsWallet = state.parties.find(p => p.id === trade.buyer)?.isWallet ?? false;
            return (
              <li
                key={trade.tradeId}
                className="trade-row border border-base-300 rounded-lg p-3 flex flex-col gap-2"
                data-trade={trade.tradeId}
                data-status={trade.state}
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline text-sm">
                  <span className="font-semibold">Trade {trade.tradeId}</span>
                  <span>
                    {trade.quantity} security for {trade.price} cash to the {labelFor(state, trade, "buyer")}
                  </span>
                  <span className="text-xs text-base-content/60">{settleTime(trade)}</span>
                  <span className={`badge badge-sm ${STATUS_STYLE[trade.state]}`}>{trade.state}</span>
                </div>

                <div className="flex flex-wrap gap-x-3 text-xs">
                  <span className={trade.securityPledged ? "text-success" : "text-base-content/60"}>
                    {trade.securityPledged ? "✓" : "•"} security pledged
                  </span>
                  <span className={trade.cashPledged ? "text-success" : "text-base-content/60"}>
                    {trade.cashPledged ? "✓" : "•"} cash pledged
                  </span>
                </div>

                <Changes state={state} trade={trade} />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-xs trade-lock-security"
                    disabled={trade.securityPledged || !trade.canCancel || busyKey !== null}
                    onClick={async () => {
                      const r = await pledgeSecurity(trade.tradeId);
                      onResult(
                        r.ok
                          ? `The Seller's ${trade.quantity} security are held for the buyer, in the Seller's own account. Nothing has been delivered.`
                          : `The pledge was refused: ${r.result}`,
                      );
                    }}
                  >
                    Pledge security
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs trade-lock-cash"
                    disabled={trade.cashPledged || !trade.canCancel || busyKey !== null}
                    onClick={async () => {
                      const r =
                        buyerIsWallet && walletIsBuyer
                          ? await pledgeAsWallet(trade.tradeId)
                          : await pledgeCash(trade.tradeId);
                      onResult(
                        r.ok
                          ? `${trade.price} cash is held for the seller, in the stablecoin's custody. Nothing has been delivered.`
                          : `The pledge was refused: ${r.result}`,
                      );
                    }}
                  >
                    {buyerIsWallet && walletIsBuyer ? "Pledge cash from my wallet" : "Pledge cash"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-primary trade-settle"
                    disabled={!trade.settleable || busyKey !== null}
                    onClick={async () => {
                      const r = await settle(trade.tradeId);
                      onResult(
                        r.ok
                          ? "Both legs moved in one transaction."
                          : `Settlement was refused: ${r.result}. Neither leg moved, and both pledges are still in place.`,
                      );
                    }}
                  >
                    Settle
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost trade-cancel"
                    disabled={!trade.canCancel || busyKey !== null}
                    onClick={async () => {
                      const r = await cancel(trade.tradeId, "seller");
                      onResult(
                        r.ok ? "Cancelled; both pledges released." : `The cancellation was refused: ${r.result}`,
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
