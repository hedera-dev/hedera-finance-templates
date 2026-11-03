// Server-only: what the chain does not record. The desk's own list of what it created (which is also the
// allowlist every route checks), the setup checklist's progress, and the activity log's ordering.
// All of it lives in server memory and may be lost on a restart; every number the page shows is read from the chain.
import type { Address, Hex } from "viem";
import type { ActivityEntry, SetupStep, StepId } from "~~/types/reserve";

export type Entity = { address: Address; contractId: string };

export type HolderRecord = { label: string; address: Address; kind: "investor" | "wallet" };

export type Desk = {
  operator: Address;
  collateral: Entity;
  asset: Entity;
  gate: Entity;
  reserveFeed: Entity;
  /** The reserve address. Its key never leaves the server. */
  reserve: { address: Address; accountId: string; key: Hex };
  holders: HolderRecord[];
  maxPriceAge: number;
};

export const STEP_IDS: StepId[] = ["version", "collateral", "asset", "gate", "roles", "reserve"];

type DeskState = {
  desk: Desk | null;
  setup: { running: boolean; steps: SetupStep[]; error: string | null; completedAt: number | null };
  activity: ActivityEntry[];
  nextActivityId: number;
};

const freshSteps = (): SetupStep[] => STEP_IDS.map(id => ({ id, status: "pending" }));

const globalForDesk = globalThis as unknown as { __reserveDesk?: DeskState };

export function state(): DeskState {
  globalForDesk.__reserveDesk ??= {
    desk: null,
    setup: { running: false, steps: freshSteps(), error: null, completedAt: null },
    activity: [],
    nextActivityId: 1,
  };
  return globalForDesk.__reserveDesk;
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
