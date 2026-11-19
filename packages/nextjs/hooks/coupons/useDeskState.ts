"use client";

import { useQuery } from "@tanstack/react-query";
import type { DemoInvestor, Stablecoin, TourBonds } from "~~/services/coupons/state";

// Re-exported as types only: this file never imports server code, just shapes.

export type DeskStateResponse = {
  configError: string | null;
  factory: { address: `0x${string}` } | null;
  stablecoin: Stablecoin | null;
  investors: DemoInvestor[];
  currentBond: `0x${string}` | null;
  tourBonds: TourBonds;
};

/** Polls desk-wide state: factory address, config health, the stablecoin, investors, current bond. */
export function useDeskState() {
  return useQuery({
    queryKey: ["coupon-desk-state"],
    queryFn: async (): Promise<DeskStateResponse> => {
      const res = await fetch("/api/hedera/coupons/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load desk state");
      return res.json();
    },
    refetchInterval: 5000,
  });
}
