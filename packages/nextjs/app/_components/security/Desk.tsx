"use client";

import { useRouter } from "next/navigation";
import { SecurityDesk } from "./SecurityDesk";
import { Tour } from "./Tour";
import { useSecurityDesk } from "./useSecurityDesk";

export type View = "tour" | "sandbox";

/** The view comes from the address alone, so the router, the address bar and the page never disagree. */
export function Desk({ view }: { view: View }) {
  const desk = useSecurityDesk();
  const router = useRouter();
  const choose = (next: View) => router.replace(next === "sandbox" ? "/?view=sandbox" : "/", { scroll: false });

  return (
    <div className="w-full max-w-[90rem] mx-auto px-6 py-5 flex flex-col gap-4">
      <header className="flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-col gap-1 max-w-3xl">
          <h1 className="m-0 text-2xl font-bold">A transfer agent&apos;s desk for a regulated token</h1>
          <p className="m-0 text-sm text-base-content/70">
            The token&apos;s compliance rules are keys on the token itself, enforced by Hedera, and every admin action
            takes two of three officers.
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
            The network enforces the two signatures. The <em>separation</em> is a demo: this desk holds Officers 1 and
            2, so it can produce both. In production those keys live with different people, or in different custody.
          </p>
          <SecurityDesk desk={desk} />
        </>
      )}
    </div>
  );
}
