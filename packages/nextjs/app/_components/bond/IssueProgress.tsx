import type { StepsState } from "./useBondDesk";
import type { IssueStepId } from "~~/types/ats";

const STEP_ORDER: IssueStepId[] = ["version", "deploy", "investors", "verify"];

const STEP_LABEL: Record<IssueStepId, string> = {
  version: "Resolve the bond configuration version",
  deploy: "Deploy through the ATS factory",
  investors: "Create the demo investors",
  verify: "Read the bond back",
};

const STEP_EXPLANATION: Record<IssueStepId, string> = {
  version: "Asks the business-logic resolver which version of the bond configuration to build against.",
  deploy: "Calls deployBond on the ATS v8 testnet factory to create the bond as an ERC-1400 security.",
  investors: "Creates two demo Hedera accounts so there is someone to approve and issue to.",
  verify: "Reads the bond's terms and supply back from the deployed contract to confirm it matches the form.",
};

const StatusIcon = ({ status }: { status: StepsState[IssueStepId]["status"] }) => {
  if (status === "active") return <span className="loading loading-spinner loading-xs" aria-hidden />;
  if (status === "done") return <span className="text-success">✓</span>;
  if (status === "failed") return <span className="text-error">✕</span>;
  return <span className="text-base-content/40">○</span>;
};

export const IssueProgress = ({ steps }: { steps: StepsState }) => {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {STEP_ORDER.map(stepId => {
          const state = steps[stepId];
          return (
            <li
              key={stepId}
              id={`issue-step-${stepId}`}
              data-status={state.status}
              className="flex items-start gap-2 text-sm"
            >
              <span className="w-4 text-center shrink-0 mt-0.5">
                <StatusIcon status={state.status} />
              </span>
              <span className={state.status === "pending" ? "text-base-content/50" : ""}>
                {STEP_LABEL[stepId]}
                {state.status === "done" && state.detail ? (
                  <span className="block text-base-content/60 text-xs mt-0.5 break-all">{state.detail}</span>
                ) : null}
                {state.status === "failed" && state.error ? (
                  <span className="block text-error text-xs mt-0.5">{state.error}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <details className="collapse collapse-arrow bg-base-200 rounded-lg">
        <summary className="collapse-title text-sm font-medium py-2 min-h-0">What each step does</summary>
        <div className="collapse-content">
          <ul className="text-xs text-base-content/70 flex flex-col gap-1.5 pt-1">
            {STEP_ORDER.map(stepId => (
              <li key={stepId}>
                <span className="font-medium text-base-content/90">{STEP_LABEL[stepId]}:</span>{" "}
                {STEP_EXPLANATION[stepId]}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
};
