// Shapes shared by the repo desk's API routes and its page. Chain amounts travel as formatted strings or decimal
// strings; `null` means "could not be read", which the page shows as unavailable, never as a number.

export type StepId = "version" | "bill" | "stablecoin" | "feed" | "repo" | "permissions" | "positions";
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

export type LoanStatus = "NO LOAN" | "OPEN" | "MARGIN CALL" | "LIQUIDATABLE" | "REPAID" | "LIQUIDATED" | "UNKNOWN";

export type Linked = { address: string; contractId: string };

export type BillView = Linked & {
  /** Read back from the bill contract, not echoed from setup. */
  terms: { name: string; symbol: string; isin: string; faceValue: string; maturityMs: number } | null;
  feed: Linked;
  discountRateBps: string | null;
  daysRemaining: string | null;
  /** Dollars per bill, or `null` when the feed could not be read. */
  price: string | null;
  priceUpdatedAt: number | null;
};

export type PositionView = {
  pledged: string | null;
  free: string | null;
  value: string | null;
  haircut: string;
  capacity: string | null;
  principal: string | null;
  interest: string | null;
  debt: string | null;
  ltv: string | null;
  threshold: string;
  liquidationPrice: string | null;
  headroom: string | null;
  accretion: string | null;
  carry: string | null;
  carryNote: string | null;
  termRemaining: string | null;
  status: LoanStatus;
  statusNote: string;
  /** What the buttons need to know. */
  loanOpen: boolean;
  termElapsed: boolean;
};

export type CashView = {
  proxy: Linked;
  token: Linked;
  reserve: Linked | null;
  lenderCash: string | null;
  borrowerCash: string | null;
  reserveAmount: string | null;
};

export type EncumbranceView = {
  escrow: Linked;
  /** Read from the hold itself with `getHoldForByPartition`. */
  holdDestination: string | null;
  holdEscrow: string | null;
  /** Epoch milliseconds, formatted by the page in the reader's local time. */
  holdExpiryMs: number | null;
  holdAmount: string | null;
  repoInControlList: string | null;
  repoRoles: string | null;
};

export type WalletView = {
  address: string;
  added: boolean;
  allowlisted: boolean | null;
  balance: string | null;
  held: string | null;
};

export type DeskView = {
  readAt: number;
  operator: string;
  borrower: { address: string; kind: "demo" | "wallet" };
  demoBorrower: string;
  holdId: string | null;
  loanId: string | null;
  bill: BillView;
  position: PositionView;
  cash: CashView;
  encumbrance: EncumbranceView;
  wallet: WalletView | null;
  termDays: number;
  repoRateBps: number;
};

export type Snapshot = {
  configured: boolean;
  configError: string | null;
  setup: { running: boolean; steps: SetupStep[]; error: string | null; completedAt: number | null };
  desk: DeskView | null;
  activity: ActivityEntry[];
  serverTime: number;
};

export type ActionResult = {
  ok: boolean;
  /** `SUCCESS`, or the refusal decoded to its error name. */
  result: string;
  message: string;
  txHash?: string;
  /** For the wallet pledge: what the page needs to register it. */
  extra?: Record<string, string>;
};

export type PreviewResult = {
  amount: string;
  verdict: "allowed" | "refused" | "unknown";
  reason: string | null;
  capacity: string | null;
  needs: string | null;
  ltv: string | null;
};

export type ActionRequest =
  | { type: "pledge"; amount: string }
  | { type: "pledge-wrong-escrow"; amount: string }
  | { type: "open"; amount: string }
  | { type: "repay" }
  | { type: "top-up"; amount: string }
  | { type: "liquidate" }
  | { type: "shock"; bps: string }
  | { type: "freeze" }
  | { type: "resume" }
  | { type: "restart-bill" }
  | { type: "transfer-pledged" }
  | { type: "reclaim-pledge" }
  | { type: "redirect-pledge" }
  | { type: "add-wallet"; address: string }
  | { type: "register-wallet-pledge"; address: string; holdId: string };
