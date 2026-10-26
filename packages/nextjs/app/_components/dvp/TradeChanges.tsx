import type { ReactNode } from "react";
import type { TradeSnapshot } from "~~/services/hedera/types";

const signed = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString()}`;

const NOTHING_MOVED_YET: Record<string, string> = {
  PENDING: "Nothing moved yet: waiting for the Buyer's signature.",
  SCHEDULED: "Nothing moved yet: scheduled to settle at the set time.",
  REJECTED: "Nothing moved: the network rejected both legs together.",
  CANCELLED: "Nothing moved: cancelled before it could settle.",
  EXPIRED: "Nothing moved: it expired before every signature arrived.",
};

/**
 * What a trade changed for each party, as plain content (no element id) — settlement is atomic,
 * so a settled trade moved exactly its quantity and price and anything else moved nothing.
 */
export function describeTradeChanges(trade: TradeSnapshot): ReactNode {
  if (trade.status !== "SETTLED") {
    return <span className="text-base-content/70">{NOTHING_MOVED_YET[trade.status] ?? "Nothing moved."}</span>;
  }

  const seller = trade.sellerIsWallet ? "Seller (wallet)" : "Seller";
  const buyer =
    trade.buyerChoice === "wallet" || trade.buyerIsWallet
      ? "My wallet"
      : trade.buyerChoice === "unverifiedBuyer"
        ? "Unverified buyer"
        : "Buyer";

  return (
    <span className="flex flex-col">
      <span>
        {seller}: <span className="text-error">{signed(-trade.quantity)} security</span>,{" "}
        <span className="text-success">{signed(trade.price)} stablecoin</span>
      </span>
      <span>
        {buyer}: <span className="text-success">{signed(trade.quantity)} security</span>,{" "}
        <span className="text-error">{signed(-trade.price)} stablecoin</span>
      </span>
    </span>
  );
}

/** The newest trade's changes, as the page's quick-read summary element. */
export const TradeChanges = ({ trade }: { trade: TradeSnapshot }) => (
  <span id="trade-changes">{describeTradeChanges(trade)}</span>
);
