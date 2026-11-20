"use client";

import { useRouter } from "next/navigation";
import { Sandbox } from "./Sandbox";
import { Tour } from "./Tour";
import { useDvpDesk } from "./useDesk";

export type View = "tour" | "sandbox";

/** The view comes from the address alone, so the router, the address bar and the page never disagree. */
export function Desk({ view }: { view: View }) {
  const desk = useDvpDesk();
  const router = useRouter();
  const choose = (next: View) => router.replace(next === "sandbox" ? "/?view=sandbox" : "/", { scroll: false });

  return (
    <div className="w-full max-w-[90rem] mx-auto px-6 py-5 flex flex-col gap-4">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-3xl">
          <h1 className="m-0 text-2xl font-bold">A DvP settlement desk, settled by a contract</h1>
          <p className="m-0 text-sm text-base-content/70">
            Each side pledges its own leg where it already sits, naming one settlement contract as the escrow. One call
            then moves both legs together, or neither moves and both pledges are still intact.
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
      {view === "tour" ? (
        <Tour desk={desk} />
      ) : (
        <>
          <p className="m-0 text-sm text-base-content/60 max-w-3xl">
            The settlement contract takes no custody and holds no role on either token: all it can do with a pledge is
            execute it to the destination its owner fixed, or release it back to them.
          </p>
          <Sandbox desk={desk} />
        </>
      )}
    </div>
  );
}
