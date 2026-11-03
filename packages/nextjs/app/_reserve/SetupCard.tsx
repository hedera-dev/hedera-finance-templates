"use client";

import { useState } from "react";
import { post } from "./api";
import { Card, Spinner } from "./ui";
import type { ReserveSnapshot, SetupStep, StepId } from "~~/types/reserve";

const STEP_COPY: Record<StepId, { label: string; explanation: string }> = {
  version: {
    label: "Resolve the ATS configuration version",
    explanation:
      "Asks the Business Logic Resolver for the bond configuration's latest version. Version 0 reverts, so it has to be looked up first.",
  },
  collateral: {
    label: "Deploy the collateral token",
    explanation:
      "Creates a 0-decimal ATS token through the ATS factory. One unit stands for one custodied BTC; its balance in the reserve address is the reserve.",
  },
  asset: {
    label: "Deploy the asset token",
    explanation:
      "Creates the tokenised asset through the same factory: $1,000.00 face value per unit, a maximum supply, and an allowlist control list.",
  },
  gate: {
    label: "Deploy the reserve feed and the gate",
    explanation:
      "Deploys this app's two contracts: a feed that reports the reserve address's live collateral balance, and the gate that checks it before it issues.",
  },
  roles: {
    label: "Grant roles and allowlist addresses",
    explanation:
      "Gives the gate the asset's issuer role (and nobody the agent role), then allowlists the reserve address and the demo investor.",
  },
  reserve: {
    label: "Issue collateral into the reserve",
    explanation:
      "Funds the reserve address with HBAR for gas, issues 5 collateral units into it, and opens the book with one asset unit issued through the gate.",
  },
};

function StepMark({ status }: { status: SetupStep["status"] }) {
  if (status === "active") return <Spinner className="text-primary" />;
  if (status === "done")
    return (
      <span className="text-success font-bold" aria-label="done">
        ✓
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-error font-bold" aria-label="failed">
        ✗
      </span>
    );
  return (
    <span className="text-base-content/30" aria-label="pending">
      ○
    </span>
  );
}

export function SetupCard({ snapshot }: { snapshot: ReserveSnapshot | undefined }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const configError = snapshot && !snapshot.config.ok ? snapshot.config.error : null;
  const running = snapshot?.setup.running ?? false;
  const busy = starting || running;

  const start = async () => {
    setStarting(true);
    setStartError(null);
    const result = await post("/api/reserve/setup");
    if (!result.ok) setStartError(result.message);
    setStarting(false);
  };

  return (
    <Card
      title="Set up the desk"
      caption="Deploys the collateral, the asset, the feed and the gate on Hedera testnet, then funds the reserve."
    >
      <p className="m-0 text-sm">
        The operator account pays: expect about 16 HBAR for a full setup, which deploys two ATS tokens. Running it again
        starts a fresh desk and abandons the old one.
      </p>
      <div>
        <button
          id="setup-desk"
          type="button"
          className="btn btn-primary"
          onClick={start}
          disabled={busy || !snapshot || configError !== null}
        >
          {busy ? <Spinner /> : null}
          Set up desk
        </button>
      </div>
      {configError ? (
        <p id="config-error" role="alert" className="m-0 text-sm text-error">
          {configError}
        </p>
      ) : null}
      {startError ? (
        <p role="alert" className="m-0 text-sm text-error">
          {startError}
        </p>
      ) : null}

      <ol className="m-0 p-0 list-none flex flex-col gap-2" aria-label="Setup progress">
        {(snapshot?.setup.steps ?? []).map(step => (
          <li
            key={step.id}
            id={`setup-step-${step.id}`}
            data-status={step.status}
            className="flex items-start gap-2 text-sm"
          >
            <span className="w-4 shrink-0 text-center">
              <StepMark status={step.status} />
            </span>
            <span className="min-w-0">
              <span className={step.status === "pending" ? "text-base-content/60" : "font-medium"}>
                {STEP_COPY[step.id].label}
              </span>
              {step.status === "done" && step.detail ? (
                <span className="block text-xs text-base-content/70 font-mono break-all">{step.detail}</span>
              ) : null}
              {step.status === "failed" && step.error ? (
                <span className="block text-xs text-error">{step.error}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">What each step does</summary>
        <ul className="mt-2 pl-5 flex flex-col gap-1">
          {Object.entries(STEP_COPY).map(([id, copy]) => (
            <li key={id}>
              <span className="font-medium">{copy.label}.</span> {copy.explanation}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
