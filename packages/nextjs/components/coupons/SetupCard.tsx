"use client";

import { useEffect, useState } from "react";
import { hederaTestnet } from "viem/chains";
import type { DeskStateResponse } from "~~/hooks/coupons/useDeskState";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-hbar";

type StepStatus = "pending" | "active" | "done" | "failed";
type Step = { status: StepStatus; resultId?: string };

const idle: Step = { status: "pending" };

function StepRow({ id, label, step }: { id: string; label: string; step: Step }) {
  return (
    <div id={id} data-status={step.status} className="flex items-center gap-2 text-sm">
      {step.status === "active" && <span className="loading loading-spinner loading-xs" />}
      {step.status === "done" && <span className="text-success">✓</span>}
      {step.status === "failed" && <span className="text-error">✗</span>}
      {step.status === "pending" && <span className="w-3 h-3 rounded-full border border-base-300 inline-block" />}
      <span>{label}</span>
      {step.status === "done" && step.resultId && (
        <span className="font-mono text-xs text-base-content/60">{step.resultId}</span>
      )}
    </div>
  );
}

export function SetupCard({
  desk,
  onDone,
  step,
}: {
  desk: DeskStateResponse | undefined;
  onDone: () => void;
  /** Set by the tour, where this card is the step's action. */
  step?: { label: string; title: string };
}) {
  const [stablecoinStep, setStablecoinStep] = useState<Step>(idle);
  const [investorsStep, setInvestorsStep] = useState<Step>(idle);

  useEffect(() => {
    if (desk?.stablecoin) setStablecoinStep({ status: "done", resultId: desk.stablecoin.tokenId });
    if (desk?.investors?.length === 2) {
      setInvestorsStep({ status: "done", resultId: desk.investors.map(i => i.accountId).join(", ") });
    }
  }, [desk?.stablecoin, desk?.investors]);

  const running = stablecoinStep.status === "active" || investorsStep.status === "active";

  const handleSetup = async () => {
    setStablecoinStep({ status: "active" });
    try {
      const res = await fetch("/api/hedera/coupons/setup/stablecoin", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create stablecoin");
      setStablecoinStep({ status: "done", resultId: body.stablecoin.tokenId });
    } catch {
      setStablecoinStep({ status: "failed" });
      return;
    }

    setInvestorsStep({ status: "active" });
    try {
      const res = await fetch("/api/hedera/coupons/setup/investors", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create demo investors");
      setInvestorsStep({
        status: "done",
        resultId: body.investors.map((i: { accountId: string }) => i.accountId).join(", "),
      });
    } catch {
      setInvestorsStep({ status: "failed" });
      return;
    }
    onDone();
  };

  return (
    <div className={`card bg-base-100 shadow ${step ? "border-2 border-primary" : "border border-base-300"}`}>
      <div className={`card-body gap-2 ${step ? "!p-6" : "!p-4"}`}>
        <div>
          {step ? <p className="m-0 text-xs uppercase tracking-wide text-base-content/60">{step.label}</p> : null}
          <h3 className={`card-title ${step ? "text-xl" : "text-base"}`}>{step?.title ?? "Set up desk"}</h3>
          {!(stablecoinStep.status === "done" && investorsStep.status === "done") && (
            <p className="text-sm text-base-content/70 m-0">
              Creates the stablecoin coupons are paid in and the two demo investors who will hold positions.
            </p>
          )}
        </div>

        {desk?.configError && (
          <p id="config-error" className="text-sm text-error m-0">
            {desk.configError}
          </p>
        )}
        {!desk?.factory && (
          <p id="factory-missing" className="text-sm text-warning m-0">
            No factory is deployed yet. Run <code>yarn coupons:deploy</code> to deploy one.
          </p>
        )}
        {desk?.factory && (
          <p className="text-sm text-base-content/70 m-0">
            Factory:{" "}
            <a
              id="factory-address"
              href={getBlockExplorerAddressLink(hederaTestnet, desk.factory.address)}
              target="_blank"
              rel="noreferrer"
              className="link font-mono text-xs break-all no-underline hover:underline"
            >
              {desk.factory.address}
            </a>
          </p>
        )}

        <div className="flex flex-col gap-1">
          <StepRow id="setup-step-stablecoin" label="Create the stablecoin" step={stablecoinStep} />
          <StepRow id="setup-step-investors" label="Create the demo investors" step={investorsStep} />
        </div>

        <button
          id="setup-desk"
          type="button"
          className={`btn btn-primary btn-sm self-start ${
            stablecoinStep.status === "done" && investorsStep.status === "done" ? "hidden" : ""
          }`}
          disabled={
            running ||
            Boolean(desk?.configError) ||
            (stablecoinStep.status === "done" && investorsStep.status === "done")
          }
          onClick={handleSetup}
        >
          {running ? "Setting up…" : "Set up desk"}
        </button>
      </div>
    </div>
  );
}
