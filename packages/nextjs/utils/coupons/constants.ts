/** Shared constants for the coupon bond desk (client and server). */

/** Gas `CouponBond` gives each scheduled `payCoupon()`: its COUPON_GAS_BASE plus COUPON_GAS_PER_HOLDER a holder. */
export const couponGasLimit = (holders: number) => 2_000_000n + 750_000n * BigInt(holders);

/**
 * HBAR, in weibars as EVM balances read, the bond needs for `coupons` more scheduled calls. It pays for each one
 * itself, and the network charges up to the call's gas limit at the going gas price.
 */
export const hbarNeededFor = (coupons: bigint, holders: number, gasPrice: bigint) =>
  coupons * couponGasLimit(holders) * gasPrice;

/**
 * The most stablecoin one funding call will move. The desk mints 10,000,000, and a demo bond
 * needs thousands; a request for more than this is a mistake or someone else's idea.
 */
export const MAX_FUNDING_WHOLE = 1_000_000;

/** Decimals the desk's HTS stablecoin is created with. */
export const STABLECOIN_DECIMALS = 6;

export const MIRROR_BASE: Record<string, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
};

export const HEDERA_TESTNET_CHAIN_ID = 296;

/** Units Investor B tries to give itself in the tour's attack. */
export const GREEDY_UNITS = 1000;
