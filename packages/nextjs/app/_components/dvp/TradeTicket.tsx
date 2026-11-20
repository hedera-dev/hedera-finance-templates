"use client";

import { useState } from "react";
import type { DvpDeskHook, TradeTerms } from "./useDesk";
import type { PartyId } from "~~/services/dvp/types";

type Props = {
  desk: DvpDeskHook;
  onResult: (text: string) => void;
};

/** The terms. Nothing here moves a token: proposing records them on the settlement contract. */
export function TradeTicket({ desk, onResult }: Props) {
  const { state, propose, busyKey } = desk;
  const defaults = state?.defaults;
  const [terms, setTerms] = useState<TradeTerms>({
    quantity: defaults?.quantity ?? "100",
    price: defaults?.price ?? "10000",
    buyer: "buyer",
    settlementMode: "immediate",
    delayMinutes: String(defaults?.defaultDelayMinutes ?? 2),
  });

  const set = <K extends keyof TradeTerms>(key: K, value: TradeTerms[K]) => setTerms(t => ({ ...t, [key]: value }));

  const submit = async () => {
    const result = await propose(terms);
    onResult(
      result.ok
        ? `Proposed trade ${result.tradeId}. Neither leg is pledged yet, and no balance has changed.`
        : `The proposal was refused: ${result.result}${result.message ? ` — ${result.message}` : ""}`,
    );
  };

  return (
    <section id="ticket" className="card bg-base-100 border border-base-300 shadow-none">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold">Propose a trade</h2>
          <p className="m-0 text-xs text-base-content/60">
            The Seller sells security for cash. Proposing moves nothing: each side pledges its own leg next.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text text-xs mb-1">Quantity (security units)</span>
            <input
              id="trade-quantity"
              type="number"
              min={1}
              step={1}
              className="input input-sm input-bordered"
              value={terms.quantity}
              onChange={e => set("quantity", e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs mb-1">Price (total cash)</span>
            <input
              id="trade-price"
              type="number"
              min={1}
              step={1}
              className="input input-sm input-bordered"
              value={terms.price}
              onChange={e => set("price", e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs mb-1">Buyer</span>
            <select
              id="trade-buyer"
              className="select select-sm select-bordered"
              value={terms.buyer}
              onChange={e => set("buyer", e.target.value as PartyId)}
            >
              <option value="buyer">Buyer</option>
              <option value="unverified">Unverified Buyer</option>
            </select>
          </label>
          <label className="form-control">
            <span className="label-text text-xs mb-1">Settlement</span>
            <select
              id="settlement-mode"
              className="select select-sm select-bordered"
              value={terms.settlementMode}
              onChange={e => set("settlementMode", e.target.value as TradeTerms["settlementMode"])}
            >
              <option value="immediate">As soon as both legs are pledged</option>
              <option value="delayed">Not before a set time</option>
            </select>
          </label>
          {terms.settlementMode === "delayed" && (
            <label className="form-control sm:col-span-2">
              <span className="label-text text-xs mb-1">Minutes from now</span>
              <input
                id="settlement-delay"
                type="number"
                min={1}
                max={defaults?.maxDelayMinutes ?? 60}
                step={1}
                className="input input-sm input-bordered"
                value={terms.delayMinutes}
                onChange={e => set("delayMinutes", e.target.value)}
              />
              <span className="text-xs text-base-content/60 mt-1">
                This stands in for a settlement date such as T+1, shortened so it can be watched.
              </span>
            </label>
          )}
        </div>

        <button
          id="propose-trade"
          type="button"
          className="btn btn-primary btn-sm self-start"
          disabled={busyKey === "propose"}
          onClick={submit}
        >
          {busyKey === "propose" && <span className="loading loading-spinner loading-xs" />}
          Propose as Seller
        </button>
      </div>
    </section>
  );
}
