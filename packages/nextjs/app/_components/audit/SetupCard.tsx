"use client";

import type { StepState } from "~~/hooks/hcsAudit/useAuditDesk";
import type { DeskState, SetupStepId } from "~~/services/hcsAudit/types";

const STEP_META: Record<SetupStepId, { label: string; explain: string }> = {
  topic: {
    label: "Create the audit topic",
    explain: "An HCS topic with a submit key: only the issuer (and anyone it later authorises) can write to it.",
  },
  token: {
    label: "Create the security token",
    explain: "A token with 0 decimals, 1000 units held by the issuer, and KYC + freeze keys the issuer controls.",
  },
  holder: {
    label: "Create a holder account",
    explain: "A demo account, funded with at most 1 HBAR, that the token actions below apply to.",
  },
  associate: {
    label: "Associate the holder with the token",
    explain: "The holder must associate before it can hold the token or be granted KYC.",
  },
};

const STEP_ORDER: SetupStepId[] = ["topic", "token", "holder", "associate"];

function StepMarker({ status }: { status: StepState["status"] }) {
  if (status === "done") return <span className="text-success">✓</span>;
  if (status === "failed") return <span className="text-error">✕</span>;
  if (status === "active") return <span className="loading loading-spinner loading-xs" />;
  return <span className="text-base-content/40">·</span>;
}

type SetupCardProps = {
  configured: boolean;
  deskLoaded: boolean;
  desk: DeskState | null;
  steps: Record<SetupStepId, StepState>;
  setupRunning: boolean;
  setupError: string | null;
  onRunSetup: () => void;
};

export const SetupCard = ({
  configured,
  deskLoaded,
  desk,
  steps,
  setupRunning,
  setupError,
  onRunSetup,
}: SetupCardProps) => {
  const alreadySetUp = Boolean(desk?.topicId);

  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl m-0">Set up the audit trail</h2>
          <p className="text-sm text-base-content/70 mt-1 mb-0 max-w-xl">
            The issuer pays for everything; the whole setup costs a few cents of testnet HBAR. Running it again starts a
            fresh trail on a brand-new topic and token.
          </p>
        </div>
        <button
          id="setup-audit"
          className="btn btn-primary shrink-0"
          disabled={!deskLoaded || !configured || setupRunning}
          onClick={onRunSetup}
        >
          {setupRunning ? "Setting up…" : alreadySetUp ? "Set up audit trail again" : "Set up audit trail"}
        </button>
      </div>

      {deskLoaded && !configured && (
        <p id="config-error" className="text-sm text-error mt-3">
          Set <code>HEDERA_OPERATOR_ID</code> and <code>HEDERA_OPERATOR_KEY</code> in the server environment first.
        </p>
      )}

      <ol className="mt-4 flex flex-col gap-1">
        {STEP_ORDER.map((stepId, i) => {
          const step = steps[stepId];
          return (
            <li
              key={stepId}
              id={`setup-step-${stepId}`}
              data-status={step.status}
              className="flex items-center gap-2 text-sm py-0.5"
            >
              <span className="w-4 text-center">
                {step.status === "pending" ? i + 1 : <StepMarker status={step.status} />}
              </span>
              <span>{STEP_META[stepId].label}</span>
              {step.id && <code className="text-xs bg-base-200 px-1.5 py-0.5 rounded">{step.id}</code>}
              {step.status === "failed" && step.error && <span className="text-error text-xs">{step.error}</span>}
            </li>
          );
        })}
      </ol>

      {setupError && <p className="text-sm text-error mt-2">{setupError}</p>}

      <details className="mt-3">
        <summary className="text-sm cursor-pointer text-base-content/70">What each step does</summary>
        <ul className="mt-2 text-sm text-base-content/70 flex flex-col gap-1 list-disc list-inside">
          {STEP_ORDER.map(stepId => (
            <li key={stepId}>
              <span className="font-medium">{STEP_META[stepId].label}:</span> {STEP_META[stepId].explain}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};
