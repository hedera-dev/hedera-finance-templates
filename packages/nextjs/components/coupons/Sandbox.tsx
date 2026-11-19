"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { BondOverviewCard } from "~~/components/coupons/BondOverviewCard";
import { CouponHistoryCard } from "~~/components/coupons/CouponHistoryCard";
import { IssueBondForm } from "~~/components/coupons/IssueBondForm";
import { PositionsFundingCard } from "~~/components/coupons/PositionsFundingCard";
import { ScheduleControlsCard } from "~~/components/coupons/ScheduleControlsCard";
import { SetupCard } from "~~/components/coupons/SetupCard";
import { WalletInvestorCard } from "~~/components/coupons/WalletInvestorCard";
import { useBond } from "~~/hooks/coupons/useBond";
import { useDeskState } from "~~/hooks/coupons/useDeskState";

/** Every control on one page: any terms, any bond, the wallet investor. */
export function Sandbox() {
  const desk = useDeskState();
  const { isConnected } = useAccount();
  const [localBond, setLocalBond] = useState<`0x${string}` | undefined>(undefined);
  const [walletInvestor, setWalletInvestor] = useState<{ evmAddress: `0x${string}` } | null>(null);

  const bondAddress = localBond ?? desk.data?.currentBond ?? undefined;
  const bond = useBond(bondAddress);

  useEffect(() => {
    if (!isConnected) setWalletInvestor(null);
  }, [isConnected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="flex flex-col gap-4">
        <SetupCard desk={desk.data} onDone={() => desk.refetch()} />
        <IssueBondForm
          desk={desk.data}
          onIssued={address => {
            setLocalBond(address);
            desk.refetch();
          }}
        />
        <PositionsFundingCard
          bondAddress={bondAddress}
          bond={bond.data}
          investors={desk.data?.investors ?? []}
          walletInvestor={walletInvestor}
          stablecoin={desk.data?.stablecoin}
          onRefetchBond={bond.refetch}
        />
      </div>

      <div className="flex flex-col gap-4">
        {bondAddress ? (
          <BondOverviewCard bondAddress={bondAddress} bond={bond.data} />
        ) : (
          <div className="card bg-base-100 shadow border border-base-300">
            <div className="card-body gap-2 !p-4">
              <h3 className="card-title text-base">Nothing issued yet</h3>
              <p className="text-sm text-base-content/70 m-0">
                Once you issue a bond, its terms, status, schedule and coupon history will appear here, read live from
                the network.
              </p>
            </div>
          </div>
        )}
        <ScheduleControlsCard bondAddress={bondAddress} bond={bond.data} onRefetchBond={bond.refetch} />
        <WalletInvestorCard
          stablecoin={desk.data?.stablecoin}
          walletInvestor={walletInvestor}
          onAdd={addr => setWalletInvestor({ evmAddress: addr })}
        />
        {bondAddress && (
          <CouponHistoryCard bondAddress={bondAddress} stablecoinDecimals={desk.data?.stablecoin?.decimals ?? 6} />
        )}
      </div>
    </div>
  );
}
