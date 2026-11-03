// Shapes shared by the reserve desk's API routes and its page. Chain amounts travel as decimal strings.

export type StepId = "version" | "collateral" | "asset" | "gate" | "roles" | "reserve";
export type StepStatus = "pending" | "active" | "done" | "failed";

export type SetupStep = {
  id: StepId;
  status: StepStatus;
  /** What the step produced (ids, addresses), shown once it is done. */
  detail?: string;
  error?: string;
};

export type ActivityEntry = {
  id: number;
  at: number;
  action: string;
  /** `SUCCESS`, or the refusal decoded to its error name. */
  result: string;
  txHash?: string;
};

export type ReserveStatus = "BACKED" | "AT CAPACITY" | "UNDER-RESERVED" | "UNKNOWN";

export type RoleKey = "admin" | "issuer" | "agent" | "controlList";

export type RoleView = {
  key: RoleKey;
  name: string;
  role: string;
  /** `null` when the contract could not be read. */
  members: string[] | null;
};

export type HolderView = {
  label: string;
  address: string;
  kind: "investor" | "wallet";
  allowlisted: boolean | null;
  balance: string | null;
};

export type AssetTerms = {
  name: string;
  symbol: string;
  isin: string;
  currency: string;
  faceValue: string;
  maxSupply: string;
};

export type ReserveView = {
  account: string;
  collateralAddress: string;
  collateralContractId: string;
  quantity: string | null;
  priceFeedAddress: string;
  reserveFeedAddress: string;
  price: string | null;
  priceUpdatedAt: number | null;
  value: string | null;
};

export type AssetView = {
  address: string;
  contractId: string;
  gateAddress: string;
  terms: AssetTerms | null;
  supply: string | null;
  liability: string | null;
  coverage: string | null;
  /** Units the reserve still covers, as a whole number; `null` when unknown. */
  headroom: string | null;
  status: ReserveStatus;
  /** Why the status is `UNKNOWN`, or what the price feed's problem is. */
  statusReason: string | null;
};

export type DeskView = {
  operatorAddress: string;
  maxPriceAge: number;
  reserve: ReserveView;
  asset: AssetView;
  roles: RoleView[];
  holders: HolderView[];
};

export type ReserveSnapshot = {
  config: { ok: true; operatorAddress: string } | { ok: false; error: string };
  setup: { running: boolean; steps: SetupStep[]; error: string | null; completedAt: number | null };
  desk: DeskView | null;
  activity: ActivityEntry[];
  readError: string | null;
};

export type PreviewResult = {
  amount: string;
  /** Whether the gate would allow it, as the gate itself answered. */
  verdict: "allowed" | "refused" | "unknown";
  /** The error name when refused, a sentence when unknown. */
  reason: string | null;
  covers: string | null;
  needs: string | null;
};

export type ActionResult = {
  ok: boolean;
  /** The error name for a refusal, otherwise a short outcome. */
  result: string;
  message: string;
  txHash?: string;
  /** For the bypass: the transaction that emitted the `RoleGranted` event. */
  grantTxHash?: string;
};
