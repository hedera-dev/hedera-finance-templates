"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { BuyerChoice, MarketSnapshot, SettlementMode } from "~~/services/hedera/types";

export type Terms = {
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  settlementMode: SettlementMode;
  settlementDelay?: number;
};

type Props = {
  market: MarketSnapshot;
  busy: boolean;
  onPropose: (terms: Terms, seller: "demo" | "wallet") => void;
  /** Whether the connected wallet is the onboarded Seller; only read once a wallet Seller exists. */
  walletSellerReady?: boolean;
  /** Under the buttons, e.g. the newest trade's summary. */
  children?: ReactNode;
  caption?: string;
};

/** The trade ticket: what to trade, with whom, and when it settles. The Seller signs when it is proposed. */
export const TradeTicket = ({
  market,
  busy,
  onPropose,
  walletSellerReady = false,
  children,
  caption = "Buyer is the demo buyer. My wallet is listed after you onboard a wallet as Buyer.",
}: Props) => {
  const [quantity, setQuantity] = useState(100);
  const [price, setPrice] = useState(10000);
  const [buyerChoice, setBuyerChoice] = useState<BuyerChoice>("buyer");
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("onSignature");
  const [settlementDelay, setSettlementDelay] = useState(2);

  useEffect(() => {
    if (buyerChoice === "wallet" && !market.walletBuyer) setBuyerChoice("buyer");
  }, [buyerChoice, market.walletBuyer]);

  const validDelay = Number.isInteger(settlementDelay) && settlementDelay >= 1 && settlementDelay <= 60;
  const delayInvalid = settlementMode === "atTime" && !validDelay;
  const demoProposeDisabled = busy || delayInvalid || (buyerChoice === "wallet" && !market.walletBuyer);
  const terms: Terms = {
    quantity,
    price,
    buyerChoice,
    settlementMode,
    settlementDelay: settlementMode === "atTime" ? settlementDelay : undefined,
  };

  return (
    <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
      <h2 className="font-bold text-lg mb-1">Trade ticket</h2>
      <p className="text-xs text-base-content/70 mb-3">{caption}</p>
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-base-content/70" htmlFor="trade-quantity">
            Quantity (security)
          </label>
          <input
            id="trade-quantity"
            type="number"
            min={1}
            className="input input-bordered w-28"
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-base-content/70" htmlFor="trade-price">
            Price (stablecoin)
          </label>
          <input
            id="trade-price"
            type="number"
            min={1}
            className="input input-bordered w-32"
            value={price}
            onChange={e => setPrice(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-base-content/70" htmlFor="trade-buyer">
            Buyer
          </label>
          <select
            id="trade-buyer"
            className="select select-bordered"
            value={buyerChoice}
            onChange={e => setBuyerChoice(e.target.value as BuyerChoice)}
          >
            <option value="buyer">Buyer</option>
            <option value="unverifiedBuyer">Unverified Buyer</option>
            {market.walletBuyer && <option value="wallet">My wallet ({market.walletBuyer.accountId})</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-base-content/70" htmlFor="settlement-mode">
            Settlement
          </label>
          <select
            id="settlement-mode"
            className="select select-bordered"
            value={settlementMode}
            onChange={e => setSettlementMode(e.target.value as SettlementMode)}
          >
            <option value="onSignature">On the Buyer&apos;s signature</option>
            <option value="atTime">At a set time</option>
          </select>
        </div>
        {settlementMode === "atTime" && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-base-content/70" htmlFor="settlement-delay">
              Minutes from now
            </label>
            <input
              id="settlement-delay"
              type="number"
              min={1}
              max={60}
              className="input input-bordered w-24"
              value={settlementDelay}
              onChange={e => setSettlementDelay(Number(e.target.value))}
            />
          </div>
        )}
      </div>
      {settlementMode === "atTime" && (
        <p className="text-xs text-base-content/60 mb-4">
          Stands in for a real settlement date such as T+1, shortened to minutes so it can be watched.
        </p>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          id="propose-trade"
          className="btn btn-primary"
          disabled={demoProposeDisabled}
          onClick={() => onPropose(terms, "demo")}
        >
          {busy ? "Proposing…" : "Propose as demo Seller"}
        </button>
        {market.walletSeller && (
          <button
            id="propose-trade-wallet"
            className="btn btn-secondary"
            disabled={demoProposeDisabled || !walletSellerReady}
            onClick={() => onPropose(terms, "wallet")}
          >
            {busy ? "Proposing…" : `Propose as my wallet (${market.walletSeller.accountId})`}
          </button>
        )}
      </div>
      {children}
    </section>
  );
};
