"use client";

import { Panel } from "./TourParts";
import { formatUnits } from "viem";
import { hederaTestnet } from "viem/chains";
import { useCouponHistory } from "~~/hooks/coupons/useCouponHistory";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar";

type Props = {
  bondAddress: `0x${string}`;
  stablecoinDecimals: number;
};

const OUTCOME_BADGE: Record<string, string> = {
  MISSED: "badge-warning",
  "PRINCIPAL REPAID": "badge-success",
};

export function CouponHistoryCard({ bondAddress, stablecoinDecimals }: Props) {
  const { data: entries, isLoading } = useCouponHistory(bondAddress);
  const empty = !isLoading && (!entries || entries.length === 0);

  return (
    <Panel
      title="Coupon history"
      caption="Read straight from the bond's events on the mirror node — nobody on this page triggers these."
    >
      <div id="coupons" className="flex flex-col">
        {isLoading && (
          <p className="m-0 flex items-center gap-2 text-sm text-base-content/60">
            <span className="loading loading-spinner loading-xs" aria-hidden />
            Loading…
          </p>
        )}
        {empty && (
          <p className="m-0 rounded-box border border-dashed border-base-300 px-4 py-6 text-center text-sm text-base-content/60">
            No coupons have been paid yet. The first one lands on its own, at the due time above.
          </p>
        )}
        {entries?.map(entry => (
          <div
            key={entry.key}
            className="coupon-entry flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-b border-base-300 last:border-b-0"
          >
            <span className="font-semibold text-sm">Coupon #{entry.coupon}</span>
            <span className={`badge badge-sm ${OUTCOME_BADGE[entry.outcome] ?? "badge-info"}`}>{entry.outcome}</span>
            <span className="font-mono text-sm font-semibold ml-auto">
              {entry.totalPaid !== undefined ? formatUnits(entry.totalPaid, stablecoinDecimals) : "0"}
            </span>
            <span className="basis-full text-xs text-base-content/60 flex flex-wrap gap-x-2">
              {new Date(entry.consensusTime).toLocaleString()}
              <a
                href={getBlockExplorerTxLink(hederaTestnet.id, entry.txHash)}
                target="_blank"
                rel="noreferrer"
                className="link link-hover"
              >
                View on HashScan
              </a>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
