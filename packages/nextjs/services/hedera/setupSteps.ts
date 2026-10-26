/**
 * The steps `Set up market` runs, in order. Shared by the server (which reports progress per step)
 * and the page (which explains each step and shows its progress). No SDK import: client-safe.
 */
export const SETUP_STEPS = [
  {
    id: "accounts",
    label: "Create demo accounts",
    explanation:
      "Three testnet accounts the app signs for on the server: a Seller, a Buyer, and a Buyer who will not pass KYC.",
  },
  {
    id: "security",
    label: "Create the security token",
    explanation:
      "An HTS token with a KYC key and a freeze key, held by you as issuer. The network refuses to move it to or from any account you have not approved.",
  },
  {
    id: "stablecoin",
    label: "Create the stablecoin",
    explanation: "The payment token, with 6 decimals and no KYC key, standing in for USDC.",
  },
  {
    id: "associate",
    label: "Associate both tokens",
    explanation: "Each account opts in to both tokens; a Hedera account cannot hold a token it has not associated.",
  },
  {
    id: "kyc",
    label: "Grant KYC",
    explanation: "You approve the Seller and the Buyer on the security. The unverified Buyer is deliberately left out.",
  },
  {
    id: "fund",
    label: "Fund opening balances",
    explanation:
      "One transfer gives the Seller the security to sell and both Buyers stablecoin to pay with, then waits for the mirror node to show it.",
  },
  {
    id: "topic",
    label: "Create the audit topic",
    explanation:
      "An HCS topic, submit key held by you, that every trade's lifecycle gets published to — proposed, signed, settled, rejected, cancelled and expired.",
  },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];

/** One line of the setup progress stream. `detail` carries ids created by a finished step. */
export type SetupEvent =
  | { type: "step"; step: SetupStepId; status: "active" | "done"; detail?: string }
  | { type: "done"; market: import("./types").MarketSnapshot }
  | { type: "error"; step: SetupStepId | null; error: string };
