"use client";

import type { DvpDeskHook, SetupStep, SetupStepId } from "./useDesk";

const STEP_LABELS: Record<SetupStepId, string> = {
  accounts: "Create and fund the three demo parties",
  security: "Deploy the security through the ATS factory",
  cash: "Deploy the stablecoin through the Stablecoin Studio factory",
  contract: "Deploy the settlement contract against the two tokens",
  permissions: "Admit the parties, grant KYC, associate the cash, allow the buyers to pledge it",
  fund: "Deal out the starting position",
};

const MARKS: Record<SetupStep["status"], string> = { pending: "•", active: "…", done: "✓", failed: "✕" };

const COLOURS: Record<SetupStep["status"], string> = {
  pending: "text-base-content/40",
  active: "text-primary",
  done: "text-success",
  failed: "text-error",
};

/** Setup, one line per step, each carrying its state so a reader (or a check) can see where it is. */
export function SetupPanel({ desk }: { desk: DvpDeskHook }) {
  const { state, setupSteps, isSettingUp, runSetup } = desk;
  const configured = state?.configured ?? false;
  const done = state?.setupComplete ?? false;

  return (
    <section className="card bg-base-100 border border-base-300 shadow-none">
      <div className="card-body gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold">Set up the market</h2>
          <p className="m-0 text-xs text-base-content/60">
            Deploys a security, a stablecoin and the settlement contract, then deals out a starting position. It costs
            testnet HBAR — most of it the two tokens.
          </p>
        </div>

        {!configured && state && (
          <p id="config-error" className="m-0 text-sm text-error">
            {state.configError ?? `Set ${state.missing.join(" and ")} to configure the issuer.`}
          </p>
        )}

        <ol className="m-0 p-0 list-none flex flex-col gap-1 text-sm">
          {setupSteps.map(step => (
            <li key={step.id} id={`setup-step-${step.id}`} data-status={step.status} className="flex gap-2 items-start">
              <span className={`${COLOURS[step.status]} w-4 shrink-0 text-center`} aria-hidden>
                {MARKS[step.status]}
              </span>
              <span className="flex flex-col">
                <span>{STEP_LABELS[step.id]}</span>
                {step.detail && <span className="text-xs text-base-content/60 font-mono">{step.detail}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            id="setup-market"
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!configured || isSettingUp}
            onClick={runSetup}
          >
            {isSettingUp && <span className="loading loading-spinner loading-xs" />}
            {done ? "Set up a fresh market" : "Set up market"}
          </button>
          {done && <span className="text-xs text-success">The market is live.</span>}
        </div>
      </div>
    </section>
  );
}
