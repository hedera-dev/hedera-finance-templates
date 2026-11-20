// Server-only: the two factories already on testnet — Asset Tokenization Studio for the security,
// Stablecoin Studio for the cash — and the desk's own dials.
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
export const STABLECOIN_FACTORY_CONTRACT_ID = "0.0.6349500";
export const STABLECOIN_RESOLVER_CONTRACT_ID = "0.0.6349477";

/** The equity business-logic configuration registered on the ATS resolver. */
export const EQUITY_CONFIG_ID: Hex = `0x${"0".repeat(63)}1`;
/** The Stablecoin Studio configurations: the stablecoin itself, and its proof-of-reserve feed. */
export const STABLECOIN_CONFIG_ID: Hex = `0x${"0".repeat(63)}2`;
export const RESERVE_CONFIG_ID: Hex = `0x${"0".repeat(63)}3`;
/** ATS's default partition. */
export const PARTITION: Hex = `0x${"0".repeat(63)}1`;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// ATS role identifiers, from the ATS contracts' `constants/roles.sol`.
export const DEFAULT_ADMIN_ROLE: Hex = `0x${"0".repeat(64)}`;
export const ROLE_ISSUER: Hex = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
export const ROLE_CONTROL_LIST: Hex = "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d";
export const ROLE_KYC: Hex = "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc";
/** Keeps the token's list of KYC credential issuers; `grantKyc` refuses an issuer not on it. */
export const ROLE_SSI_MANAGER: Hex = "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1";

/** Stablecoin Studio roles, from its own `constants/roles.sol`. `keccak256("HOLD_CREATOR_ROLE")`. */
export const STABLECOIN_ADMIN_ROLE: Hex = `0x${"0".repeat(64)}`;
export const HOLD_CREATOR_ROLE: Hex = "0xa0edc074322e33cf8b82b4182ff2827f0fef9412190f0e8417c2669a1e8747e4";

// Hedera charges the greater of gas used and 80% of the gas limit, so every limit here sits just
// above what the call was measured to use on testnet rather than being padded generously. The
// numbers in the comments are what the mirror node reported.
/** 7.24M–7.62M used. */
export const GAS_DEPLOY_SECURITY = 8_000_000n;
/** 1.27M used — the HTS token's own creation fee is paid in HBAR with the call, not in gas. */
export const GAS_DEPLOY_STABLECOIN = 2_500_000n;
/** 2.23M used for ~10.6 KiB of bytecode. */
export const GAS_DEPLOY_SETTLEMENT = 2_500_000n;
/** 110k–127k used, control list and issuer list alike. */
export const GAS_CONTROL_LIST = 200_000n;
/** 212k–229k used. */
export const GAS_GRANT_KYC = 300_000n;
/** 60k–121k used, on either token. */
export const GAS_GRANT_ROLE = 200_000n;
/** 467k used. */
export const GAS_ISSUE = 600_000n;
/** 135k used. */
export const GAS_MINT = 200_000n;
/** 726k used: HRC-719 association is dear, and each party signs its own. */
export const GAS_ASSOCIATE = 800_000n;
/** 347k–414k on the security, 347k on the stablecoin, and it grows with the holder's hold count. */
export const GAS_CREATE_HOLD = 600_000n;
/** 149k used. */
export const GAS_PROPOSE = 200_000n;
/** 126k–138k used, either leg. */
export const GAS_PLEDGE = 200_000n;
/** Settlement executes both holds, so it carries both tokens' costs: 566k used. */
export const GAS_SETTLE = 750_000n;
/** Releases both holds; of the same order as settling. */
export const GAS_CANCEL = 750_000n;
/** For the tour's attacks, which revert and so cannot be estimated. 25k–330k used. */
export const GAS_ATTACK = 400_000n;
/**
 * Funding a demo account lazily creates it on Hedera, which is why this is far more than a plain
 * transfer's 21,000. Measured at 608k on testnet.
 */
export const GAS_FUND_ACCOUNT = 800_000n;

/**
 * HBAR sent with `deployStableCoin`, forwarded to HTS token creation. The fee is priced in
 * dollars, so it costs more HBAR as HBAR falls: about 21 HBAR at $0.057. The Studio refunds
 * what it does not use.
 */
export const STABLECOIN_CREATE_VALUE_WEI = 40n * 10n ** 18n;
/** Refused up front rather than halfway through, when the operator cannot cover setup. */
export const SETUP_MIN_BALANCE_HBAR = 100;

/**
 * HBAR per demo party. The relay will not accept a transaction unless the sender can cover
 * `gas limit × gas price` up front — about 1 HBAR for a hold — so this is a float for a dozen
 * pledges, not the fee itself. What a party does not spend stays in their own account.
 */
export const PARTY_FUNDING_HBAR = "10";

export const MIRROR_POLL_ATTEMPTS = 6;
export const MIRROR_POLL_DELAY_MS = 2000;

// The security the issuer deploys. Named to match the native `dvp-settlement` template, so the
// two desks read as the same market told two ways.
export const SECURITY_NAME = "DvP Security";
export const SECURITY_SYMBOL = "DVPS";
/** A real ISIN: the factory checks the format and the checksum and refuses anything else. */
export const SECURITY_ISIN = "US0378331005";
export const SECURITY_MAX_SUPPLY = 1_000_000n;
export const SECURITY_NOMINAL_VALUE_CENTS = 10_000n;
export const SECURITY_NOMINAL_VALUE_DECIMALS = 2;

export const CASH_NAME = "DvP Stablecoin";
export const CASH_SYMBOL = "DVPC";
export const CASH_DECIMALS = 2;
export const CASH_UNITS_PER_DOLLAR = 100n;
/** The reserve starts above anything the demo can mint, so proof of reserve never blocks a mint. */
export const RESERVE_INITIAL_DOLLARS = 1_000_000n;

// The starting position, the same numbers the native template deals out.
export const SELLER_INITIAL_SECURITY = 200n;
export const BUYER_INITIAL_CASH = 20_000n;
export const UNVERIFIED_BUYER_INITIAL_CASH = 10_000n;

// The default ticket.
export const DEFAULT_QUANTITY = 100n;
export const DEFAULT_PRICE = 10_000n;
/** Minutes a `Not before a set time` trade may be delayed by. */
export const MAX_SETTLEMENT_DELAY_MINUTES = 60;
export const DEFAULT_SETTLEMENT_DELAY_MINUTES = 2;

/**
 * How long a pledge lives. Long enough that a reader can leave a trade open and come back, short
 * enough that an abandoned one unwinds itself: once it expires, each party reclaims their own
 * units from the token without the settlement contract and without this app.
 */
export const HOLD_LIFETIME_SECONDS = 2 * 60 * 60;
/**
 * Seconds a pledge must outlast its trade's settlement time by, fixed into the settlement
 * contract at deployment. It keeps the pledging party's own way out — reclaiming an expired
 * hold — from opening while the trade can still settle.
 */
export const SETTLEMENT_GRACE_SECONDS = 300n;

/** The ATS KYC record this desk writes. A real desk would carry a verifiable credential id here. */
export const KYC_VC_ID = "dvp-demo-kyc";
export const KYC_VALID_YEARS = 1;
