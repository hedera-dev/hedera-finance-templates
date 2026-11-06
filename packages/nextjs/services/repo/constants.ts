// Server-only constants for the repo desk. Testnet only.
import type { Address, Hex } from "viem";

export const HASHIO_RPC_URL = "https://testnet.hashio.io/api";
export const MIRROR_URL = "https://testnet.mirrornode.hedera.com";
export const HASHSCAN_URL = "https://hashscan.io/testnet";

// Asset Tokenization Studio on Hedera testnet, version 8.
export const ATS_FACTORY_CONTRACT_ID = "0.0.9213391";
export const ATS_RESOLVER_CONTRACT_ID = "0.0.9212226";
export const BOND_CONFIG_ID: Hex = "0x0000000000000000000000000000000000000000000000000000000000000002";
/** ATS's default partition. */
export const PARTITION: Hex = "0x0000000000000000000000000000000000000000000000000000000000000001";

// Stablecoin Studio on Hedera testnet. Configuration 1 is the factory, 2 the stablecoin, 3 the reserve.
export const STABLECOIN_FACTORY_CONTRACT_ID = "0.0.6349500";
export const STABLECOIN_RESOLVER_CONTRACT_ID = "0.0.6349477";
export const STABLECOIN_CONFIG_ID: Hex = "0x0000000000000000000000000000000000000000000000000000000000000002";
export const RESERVE_CONFIG_ID: Hex = "0x0000000000000000000000000000000000000000000000000000000000000003";

export const ROLES = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  issuer: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  agent: "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b",
  controlList: "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",
} as const satisfies Record<string, Hex>;
export const ROLE_LABELS: Record<keyof typeof ROLES, string> = {
  admin: "admin",
  issuer: "issuer",
  agent: "agent",
  controlList: "control list",
};

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// Hedera bills at least 80% of the gas limit, so these sit close to the measured need.
export const GAS_DEPLOY_ATS = 8_000_000n;
export const GAS_ISSUE = 520_000n;
export const GAS_CONTROL_LIST = 150_000n;
export const GAS_CREATE_HOLD = 480_000n;
export const GAS_ASSOCIATE = 800_000n;
export const GAS_HTS_APPROVE = 800_000n;
export const GAS_HTS_TRANSFER = 120_000n;
/** Headroom over `eth_estimateGas` for ordinary calls. */
export const GAS_ESTIMATE_MARGIN_PERCENT = 125n;
/** HBAR sent with `deployStableCoin`, forwarded to HTS token creation. The Studio refunds what is not used. */
export const STABLECOIN_CREATE_VALUE_WEI = 20n * 10n ** 18n;
/** HBAR sent to the demo borrower so it can pay gas for its own transactions. */
export const BORROWER_GAS_FUNDING_WEI = 6n * 10n ** 18n;

// The bill. ATS stores the nominal value with 2 decimals: a $1,000 face is 100000.
export const BILL_NAME = "13-Week T-Bill";
export const BILL_SYMBOL = "TBILL13";
export const BILL_FACE_USD = 1_000;
export const NOMINAL_VALUE_DECIMALS = 2;
export const BILL_MAX_SUPPLY = 1_000_000n;
export const BILL_REAL_DAYS = 91;
export const BILLS_ISSUED = 10n;
export const DISCOUNT_RATE_BPS = 500;

// The stablecoin has 2 decimals, so $9,600 is 960000 and fits int64 with room to spare.
export const CASH_DECIMALS = 2;
export const CASH_UNITS_PER_USD = 100n;
export const LENDER_CASH_USD = 50_000n;
export const BORROWER_CASH_USD = 200n; // the interest has to come from somewhere
export const RESERVE_INITIAL_USD = 1_000_000n;
export const INT64_MAX = 9_223_372_036_854_775_807n;

// The demo clock: one second of real time is one day of the bill's life. Applied here and read back by the page.
export const SECONDS_PER_DAY = 1n;
export const DEMO_BILL_DAYS = 91;
export const TERM_DAYS = 30;
export const REPO_RATE_BPS = 480;
export const HAIRCUT_BPS = 200;
export const LIQUIDATION_THRESHOLD_BPS = 9_900;
/** The price feed may be at most this old, in real seconds, for the repo contract to use it. */
export const STALENESS_SECONDS = 300;
/** Real seconds a hold must outlast the term by. */
export const GRACE_SECONDS = 3_600;
/** The hold is created to expire this long after term plus grace, so it clears the contract's check with margin. */
export const HOLD_EXPIRY_MARGIN_SECONDS = 900;

// Upper bounds, so a mistyped amount cannot move the desk's whole position.
export const MAX_PLEDGE_BILLS = 10n;
export const MAX_BORROW_USD = 20_000n;
export const MAX_TOP_UP_USD = 20_000n;
export const MAX_SHOCK_BPS = 5_000;
