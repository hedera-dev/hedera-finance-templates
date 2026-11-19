/**
 * ABIs for the coupon bond desk. `CouponBond` is deployed per-bond by the factory, so it has
 * no entry in deployedContracts.ts; callers address it directly with this ABI.
 */

export const couponBondAbi = [
  {
    type: "constructor",
    stateMutability: "payable",
    inputs: [
      { name: "issuer", type: "address" },
      { name: "bondName", type: "string" },
      { name: "stablecoin_", type: "address" },
      { name: "faceValue_", type: "uint256" },
      { name: "couponRateBps_", type: "uint256" },
      { name: "periodSeconds_", type: "uint256" },
      { name: "couponCount_", type: "uint256" },
    ],
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "stablecoin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "faceValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "couponRateBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodSeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "couponCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "currentCoupon",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "dueTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "currentSchedule",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "holdersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allHolders",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "unitsOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "couponAmountFor",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "principalAmountFor",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "unpaidOf",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "totalUnpaid",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "claimFor",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "stablecoinNeeded",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allocate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "holder", type: "address" },
      { name: "units", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "start", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "stop", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "payCoupon", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "event",
    name: "Allocated",
    anonymous: false,
    inputs: [
      { name: "holder", type: "address", indexed: true },
      { name: "units", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Started",
    anonymous: false,
    inputs: [{ name: "dueTime", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "CouponScheduled",
    anonymous: false,
    inputs: [
      { name: "coupon", type: "uint256", indexed: true },
      { name: "scheduleAddress", type: "address", indexed: true },
      { name: "expirySecond", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SchedulingFailed",
    anonymous: false,
    inputs: [
      { name: "coupon", type: "uint256", indexed: true },
      { name: "dueTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CouponPaid",
    anonymous: false,
    inputs: [
      { name: "coupon", type: "uint256", indexed: true },
      { name: "totalPaid", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CouponUnpaid",
    anonymous: false,
    inputs: [
      { name: "coupon", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    anonymous: false,
    inputs: [
      { name: "holder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CouponMissed",
    anonymous: false,
    inputs: [{ name: "coupon", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "PrincipalRepaid",
    anonymous: false,
    inputs: [
      { name: "coupon", type: "uint256", indexed: true },
      { name: "totalPaid", type: "uint256", indexed: false },
    ],
  },
  { type: "event", name: "Stopped", anonymous: false, inputs: [] },
  { type: "error", name: "NotCreated", inputs: [] },
  { type: "error", name: "NotRunning", inputs: [] },
  { type: "error", name: "NotDue", inputs: [] },
  { type: "error", name: "NoHolders", inputs: [] },
  { type: "error", name: "TooManyHolders", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "AssociateFailed", inputs: [{ name: "responseCode", type: "uint256" }] },
  { type: "error", name: "DeleteScheduleFailed", inputs: [{ name: "responseCode", type: "int64" }] },
  { type: "error", name: "NothingToClaim", inputs: [] },
  // OpenZeppelin's Ownable, which guards every issuer-only function.
  { type: "error", name: "OwnableUnauthorizedAccount", inputs: [{ name: "account", type: "address" }] },
] as const;

/** Bond status enum, matching `CouponBond.Status`. */
export const BOND_STATUS = ["CREATED", "RUNNING", "MATURED", "STOPPED"] as const;
export type BondStatus = (typeof BOND_STATUS)[number];

/** Minimal ERC-20 surface the stablecoin is read/written through. */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** HIP-719 facade every HTS token exposes at its own EVM address. */
export const hip719Abi = [
  {
    type: "function",
    name: "associate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "responseCode", type: "uint256" }],
  },
  {
    type: "function",
    name: "isAssociated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;
