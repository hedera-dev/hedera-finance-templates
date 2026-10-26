import { InvestorRow } from "./InvestorRow";
import type { InvestorView } from "~~/types/ats";

type Props = {
  /** The last action's refusal or failure, shown in `#action-error`. */
  actionError?: string | null;
  investors: InvestorView[];
  busyAddress: string | null;
  onApprove: (address: string) => void;
  onRevoke: (address: string) => void;
  onIssue: (address: string, amount: number) => void;
};

export const InvestorsCard = ({ investors, busyAddress, onApprove, onRevoke, onIssue, actionError }: Props) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-lg">Investors</h2>
          <p className="text-sm text-base-content/60 m-0">Only approved investors may hold the bond.</p>
        </div>

        {actionError ? (
          <p id="action-error" className="text-sm text-error m-0" role="alert">
            {actionError}
          </p>
        ) : null}

        <ul id="investors" className="flex flex-col gap-3">
          {investors.length === 0 ? (
            <li className="text-sm text-base-content/50">No investors yet.</li>
          ) : (
            investors.map(investor => (
              <InvestorRow
                key={investor.address}
                investor={investor}
                busy={busyAddress === investor.address}
                onApprove={() => onApprove(investor.address)}
                onRevoke={() => onRevoke(investor.address)}
                onIssue={amount => onIssue(investor.address, amount)}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  );
};
