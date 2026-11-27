"use client";

import type { ReactNode } from "react";
import { Label, Panel } from "./TourParts";
import { formatUnits } from "viem";
import { hederaTestnet } from "viem/chains";
import type { BondData } from "~~/hooks/coupons/useBond";
import { useMirrorContractId } from "~~/hooks/coupons/useMirrorContractId";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-hbar";

type Props = {
  bondAddress: `0x${string}`;
  bond?: BondData;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** A status the reader can take a colour from: running is the one that means the network is working. */
const STATUS_BADGE: Record<string, string> = {
  CREATED: "badge-ghost",
  RUNNING: "badge-primary",
  MATURED: "badge-success",
  STOPPED: "badge-warning",
};

/** A term and its value, read as a pair rather than as two stacked lines. */
function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <Label>{name}</Label>
      <p className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

/**
 * An address stays in the DOM whole — the spec and the harness read it — but is never allowed to
 * set the card's width: `truncate` ellipsises it, and the title attribute gives it back on hover.
 */
function AddressLine({ id, address, children }: { id: string; address: string; children?: ReactNode }) {
  return (
    <a
      id={id}
      href={getBlockExplorerAddressLink(hederaTestnet, address)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="link link-hover font-mono text-xs block truncate"
    >
      {children ?? address}
    </a>
  );
}

export function BondOverviewCard({ bondAddress, bond }: Props) {
  const { data: contractId } = useMirrorContractId(bondAddress);

  return (
    <Panel title={bond?.name ?? "Bond"} caption="What the network is doing with this bond right now.">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Label>Address</Label>
          <AddressLine id="bond-address" address={bondAddress} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <Label>Contract id</Label>
          {contractId ? (
            <AddressLine id="bond-contract-id" address={bondAddress}>
              {contractId}
            </AddressLine>
          ) : (
            <span id="bond-contract-id" className="text-xs text-base-content/60">
              resolving…
            </span>
          )}
        </div>
      </div>

      {bond && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-base-300 pt-3">
          <Term name="Face value">{bond.faceValue.toString()}</Term>
          <Term name="Coupon rate">{(Number(bond.couponRateBps) / 100).toFixed(2)}%</Term>
          <Term name="Period">{(Number(bond.periodSeconds) / 60).toFixed(0)} min</Term>
          <Term name="Coupons">{bond.couponCount.toString()}</Term>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3">
        <Label>Status</Label>
        <span id="bond-status" className={`badge badge-sm font-semibold ${STATUS_BADGE[bond?.status ?? ""] ?? ""}`}>
          {bond?.status ?? "…"}
        </span>
      </div>

      {bond?.status === "RUNNING" && (
        <div className="flex flex-col gap-3 rounded-box bg-primary/10 border border-primary/30 p-3 min-w-0">
          <div className="flex flex-col gap-0.5">
            <Label>Next coupon</Label>
            <p id="next-coupon" className="m-0 text-sm font-semibold">
              #{bond.currentCoupon.toString()} due {new Date(Number(bond.dueTime) * 1000).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <Label>Schedule</Label>
            {bond.currentSchedule.toLowerCase() === ZERO_ADDRESS ? (
              <span id="schedule-address" className="text-xs text-warning">
                scheduling failed — use Pay due coupon
              </span>
            ) : (
              <AddressLine id="schedule-address" address={bond.currentSchedule} />
            )}
          </div>
        </div>
      )}

      {bond && (
        <p className="m-0 text-xs text-base-content/60">
          Owes <strong className="font-semibold">{formatUnits(bond.stablecoinNeeded, 6)}</strong> stablecoin in total
          across every remaining coupon and principal.
        </p>
      )}
    </Panel>
  );
}
