"use client";

import { useState } from "react";
import * as dvp from "~~/services/hedera/dvpClient";
import { SETUP_STEPS, type SetupStepId } from "~~/services/hedera/setupSteps";
import type { MarketSnapshot } from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type StepState = { status: "pending" | "active" | "done" | "failed"; detail?: string };
type Progress = Record<SetupStepId, StepState>;

const idle = (): Progress => Object.fromEntries(SETUP_STEPS.map(s => [s.id, { status: "pending" }])) as Progress;

/** Fixed-size marker so labels line up whatever the step's state. */
const StepMarker = ({ index, status }: { index: number; status: StepState["status"] }) => (
  <span className="w-5 h-5 shrink-0 flex items-center justify-center text-xs">
    {status === "active" && <span className="loading loading-spinner loading-xs text-primary" aria-label="running" />}
    {status === "done" && (
      <span className="text-success font-bold" aria-label="done">
        ✓
      </span>
    )}
    {status === "failed" && (
      <span className="text-error font-bold" aria-label="failed">
        ✕
      </span>
    )}
    {status === "pending" && <span className="text-base-content/50">{index + 1}</span>}
  </span>
);

type Props = {
  configLoaded: boolean;
  operatorConfigured: boolean;
  onMarket: (market: MarketSnapshot) => void;
};

/**
 * `Set up market` with its steps as a compact checklist: a spinner on the running step, a check
 * and the ids it created on finished ones, a cross on a failure. What each step does sits in a
 * collapsed section, so the button and the progress stay on screen.
 */
export const SetupPanel = ({ configLoaded, operatorConfigured, onMarket }: Props) => {
  const [progress, setProgress] = useState<Progress>(idle);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setProgress(idle());
    try {
      const market = await dvp.setupMarket(({ step, status, detail }) =>
        setProgress(p => ({ ...p, [step]: { status, detail } })),
      );
      onMarket(market);
      notification.success("Market set up.");
      // Wait a frame for the market section to render, then bring it into view.
      requestAnimationFrame(() => document.getElementById("market")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      const step = e instanceof dvp.SetupError ? e.step : null;
      if (step) setProgress(p => ({ ...p, [step]: { status: "failed" } }));
      notification.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h2 className="font-bold text-lg m-0">Setup</h2>
          <span className="text-sm text-base-content/70">
            Creates two tokens and three demo accounts on testnet, signed and paid for by your operator account. About a
            minute and roughly 31 HBAR; running it again starts a fresh market.
          </span>
        </div>
        <button
          id="setup-market"
          className="btn btn-primary shrink-0"
          disabled={!configLoaded || !operatorConfigured || busy}
          onClick={run}
        >
          {busy && <span className="loading loading-spinner loading-sm" />}
          {busy ? "Setting up…" : "Set up market"}
        </button>
      </div>

      {configLoaded && !operatorConfigured && (
        <span id="config-error" className="text-error text-sm">
          Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to configure the operator.
        </span>
      )}

      <ol className="flex flex-col gap-1.5 m-0 p-0 list-none">
        {SETUP_STEPS.map((s, i) => {
          const state = progress[s.id];
          return (
            <li
              key={s.id}
              id={`setup-step-${s.id}`}
              data-status={state.status}
              className="flex items-center gap-3 text-sm min-h-6"
            >
              <StepMarker index={i} status={state.status} />
              <span className={state.status === "active" ? "font-semibold" : ""}>{s.label}</span>
              {state.detail && <span className="font-mono text-xs text-base-content/60 truncate">{state.detail}</span>}
            </li>
          );
        })}
      </ol>

      <details className="group rounded-box bg-base-200 text-sm">
        <summary className="flex items-center justify-between cursor-pointer select-none list-none px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
          What each step does
          <span className="transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 m-0 px-4 pb-4">
          {SETUP_STEPS.map(s => (
            <div key={s.id} className="contents">
              <dt className="font-medium">{s.label}</dt>
              <dd className="m-0 text-base-content/70">{s.explanation}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
};
