// Shared, import-free types for the ATS bond desk: safe to import from both server routes and
// client components (type-only, erased at build time either way).

export type BondTerms = {
  address: string;
  contractId: string;
  name: string;
  symbol: string;
  isin: string;
  currency: string;
  faceValue: number;
  startingDateIso: string;
  maturityDateIso: string;
  maxSupply: number;
  /** null when the chain could not be read just now; never silently 0. */
  totalSupply: number | null;
  /** False when these are the values recorded at issue rather than a fresh read. */
  chainRead: boolean;
};

export type InvestorLabel = "Investor A" | "Investor B" | "Your wallet";

export type InvestorView = {
  label: InvestorLabel;
  address: string;
  hederaAccountId: string | null;
  /** null when the control list could not be read; shown as unknown, never as "Not approved". */
  approved: boolean | null;
  /** null when the balance could not be read; shown as unavailable, never as 0. */
  balance: number | null;
};

export type ActivityEntryView = {
  id: string;
  time: string;
  action: string;
  result: string;
  txHash?: string;
};

export type DeskStatus = {
  configured: boolean;
  configError?: string;
  bond: BondTerms | null;
  investors: InvestorView[];
  activity: ActivityEntryView[];
  /** Set when the action that produced this status was refused, with the reason to show. */
  actionError?: string;
};

export type IssueBondInput = {
  name: string;
  symbol: string;
  isin: string;
  faceValue: number;
  maturityMonths: number;
  maxSupply: number;
};

export type IssueStepId = "version" | "deploy" | "investors" | "verify";
export type StepStatus = "pending" | "active" | "done" | "failed";

export type IssueEvent =
  | { step: "version"; status: "active" }
  | { step: "version"; status: "done"; version: string }
  | { step: "version"; status: "failed"; error: string }
  | { step: "deploy"; status: "active" }
  | { step: "deploy"; status: "done"; address: string; contractId: string; txHash: string }
  | { step: "deploy"; status: "failed"; error: string }
  | { step: "investors"; status: "active" }
  | { step: "investors"; status: "done"; investors: InvestorView[] }
  | { step: "investors"; status: "failed"; error: string }
  | { step: "verify"; status: "active" }
  | { step: "verify"; status: "done"; bond: BondTerms }
  | { step: "verify"; status: "failed"; error: string }
  | { step: "result"; status: "done" }
  | { step: "result"; status: "failed"; error: string };
