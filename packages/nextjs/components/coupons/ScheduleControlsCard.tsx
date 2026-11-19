"use client";

import { useEffect, useState } from "react";
import { hederaTestnet } from "viem/chains";
import { useGasPrice } from "wagmi";
import type { BondData } from "~~/hooks/coupons/useBond";
import { hbarNeededFor } from "~~/utils/coupons/constants";

type Props = {
  bondAddress?: `0x${string}`;
  bond?: BondData;
  onRefetchBond: () => void;
};

export function ScheduleControlsCard({ bondAddress, bond, onRefetchBond }: Props) {
  const [pending, setPending] = useState<"start" | "stop" | "pay-now" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { data: gasPrice } = useGasPrice({ chainId: hederaTestnet.id });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const call = async (action: "start" | "stop" | "pay-now") => {
    if (!bondAddress) return;
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/hedera/coupons/bonds/${bondAddress}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Failed to ${action}`);
      onRefetchBond();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setPending(null);
    }
  };

  // "the bond holds HBAR for its schedules": before `start()`, that's every coupon ahead of it.
  const hbarNeeded = bond && gasPrice ? hbarNeededFor(bond.couponCount, bond.holdersCount, gasPrice) : 0n;
  const hbarKnown = bond?.hbarBalance !== null && bond?.hbarBalance !== undefined && gasPrice !== undefined;
  const canStart = bond?.status === "CREATED" && bond.holdersCount > 0 && hbarKnown && bond.hbarBalance! >= hbarNeeded;
  const canStop = bond?.status === "RUNNING";
  const isDue = bond ? now >= Number(bond.dueTime) * 1000 : false;
  const canPayNow = bond?.status === "RUNNING" && isDue;

  return (
    <div className="card bg-base-100 shadow border border-base-300">
      <div className="card-body gap-2 !p-4">
        <div>
          <h3 className="card-title text-base">Schedule controls</h3>
          <p className="text-sm text-base-content/70 m-0">
            Start lets the bond schedule and pay its own coupons; nobody presses anything after that.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            id="start-schedule"
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canStart || pending !== null}
            onClick={() => call("start")}
          >
            {pending === "start" ? "Starting…" : "Start coupons"}
          </button>
          <button
            id="stop-schedule"
            type="button"
            className="btn btn-error btn-sm"
            disabled={!canStop || pending !== null}
            onClick={() => call("stop")}
          >
            {pending === "stop" ? "Stopping…" : "Stop schedule"}
          </button>
          {bond?.status === "RUNNING" && (
            <button
              id="pay-now"
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!canPayNow || pending !== null}
              onClick={() => call("pay-now")}
            >
              {pending === "pay-now" ? "Paying…" : "Pay due coupon"}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-error m-0">{error}</p>}
      </div>
    </div>
  );
}
