import { InvestorRow } from "./InvestorRow";
import { Refusal } from "./TourParts";
import type { ActionResult, InvestorView } from "~~/types/ats";

type Props = {
  /** The last action's refusal or failure, shown decoded in `#action-error`. */
  actionResult?: ActionResult | null;
  investors: InvestorView[];
  busyAddress: string | null;
  onApprove: (address: string) => void;
  onRevoke: (address: string) => void;
  onIssue: (address: string, amount: number) => void;
};

export const InvestorsCard = ({ investors, busyAddress, onApprove, onRevoke, onIssue, actionResult }: Props) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-lg">Investors</h2>
          <p className="text-sm text-base-content/60 m-0">Only approved investors may hold the bond.</p>
        </div>

        <Refusal id="action-error" result={actionResult ?? null} />

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
