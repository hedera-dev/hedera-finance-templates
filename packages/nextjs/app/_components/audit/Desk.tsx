"use client";

import { useRouter } from "next/navigation";
import { Sandbox } from "./Sandbox";
import { Tour } from "./Tour";

export type View = "tour" | "sandbox";

/** The view comes from the address alone, so the router, the address bar and the page never disagree. */
export function Desk({ view }: { view: View }) {
  const router = useRouter();
  const choose = (next: View) => router.replace(next === "sandbox" ? "/?view=sandbox" : "/", { scroll: false });

  return (
    <div className="w-full max-w-[90rem] mx-auto px-6 py-5 flex flex-col gap-4">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-4xl">
          <h1 className="m-0 text-2xl font-bold">Issuer compliance desk</h1>
          <p className="m-0 text-sm text-base-content/70">
            Every action on this security token is logged on an HCS topic only authorised publishers can write to, each
            entry chained to the one before, with the reason, the authority and the hash of the supporting document. A
            regulator verifies the whole trail from the public mirror node alone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="badge badge-outline">Hedera testnet</span>
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
      {view === "tour" ? <Tour /> : <Sandbox />}
    </div>
  );
}
