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
          <h1 className="m-0 text-2xl font-bold">Coupon bonds that pay themselves</h1>
          <p className="m-0 text-sm text-base-content/70">
            A coupon is the interest a bond pays on a schedule. Usually a paying agent, or a keeper such as Chainlink
            Automation, has to send it. Here the bond schedules its own payments through the Hedera Schedule Service:
            once started, it pays every holder in a stablecoin and books the next coupon itself.
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
