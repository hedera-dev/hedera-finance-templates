import { formatDate, formatNumber } from "./formatters";
import type { BondTerms } from "~~/types/ats";
import { hashscanContractUrl } from "~~/utils/ats/hashscan";

const Term = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-base-content/50 text-xs">{label}</div>
    <div>{value}</div>
  </div>
);

export const BondCard = ({ bond }: { bond: BondTerms }) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-lg">
            {bond.name} ({bond.symbol})
          </h2>
          <p className="text-sm text-base-content/60 m-0">The tokenised bond, read live from the contract.</p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-base-content/50">Bond address</dt>
            <dd id="bond-address" className="break-all">
              <a
                href={hashscanContractUrl(bond.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="link link-primary"
              >
                {bond.address}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-base-content/50">Hedera contract id</dt>
            <dd id="bond-contract-id">
              <a
                href={hashscanContractUrl(bond.contractId)}
                target="_blank"
                rel="noopener noreferrer"
                className="link link-primary"
              >
                {bond.contractId}
              </a>
            </dd>
          </div>
        </dl>

        <div id="bond-terms" className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <Term label="ISIN" value={bond.isin} />
          <Term label="Currency" value={bond.currency} />
          <Term label="Face value" value={`${formatNumber(bond.faceValue)} ${bond.currency}`} />
          <Term label="Start date" value={formatDate(bond.startingDateIso)} />
          <Term label="Maturity date" value={formatDate(bond.maturityDateIso)} />
        </div>

        {bond.chainRead ? null : (
          <p className="text-sm text-warning m-0">
            The network could not be read just now: these are the terms recorded when the bond was issued, and the
            issued total is unavailable.
          </p>
        )}

        <div id="bond-supply" className="flex gap-4 text-sm">
          <span>
            <span className="text-base-content/50">Issued:</span> {formatNumber(bond.totalSupply)}
          </span>
          <span>
            <span className="text-base-content/50">Max supply:</span> {formatNumber(bond.maxSupply)}
          </span>
        </div>
      </div>
    </div>
  );
};
