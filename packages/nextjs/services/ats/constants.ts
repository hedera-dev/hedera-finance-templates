// Server-only: Asset Tokenization Studio (ATS) v8 testnet wiring.
// Addresses are Hedera contract ids; their EVM addresses are resolved at runtime from the
// mirror node (see mirror.ts) rather than hardcoded, per the spec.
import type { Address } from "viem";

/**
 * The JSON-RPC relay. Hashio is public and shared, so it has bad minutes; set `HEDERA_RPC_URL`
 * to point at another relay (your own, or a provider's) without touching the code.
 */
export const HASHIO_TESTNET_RPC_URL = process.env.HEDERA_RPC_URL?.trim() || "https://testnet.hashio.io/api";
export const MIRROR_NODE_TESTNET_URL = "https://testnet.mirrornode.hedera.com";

export const ATS_FACTORY_CONTRACT_ID = "0.0.9213391";
export const ATS_RESOLVER_CONTRACT_ID = "0.0.9212226";

/** The bond business-logic configuration registered on the resolver. */
export const BOND_CONFIG_ID = `0x${"0".repeat(63)}2` as const;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const DEFAULT_ADMIN_ROLE = `0x${"0".repeat(64)}` as const;
export const ROLE_ISSUER = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f" as const;
export const ROLE_CONTROL_LIST = "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d" as const;

// Hedera charges for at least 80% of a transaction's gas limit, so these are kept close to the
// actual need rather than padded generously (values for control-list/issue carried over from a
// verified spike against this same factory; deploy limit per the spec).
export const GAS_LIMIT_DEPLOY_BOND = 8_000_000n;
export const GAS_LIMIT_CONTROL_LIST = 400_000n;
export const GAS_LIMIT_ISSUE = 1_500_000n;
/**
 * Funding a demo investor lazily creates its Hedera account, which is why this is far more
 * than a plain transfer's 21,000: measured at 607,858 gas on testnet across nine of these
 * transactions. Hedera charges the greater of gas used and 80% of the limit, so 1,000,000
 * costs about 800,000 — trimming it closer saves a little, at the cost of headroom on a
 * step whose failure breaks the whole issue flow. Left wide on purpose.
 */
export const GAS_LIMIT_FUND_INVESTOR = 1_000_000n;

/** HBAR funding per demo investor, well under the spec's "at most 1 HBAR" ceiling. */
export const INVESTOR_FUNDING_HBAR = "0.5";

export const MIRROR_POLL_ATTEMPTS = 6;
export const MIRROR_POLL_DELAY_MS = 2000;
