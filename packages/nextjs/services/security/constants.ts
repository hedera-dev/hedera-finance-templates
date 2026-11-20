// Server-only: Asset Tokenization Studio (ATS) v8 testnet wiring, and the desk's own dials.
//
// The addresses are Hedera contract ids; their EVM addresses are resolved at runtime from the
// mirror node (see `mirror.ts`) rather than hardcoded. This is the same deployment the repo's
// other ATS templates use.
import type { Address, Hex } from "viem";

/**
 * The JSON-RPC relay. Hashio is public and shared, so it has bad minutes; set `HEDERA_RPC_URL`
 * to point at another relay (your own, or a provider's) without touching the code.
 */
export const RPC_URL = process.env.HEDERA_RPC_URL?.trim() || "https://testnet.hashio.io/api";
export const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

export const ATS_FACTORY_CONTRACT_ID = "0.0.9213391";
export const ATS_RESOLVER_CONTRACT_ID = "0.0.9212226";

/** The equity business-logic configuration registered on the resolver. */
export const EQUITY_CONFIG_ID: Hex = `0x${"0".repeat(63)}1`;
/** ATS's default partition. */
export const PARTITION: Hex = `0x${"0".repeat(63)}1`;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// Role identifiers from the ATS contracts' `constants/roles.sol`.
export const DEFAULT_ADMIN_ROLE: Hex = `0x${"0".repeat(64)}`;
export const ROLE_ISSUER: Hex = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
export const ROLE_CONTROL_LIST: Hex = "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d";
export const ROLE_KYC: Hex = "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
export const ROLE_FREEZE_MANAGER: Hex = "0x71ae38482e1ab1c28e767d64766d686215b490c8c1bd7dfe6b101525187c2155";
export const ROLE_PAUSER: Hex = "0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f";
export const ROLE_CONTROLLER: Hex = "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e";

/** The four compliance roles the board holds, in the order the page lists them. */
export const BOARD_ROLES = [
  { name: "KYC", role: ROLE_KYC },
  { name: "Freeze", role: ROLE_FREEZE_MANAGER },
  { name: "Controller", role: ROLE_CONTROLLER },
  { name: "Pause", role: ROLE_PAUSER },
] as const;

// Hedera charges the greater of gas used and 80% of the gas limit, so these sit close to the
// measured need rather than being padded generously.
export const GAS_DEPLOY_TOKEN = 8_000_000n;
export const GAS_DEPLOY_BOARD = 2_000_000n;
export const GAS_CONTROL_LIST = 400_000n;
export const GAS_ISSUE = 1_500_000n;
export const GAS_TRANSFER = 1_500_000n;
export const GAS_BOARD_PROPOSE = 400_000n;
/** An approval also makes the token call, so it carries both costs. */
export const GAS_BOARD_APPROVE = 2_000_000n;
export const GAS_BOARD_CANCEL = 150_000n;
/** For the tour's attacks, which revert and so cannot be estimated. */
export const GAS_ATTACK = 200_000n;
/**
 * Funding a demo account lazily creates it on Hedera, which is why this is far more than a plain
 * transfer's 21,000. Measured at ~600k on testnet by the ats-bond template.
 */
export const GAS_FUND_ACCOUNT = 1_000_000n;

/** HBAR per demo officer and holder: enough to sign the tour's refused transactions a few times. */
export const DEMO_FUNDING_HBAR = "1";

export const MIRROR_POLL_ATTEMPTS = 6;
export const MIRROR_POLL_DELAY_MS = 2000;

// The token the desk issues.
export const TOKEN_NAME = "Acme Regulated Shares";
export const TOKEN_SYMBOL = "ACME";
/** A real ISIN: the factory checks the format and the checksum and refuses anything else. */
export const TOKEN_ISIN = "US0378331005";
export const TOKEN_MAX_SUPPLY = 1_000_000n;
export const TOKEN_NOMINAL_VALUE_CENTS = 10_000n;
export const TOKEN_NOMINAL_VALUE_DECIMALS = 2;
/** Minted to the issuer's own book at setup, so it has something to distribute from. */
export const ISSUE_AMOUNT = 1_000n;
/** Transferred to Holder A at setup. */
export const HOLDER_A_AMOUNT = 100n;
/** What each `Send 10` moves. */
export const SEND_AMOUNT = 10n;

/** The ATS KYC record this desk writes. A real desk would carry a verifiable credential id here. */
export const KYC_VC_ID = "desk-demo-kyc";
export const KYC_VALID_YEARS = 1;
