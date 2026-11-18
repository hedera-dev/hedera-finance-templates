"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Run } from "./ControlCards";
import { Sandbox } from "./Sandbox";
import { Tour } from "./Tour";
import { useDesk } from "./useDesk";
import { useAccount } from "wagmi";

export type View = "tour" | "sandbox";

/** The view comes from the address alone, so the router, the address bar and the page never disagree. */
export function Desk({ view }: { view: View }) {
  const { address } = useAccount();
  const { snapshot, offline, startSetup, act } = useDesk(address);
  const router = useRouter();

  // One action at a time, across both views: a control that is working shows it and cannot be pressed twice.
  const [busy, setBusy] = useState<string | null>(null);
  const run: Run = async (key, request) => {
    setBusy(key);
    try {
      return await act(request);
    } finally {
      setBusy(null);
    }
  };
  const setup = async () => {
    setBusy("setup");
    try {
      await startSetup();
    } finally {
      setBusy(null);
    }
  };

  const choose = (next: View) => router.replace(next === "sandbox" ? "/?view=sandbox" : "/", { scroll: false });

  const shared = { snapshot, busy, run, act, setup };
  return (
    <div className="w-full max-w-[90rem] mx-auto px-6 py-5 flex flex-col gap-4">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-3xl">
          <h1 className="m-0 text-2xl font-bold">Collateral mobility desk</h1>
          <p className="m-0 text-sm text-base-content/70">
            Pledge a tokenized T-bill as collateral without moving it, then watch what can and cannot happen to it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="badge badge-outline">Hedera testnet</span>
          <span className="badge badge-outline">10 s = 1 day</span>
          <div role="group" aria-label="View" className="join">
            {(["tour", "sandbox"] as const).map(option => (
              <button
                key={option}
                id={`view-${option}`}
                type="button"
                aria-pressed={view === option}
                className={`btn btn-sm join-item shadow-none ${view === option ? "btn-primary" : ""}`}
                onClick={() => choose(option)}
              >
                {option === "tour" ? "Tour" : "Sandbox"}
              </button>
            ))}
          </div>
        </div>
      </header>
      {offline && !snapshot ? (
        <div className="alert alert-warning text-sm">The desk could not be reached yet: {offline}</div>
      ) : null}
      {view === "tour" ? <Tour {...shared} /> : <Sandbox {...shared} />}
    </div>
  );
}
