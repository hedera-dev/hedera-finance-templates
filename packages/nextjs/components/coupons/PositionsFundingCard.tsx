"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { hederaTestnet } from "viem/chains";
import { useGasPrice, useReadContract } from "wagmi";
import type { BondData } from "~~/hooks/coupons/useBond";
import { useMirrorAccount } from "~~/hooks/coupons/useMirrorAccount";
import type { DemoInvestor, Stablecoin } from "~~/services/coupons/state";
import { couponBondAbi } from "~~/utils/coupons/abi";
import { hbarNeededFor } from "~~/utils/coupons/constants";
import { wholeNumberText } from "~~/utils/coupons/numberField";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-hbar";

type Row = { key: string; label: string; evmAddress: `0x${string}`; defaultUnits: number };

type Props = {
  bondAddress?: `0x${string}`;
  bond?: BondData;
  investors: DemoInvestor[];
  walletInvestor: { evmAddress: `0x${string}` } | null;
  stablecoin: Stablecoin | null | undefined;
  onRefetchBond: () => void;
};

function InvestorRow({
  row,
  stablecoin,
  bondAddress,
  bondStatus,
  onAllocated,
}: {
  row: Row;
  stablecoin: Stablecoin | null | undefined;
  bondAddress?: `0x${string}`;
  bondStatus?: string;
  onAllocated: () => void;
}) {
  const mirror = useMirrorAccount(row.evmAddress, stablecoin?.tokenId);
  const [unitsText, setUnitsText] = useState(String(row.defaultUnits));
  const [isAllocating, setIsAllocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On-chain allocation, shown while the bond can still be edited so Allocate has a visible result.
  const allocated = useReadContract({
    address: bondAddress,
    abi: couponBondAbi,
    functionName: "unitsOf",
    args: [row.evmAddress],
    query: { enabled: Boolean(bondAddress), refetchInterval: 4000 },
  });

  // Coupon money this holder could not be sent — an unassociated account, say. Kept by the
  // bond rather than lost, and payable once they can receive it.
  const owed = useReadContract({
    address: bondAddress,
    abi: couponBondAbi,
    functionName: "unpaidOf",
    args: [row.evmAddress],
    query: { enabled: Boolean(bondAddress), refetchInterval: 4000 },
  });
  const owedAmount = (owed.data as bigint | undefined) ?? 0n;
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaim = async () => {
    if (!bondAddress) return;
    setIsClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/api/hedera/coupons/bonds/${bondAddress}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder: row.evmAddress }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to pay what is owed");
      owed.refetch();
      onAllocated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pay what is owed");
    } finally {
      setIsClaiming(false);
    }
  };

  const canAllocate = bondAddress && bondStatus === "CREATED";
  const units = unitsText === "" ? null : Math.max(0, Math.round(Number(unitsText)));

  const handleAllocate = async () => {
    if (!bondAddress || units === null || Number.isNaN(units)) return;
    setIsAllocating(true);
    setError(null);
    try {
      const res = await fetch(`/api/hedera/coupons/bonds/${bondAddress}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder: row.evmAddress, units }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to allocate");
      onAllocated();
      allocated.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to allocate");
    } finally {
      setIsAllocating(false);
    }
  };

  const balance = stablecoin && mirror.data ? formatUnits(mirror.data.tokenBalance, stablecoin.decimals) : undefined;

  return (
    <div
      className="investor-row flex flex-col gap-2 py-3 border-b border-base-300 last:border-b-0"
      data-address={row.evmAddress}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold m-0">{row.label}</p>
          <a
            href={getBlockExplorerAddressLink(hederaTestnet, row.evmAddress)}
            target="_blank"
            rel="noreferrer"
            className="link text-xs break-all block no-underline hover:underline"
          >
            {row.evmAddress}
          </a>
          <p className="text-xs text-base-content/60 m-0">
            Hedera account: {mirror.isLoading ? "resolving…" : (mirror.data?.accountId ?? "pending")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-base-content/60 m-0">Stablecoin balance</p>
          <p className="font-mono m-0">{balance ?? "0"}</p>
        </div>
      </div>
      {bondAddress && (
        <p className="text-xs text-base-content/60 m-0">
          Allocated units: {allocated.data !== undefined ? Number(allocated.data) : "…"}
        </p>
      )}
      {canAllocate && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-base-content/60" htmlFor={`units-${row.key}`}>
            Units
          </label>
          <input
            id={`units-${row.key}`}
            type="text"
            inputMode="numeric"
            className="investor-units input input-bordered input-sm w-24"
            value={unitsText}
            onChange={e => setUnitsText(wholeNumberText(e.target.value))}
          />
          <button
            type="button"
            className="investor-allocate btn btn-sm btn-primary"
            disabled={isAllocating || units === null || Number.isNaN(units)}
            onClick={handleAllocate}
          >
            {isAllocating ? "Allocating…" : "Allocate"}
          </button>
        </div>
      )}
      {owedAmount > 0n && (
        <div className="investor-owed flex flex-wrap items-center gap-2 text-xs">
          <span className="text-warning">
            Owed {formatUnits(owedAmount, stablecoin?.decimals ?? 6)} {stablecoin?.symbol ?? "mUSD"} from a coupon this
            holder could not receive.
          </span>
          <button type="button" className="investor-claim btn btn-xs" disabled={isClaiming} onClick={handleClaim}>
            {isClaiming ? "Paying…" : "Pay what is owed"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-error m-0">{error}</p>}
    </div>
  );
}

/** "Positions and funding": allocate units to holders, then fund the bond. */
export function PositionsFundingCard({
  bondAddress,
  bond,
  investors,
  walletInvestor,
  stablecoin,
  onRefetchBond,
}: Props) {
  const rows: Row[] = useMemo(() => {
    const demo = investors.map(i => ({
      key: i.id,
      label: i.label,
      evmAddress: i.evmAddress,
      defaultUnits: i.defaultUnits,
    }));
    const wallet = walletInvestor
      ? [{ key: "wallet", label: "Your wallet", evmAddress: walletInvestor.evmAddress, defaultUnits: 1 }]
      : [];
    return [...demo, ...wallet];
  }, [investors, walletInvestor]);

  const bondMirror = useMirrorAccount(bondAddress, stablecoin?.tokenId);
  const { data: gasPrice } = useGasPrice({ chainId: hederaTestnet.id });
  const [fundText, setFundText] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  const decimals = stablecoin?.decimals ?? 6;
  const stablecoinHeld = bondMirror.data?.tokenBalance ?? 0n;
  const stablecoinNeeded = bond?.stablecoinNeeded ?? 0n;
  const stablecoinMissing = stablecoinNeeded > stablecoinHeld ? stablecoinNeeded - stablecoinHeld : 0n;
  const stablecoinMissingWhole = Math.ceil(Number(formatUnits(stablecoinMissing, decimals)));

  const remainingCoupons =
    bond?.statusIndex === 0
      ? Number(bond.couponCount)
      : bond?.statusIndex === 1
        ? Number(bond.couponCount) - Number(bond.currentCoupon) + 1
        : 0;
  const hbarNeeded =
    bond && gasPrice
      ? Number(formatUnits(hbarNeededFor(BigInt(remainingCoupons), bond.holdersCount, gasPrice), 18))
      : null;
  // null means the balance has not been read, which is not the same as holding none: the
  // card says so rather than showing a funded bond as empty.
  const hbarHeld = bond?.hbarBalance != null ? Number(formatUnits(bond.hbarBalance, 18)) : null;
  const hbarMissing = hbarHeld === null || hbarNeeded === null ? null : Math.max(0, hbarNeeded - hbarHeld);

  const fundField = fundText ?? String(stablecoinMissingWhole);
  const fundWhole = fundField === "" ? null : Math.max(0, Math.round(Number(fundField)));

  const handleFund = async () => {
    if (!bondAddress) return;
    setIsFunding(true);
    setFundError(null);
    try {
      const res = await fetch(`/api/hedera/coupons/bonds/${bondAddress}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stablecoinWhole: fundWhole ?? 0 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to fund bond");
      onRefetchBond();
      bondMirror.refetch();
      setFundText(null);
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Failed to fund bond");
    } finally {
      setIsFunding(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow border border-base-300">
      <div className="card-body gap-2 !p-4">
        <div>
          <h3 className="card-title text-base">Positions and funding</h3>
          <p className="text-sm text-base-content/70 m-0">
            Allocate units to each holder, then fund the bond with the stablecoin and HBAR it needs to pay itself.
          </p>
        </div>

        <div id="investors">
          {rows.length === 0 && <p className="text-sm text-base-content/60">Set up the desk to see investors here.</p>}
          {rows.map(row => (
            <InvestorRow
              key={row.key}
              row={row}
              stablecoin={stablecoin}
              bondAddress={bondAddress}
              bondStatus={bond?.status}
              onAllocated={onRefetchBond}
            />
          ))}
        </div>

        {bondAddress && (
          <div id="funding" className="flex flex-col gap-2 pt-2 border-t border-base-300">
            <p className="text-sm text-base-content/70 m-0">
              Needs{" "}
              {stablecoinMissingWhole > 0
                ? `${stablecoinMissingWhole} ${stablecoin?.symbol ?? "mUSD"}`
                : "no more stablecoin"}{" "}
              and{" "}
              {hbarMissing === null
                ? "an unread amount of HBAR"
                : hbarMissing > 0
                  ? `${hbarMissing.toFixed(2)} HBAR`
                  : "no more HBAR"}{" "}
              · holds {formatUnits(stablecoinHeld, decimals)} {stablecoin?.symbol ?? "mUSD"} and{" "}
              {hbarHeld === null ? "an HBAR balance that could not be read" : `${hbarHeld.toFixed(2)} HBAR`}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-base-content/60" htmlFor="fund-amount">
                  Stablecoin to send
                </label>
                <input
                  id="fund-amount"
                  type="text"
                  inputMode="numeric"
                  className="input input-bordered input-sm w-32"
                  value={fundField}
                  onChange={e => setFundText(wholeNumberText(e.target.value))}
                />
              </div>
              <button
                id="fund-bond"
                type="button"
                className="btn btn-secondary btn-sm self-end"
                disabled={isFunding || fundWhole === null || Number.isNaN(fundWhole)}
                onClick={handleFund}
              >
                {isFunding ? "Funding…" : "Fund bond"}
              </button>
            </div>
            {fundError && <p className="text-xs text-error m-0">{fundError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
