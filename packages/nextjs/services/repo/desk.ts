// Server-only: what the chain does not record. The desk's own list of what it created (which is also the
// allowlist every route checks), the setup checklist's progress, and the activity log's ordering.
// All of it lives in server memory and may be lost on a restart; every number the page shows is read from the chain.
import type { Address, Hex } from "viem";
import type { ActivityEntry, SetupStep, StepId } from "~~/types/repo";

export type Entity = { address: Address; contractId: string };

export type Desk = {
  operator: Address;
  bill: Entity;
  /** The stablecoin proxy, where management lives. */
  stablecoin: Entity;
  /** The HTS token behind it, where value moves. */
  token: Entity;
  reserve: Entity | null;
  feed: Entity;
  repo: Entity;
  /** The demo borrower. Its key never leaves the server. */
  borrower: { address: Address; accountId: string; key: Hex };
  /** The learner's own wallet, once added as a borrower. */
  wallets: Address[];
  /** Who the page is currently driving: the demo borrower, or a wallet. */
  activeBorrower: Address;
  /** The most recent pledge, and the loan opened against it. What the chain keeps per borrower but not "current". */
  holdId: bigint | null;
  loanId: bigint | null;
};

export const STEP_IDS: StepId[] = ["version", "bill", "stablecoin", "feed", "repo", "permissions", "positions"];

type DeskState = {
  desk: Desk | null;
  setup: { running: boolean; steps: SetupStep[]; error: string | null; completedAt: number | null };
  activity: ActivityEntry[];
  nextActivityId: number;
};

const freshSteps = (): SetupStep[] => STEP_IDS.map(id => ({ id, status: "pending" }));

const globalForDesk = globalThis as unknown as { __repoDesk?: DeskState };

export function state(): DeskState {
  globalForDesk.__repoDesk ??= {
    desk: null,
    setup: { running: false, steps: freshSteps(), error: null, completedAt: null },
    activity: [],
    nextActivityId: 1,
  };
  return globalForDesk.__repoDesk;
}

export const getDesk = () => state().desk;

/** A fresh desk: forgets the last one and its log. The old tokens stay on the network, abandoned. */
export function beginSetup() {
  const current = state();
  current.desk = null;
  current.activity = [];
  current.setup = { running: true, steps: freshSteps(), error: null, completedAt: null };
}

export function updateStep(id: StepId, patch: Partial<SetupStep>) {
  const step = state().setup.steps.find(candidate => candidate.id === id);
  if (step) Object.assign(step, patch);
}

/** Marks the running step failed and the run over, so a spinner never outlives it. */
export function failSetup(message: string) {
  const { setup } = state();
  const running =
    setup.steps.find(step => step.status === "active") ?? setup.steps.find(step => step.status === "pending");
  if (running) {
    running.status = "failed";
    running.error = message;
  }
  setup.error = message;
  setup.running = false;
}

export function completeSetup(desk: Desk) {
  const current = state();
  current.desk = desk;
  current.setup.running = false;
  current.setup.error = null;
  current.setup.completedAt = Date.now();
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "at">) {
  const current = state();
  current.activity.unshift({ id: current.nextActivityId++, at: Date.now(), ...entry });
  current.activity.length = Math.min(current.activity.length, 200);
}

export function isRunning() {
  return state().setup.running;
}
