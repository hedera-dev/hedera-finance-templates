"use client";

import { Card, Spinner } from "./ui";
import type { Snapshot, StepId, StepStatus } from "~~/types/repo";

const STEPS: { id: StepId; label: string; detail: string }[] = [
  {
    id: "version",
    label: "Resolve the latest version of both configurations",
    detail:
      "Each configuration's latest version is read from its resolver first: version 0 reverts with VersionZero. Both the ATS bond configuration and the Stablecoin Studio stablecoin configuration are resolved.",
  },
  {
    id: "bill",
    label: "Deploy the bill through the ATS factory",
    detail:
      "A zero-coupon, whole-unit bond with a $1,000 face and an allowlist as its control list. The address is taken from the receipt's BondDeployed event.",
  },
  {
    id: "stablecoin",
    label: "Deploy the stablecoin, its token and its reserve through the Stablecoin Studio factory",
    detail:
      "A 2-decimal USD stablecoin with a demo reserve. The proxy, the HTS token and the reserve addresses come from the receipt, never from a simulation, because the factory is shared.",
  },
  {
    id: "feed",
    label: "Deploy the bill price feed",
    detail:
      "A Chainlink-compatible feed that computes face × (1 − rate × days / 360) from a published discount rate and the days remaining on the demo clock.",
  },
  {
    id: "repo",
    label: "Deploy the repo contract",
    detail:
      "The escrow on every hold. It holds no role on the bill, is not on its control list, and takes no custody. It verifies each hold itself before any cash moves.",
  },
  {
    id: "permissions",
    label: "Allowlist the borrower and the lender, grant the cash-in role, associate the stablecoin",
    detail:
      "The hold's destination needs a control-list entry because executing it delivers units there. The lender gets the stablecoin's cash-in role and the borrower is associated to the token.",
  },
  {
    id: "positions",
    label: "Issue 10 bills to the borrower and mint the lender's stablecoin",
    detail:
      "The borrower starts with 10 bills and a little cash for interest; the lender starts with the cash to lend. The bill's 91-day clock starts here.",
  },
];

function Mark({ status }: { status: StepStatus }) {
  if (status === "active") return <Spinner />;
  if (status === "done") return <span className="text-success font-bold">✓</span>;
  if (status === "failed") return <span className="text-error font-bold">✕</span>;
  return <span className="text-base-content/40">○</span>;
}

export function SetupCard({
  snapshot,
  busy,
  onSetup,
}: {
  snapshot: Snapshot | null;
  busy: boolean;
  onSetup: () => void;
}) {
  const running = snapshot?.setup.running ?? false;
  const steps = snapshot?.setup.steps ?? [];
  const configured = snapshot?.configured ?? false;
  const error = snapshot?.setup.error ?? null;

  return (
    <Card
      title="Set up the desk"
      caption="Deploys the bill, the stablecoin, the price feed and the repo contract, and opens the books."
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm">
          The operator account pays, roughly 15–25 testnet HBAR in all. Running it again starts a fresh desk and leaves
          the old one behind on the network.
        </p>
        <div className="flex items-center gap-3">
          <button
            id="setup-desk"
            type="button"
            className="btn btn-primary"
            disabled={!configured || running || busy}
            onClick={onSetup}
          >
            {running ? <Spinner /> : null}
            Set up desk
          </button>
        </div>
        {snapshot && !configured ? (
          <div id="config-error" className="alert alert-error text-sm">
            Set <code>HEDERA_OPERATOR_ID</code> and <code>HEDERA_OPERATOR_KEY</code> in{" "}
            <code>packages/nextjs/.env.local</code>, then restart the server.{" "}
            {snapshot.configError && !/HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY/.test(snapshot.configError)
              ? snapshot.configError
              : ""}
          </div>
        ) : null}
      </div>

      <ul id="setup-steps" className="m-0 p-0 list-none flex flex-col gap-1.5">
        {STEPS.map(step => {
          const live = steps.find(candidate => candidate.id === step.id);
          const status = live?.status ?? "pending";
          return (
            <li
              key={step.id}
              id={`setup-step-${step.id}`}
              data-status={status}
              className="flex items-start gap-2 text-sm"
            >
              <span className="w-5 shrink-0 text-center">
                <Mark status={status} />
              </span>
              <span className="min-w-0">
                <span className={status === "pending" ? "text-base-content/60" : ""}>{step.label}</span>
                {status === "done" && live?.detail ? (
                  <span className="block text-xs font-mono text-base-content/60 break-all">{live.detail}</span>
                ) : null}
                {status === "failed" && live?.error ? (
                  <span className="block text-xs text-error break-words">{live.error}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {error && !steps.some(step => step.status === "failed") ? (
        <div className="alert alert-error text-sm">{error}</div>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">What each step does</summary>
        <ol className="mt-2 pl-5 flex flex-col gap-2 text-base-content/80">
          {STEPS.map(step => (
            <li key={step.id}>{step.detail}</li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
