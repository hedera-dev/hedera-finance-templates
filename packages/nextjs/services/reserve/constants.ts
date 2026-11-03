// Server-only constants for the reserve desk. Testnet only.
import type { Address, Hex } from "viem";

export const HASHIO_RPC_URL = "https://testnet.hashio.io/api";
export const MIRROR_URL = "https://testnet.mirrornode.hedera.com";
export const HASHSCAN_URL = "https://hashscan.io/testnet";

// ATS on Hedera testnet, version 8.
export const ATS_FACTORY_CONTRACT_ID = "0.0.9213391";
export const ATS_RESOLVER_CONTRACT_ID = "0.0.9212226";
export const BOND_CONFIG_ID: Hex = "0x0000000000000000000000000000000000000000000000000000000000000002";

// Chainlink BTC/USD on Hedera testnet.
export const BTC_USD_FEED: Address = "0x058fE79CB5775d4b167920Ca6036B824805A9ABd";

export const ROLES = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  issuer: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  agent: "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b",
  controlList: "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",
} as const satisfies Record<string, Hex>;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

// Hedera bills at least 80% of the gas limit, so these sit close to need. An ATS deployment uses about 7.2M.
export const GAS_DEPLOY_ATS = 8_000_000n;
/** Headroom over `eth_estimateGas` for ordinary calls. */
export const GAS_ESTIMATE_MARGIN_PERCENT = 125n;

// The desk's economics.
export const COLLATERAL_MAX_SUPPLY = 1_000_000n;
export const RESERVE_COLLATERAL_UNITS = 5n;
export const ASSET_MAX_SUPPLY = 1_000_000n;
/** USD face value per asset unit, stored by ATS with 2 decimals. */
export const ASSET_FACE_VALUE_USD = 1_000;
export const NOMINAL_VALUE_DECIMALS = 2;
/** The price feed's answer may be at most this old, in seconds, for the gate to use it. */
export const MAX_PRICE_AGE_SECONDS = 24 * 60 * 60;
/** HBAR sent to the reserve address so it can pay for moving collateral out. */
export const RESERVE_GAS_FUNDING_WEI = 2n * 10n ** 18n;

// Upper bounds, so a mistyped amount cannot move the desk's whole position.
export const MAX_ISSUE_UNITS = 100_000n;
export const MAX_WITHDRAW_UNITS = 1_000n;
export const MAX_WALLET_HOLDERS = 3;
