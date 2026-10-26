import { HashScanLink } from "~~/app/_components/dvp/HashScanLink";
import { describeTradeChanges } from "~~/app/_components/dvp/TradeChanges";
import type { TradeSnapshot } from "~~/services/hedera/types";

const buyerLabel = (trade: TradeSnapshot): string => {
  if (trade.buyerChoice === "wallet" || trade.buyerIsWallet) return "My wallet";
  return trade.buyerChoice === "unverifiedBuyer" ? "Unverified buyer" : "Buyer";
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Props = {
  trades: TradeSnapshot[];
  /** The one trade (if any) whose Buyer signature this browser can give right now. */
  yourTurnScheduleId: string | null;
  busyScheduleId: string | null;
  canSign: (trade: TradeSnapshot) => boolean;
  canCancel: (trade: TradeSnapshot) => boolean;
  onSign: (trade: TradeSnapshot) => void;
  onCancel: (trade: TradeSnapshot) => void;
};

/** Every trade of the current market, newest first, each with its own Sign / Cancel controls. */
export const TradesList = ({
  trades,
  yourTurnScheduleId,
  busyScheduleId,
  canSign,
  canCancel,
  onSign,
  onCancel,
}: Props) => {
  return (
    <ol id="trades" className="flex flex-col gap-3 m-0 p-0 list-none">
      {trades.length === 0 && <li className="text-sm text-base-content/70">No trades proposed yet.</li>}
      {trades.map(trade => {
        const busy = busyScheduleId === trade.scheduleId;
        return (
          <li
            key={trade.scheduleId}
            className="trade-row card bg-base-200 p-3 text-sm flex flex-col gap-1"
            data-schedule-id={trade.scheduleId}
            data-status={trade.status}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Schedule: <HashScanLink hederaId={trade.scheduleId} kind="schedule" />
              </span>
              <span>{buyerLabel(trade)}</span>
              <span>
                {trade.quantity.toLocaleString()} security for {trade.price.toLocaleString()} stablecoin
              </span>
              <span className="font-semibold">{trade.status}</span>
              {trade.settlementResult && <span>{trade.settlementResult}</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-base-content/70">
              <span>Settles: {trade.settlesAt ? formatDate(trade.settlesAt) : "on signature"}</span>
              <span>Expires: {formatDate(trade.expiresAt)}</span>
            </div>
            <div>{describeTradeChanges(trade)}</div>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <button
                className="btn btn-secondary btn-xs trade-sign"
                disabled={!canSign(trade) || busy}
                onClick={() => onSign(trade)}
              >
                {busy ? "Signing…" : "Sign as Buyer"}
              </button>
              <button
                className="btn btn-outline btn-xs trade-cancel"
                disabled={!canCancel(trade) || busy}
                onClick={() => onCancel(trade)}
              >
                {busy ? "Cancelling…" : "Cancel"}
              </button>
              {yourTurnScheduleId === trade.scheduleId && (
                <span id="your-turn" className="text-info">
                  It&apos;s your turn: trade {trade.scheduleId} is waiting for your signature as Buyer.
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
