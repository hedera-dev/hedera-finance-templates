// Server-only (and the wallet's pledge): the slices of the ATS v8 factory and security, of the
// Stablecoin Studio factory, proxy and HTS facade, and of this repo's own settlement contract.
//
// Neither published package ships a factory ABI, so these are written from the contracts' source
// at the **`v.8.0.0-ats` tag**, which is what is deployed on testnet. The ATS repository's `main`
// has drifted from it (`resolverProxyConfigurationV2`, an extra equity details field) and taking
// shapes from there produces calls the deployed factory rejects.
//
// viem's `parseAbi` human-readable format needs named structs rather than inline tuples, so each
// nested struct is declared once and referenced by name.
import { parseAbi } from "viem";

// ------------------------------------------------------------------ ATS

const atsFactoryStructs = [
  "struct ResolverProxyConfiguration { bytes32 key; uint256 version; }",
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Rbac { bytes32 role; address[] members; }",
  "struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfiguration resolverProxyConfiguration; Erc20MetadataInfo erc20MetadataInfo; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }",
  "struct EquityDetailsData { bool votingRight; bool informationRight; bool liquidationRight; bool subscriptionRight; bool conversionRight; bool redemptionRight; bool putRight; uint8 dividendRight; bytes3 currency; uint256 nominalValue; uint8 nominalValueDecimals; }",
  "struct EquityData { SecurityData security; EquityDetailsData equityDetails; }",
  "struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }",
  "struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }",
] as const;

/** Custom errors surfaced across the factory and the security's facets, decoded back to their name. */
export const atsErrors = [
  "error AccountIsBlocked(address account)",
  "error AccountHasNoRole(address account, bytes32 role)",
  "error AccountHasNoRoles(address account, bytes32[] roles)",
  "error InvalidKycStatus()",
  "error KycIsNotGranted()",
  "error IsPaused()",
  "error IsUnpaused()",
  "error ListedAccount(address account)",
  "error UnlistedAccount(address account)",
  "error AccountIsNotIssuer(address issuer)",
  "error ListedIssuer(address issuer)",
  "error UnlistedIssuer(address issuer)",
  "error WrongISIN(string isin)",
  "error WrongISINChecksum(string isin)",
  "error VersionZero(bytes32 configurationId)",
  "error RegulationTypeAndSubTypeForbidden(uint8 regulationType, uint8 regulationSubType)",
  "error MaxSupplyReached(uint256 maxSupply)",
  // The hold errors, from `IHoldTypes` at the v8 tag. The first three were each measured on
  // testnet against a live ATS equity while designing this template.
  "error HoldExpirationNotReached()",
  "error InvalidDestinationAddress(address holdDestination, address to)",
  "error IsNotEscrow()",
  "error HoldExpirationReached()",
  "error InsufficientHoldBalance(uint256 holdAmount, uint256 amount)",
  "error InvalidHoldAmount()",
  "error WrongHoldId()",
  "error WrongExpirationTimestamp()",
  "error ZeroAddressNotAllowed()",
  "error ZeroValueNotAllowed()",
  "error UnexpectedError(bytes4 _errorId)",
] as const;

export const atsFactoryAbi = parseAbi([
  ...atsFactoryStructs,
  "function deployEquity(EquityData _equityData, FactoryRegulationData _factoryRegulationData) external returns (address equityAddress_)",
  "event EquityDeployed(address indexed deployer, address equityAddress, EquityData equityData, FactoryRegulationData regulationData)",
  ...atsErrors,
]);

export const resolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 configurationId) view returns (uint256)",
  ...atsErrors,
]);

/**
 * The slice of the deployed security this desk touches, holds included. Every selector here was
 * checked against the equity configuration on the deployed resolver before being written down.
 *
 * `getKycStatusFor` returns ATS's `KycStatus` enum: 0 is not granted, 1 is granted.
 * `getHoldForByPartition` returns SEVEN values on the deployed version, not the five of the
 * struct: the trailing `operatorData` and `thirdPartyType` are easy to leave off and the decode
 * then fails.
 */
export const securityAbi = parseAbi([
  "struct Hold { uint256 amount; uint256 expirationTimestamp; address escrow; address to; bytes data; }",
  "struct HoldIdentifier { bytes32 partition; address tokenHolder; uint256 holdId; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function getKycStatusFor(address account) view returns (uint8)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function isInControlList(address account) view returns (bool)",
  "function isIssuer(address issuer) view returns (bool)",
  "function issue(address holder, uint256 amount, bytes data)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function addToControlList(address account) returns (bool)",
  "function removeFromControlList(address account) returns (bool)",
  "function addIssuer(address issuer) returns (bool)",
  "function grantKyc(address account, string vcId, uint256 validFrom, uint256 validTo, address issuer) returns (bool)",
  "function revokeKyc(address account) returns (bool)",
  "function createHoldByPartition(bytes32 _partition, Hold _hold) returns (bool success_, uint256 holdId_)",
  "function executeHoldByPartition(HoldIdentifier _holdIdentifier, address _to, uint256 _amount) returns (bool success_, bytes32 partition_)",
  "function releaseHoldByPartition(HoldIdentifier _holdIdentifier, uint256 _amount) returns (bool success_)",
  "function reclaimHoldByPartition(HoldIdentifier _holdIdentifier) returns (bool success_)",
  "function getHeldAmountForByPartition(bytes32 _partition, address _tokenHolder) view returns (uint256 amount_)",
  "function getHoldForByPartition(HoldIdentifier _holdIdentifier) view returns (uint256 amount_, uint256 expirationTimestamp_, address escrow_, address destination_, bytes data_, bytes operatorData_, uint8 thirdPartyType_)",
  "event HeldByPartition(address indexed operator, address indexed tokenHolder, bytes32 partition, uint256 holdId, Hold hold, bytes operatorData)",
  ...atsErrors,
]);

// -------------------------------------------------------- Stablecoin Studio

const studioStructs = [
  "struct ResolverProxyConfiguration { bytes32 key; uint256 version; }",
  "struct KeysStruct { uint256 keyType; bytes publicKey; bool isEd25519; }",
  "struct RolesStruct { bytes32 role; address account; }",
  "struct CashinRoleStruct { address account; uint256 allowance; }",
  "struct TokenStruct { string tokenName; string tokenSymbol; bool freeze; bool supplyType; int64 tokenMaxSupply; int64 tokenInitialSupply; int32 tokenDecimals; address reserveAddress; int256 reserveInitialAmount; bool createReserve; KeysStruct[] keys; RolesStruct[] roles; CashinRoleStruct cashinRole; string metadata; address businessLogicResolverAddress; ResolverProxyConfiguration stableCoinConfigurationId; ResolverProxyConfiguration reserveConfigurationId; }",
  "struct DeployedStableCoin { address stableCoinProxy; address tokenAddress; address reserveProxy; }",
] as const;

export const studioFactoryAbi = parseAbi([
  ...studioStructs,
  "function deployStableCoin(TokenStruct requestedToken) payable returns (DeployedStableCoin)",
  "event Deployed(DeployedStableCoin deployedStableCoin)",
]);

/**
 * The stablecoin proxy: management, roles and holds. Value does not move here — it moves through
 * the HTS token at `getTokenAddress()` — but a hold is created, read and executed on the proxy.
 *
 * Amounts are `int64`, the HTS width, where the ATS security's are `uint256`.
 * `getHoldFor` returns SIX values, one fewer than the ATS reader: no partition, no third-party
 * type.
 */
export const stablecoinAbi = parseAbi([
  "struct Hold { int64 amount; uint256 expirationTimestamp; address escrow; address to; bytes data; }",
  "struct HoldIdentifier { address tokenHolder; uint256 holdId; }",
  "function getTokenAddress() view returns (address)",
  "function getReserveAddress() view returns (address)",
  "function getReserveAmount() view returns (int256 amount_, uint256 updatedAt_)",
  "function decimals() view returns (uint8)",
  "function mint(address _account, int64 _amount) returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantUnlimitedSupplierRole(address supplier)",
  "function isUnlimitedSupplierAllowance(address supplier) view returns (bool)",
  "function createHold(Hold _hold) returns (bool success_, uint256 holdId_)",
  "function executeHold(HoldIdentifier _holdIdentifier, address _to, int64 _amount) returns (bool success_)",
  "function releaseHold(HoldIdentifier _holdIdentifier, int64 _amount) returns (bool success_)",
  "function reclaimHold(HoldIdentifier _holdIdentifier) returns (bool success_)",
  "function getHeldAmountFor(address _tokenHolder) view returns (int64 amount_)",
  "function getHoldCountFor(address _tokenHolder) view returns (uint256 holdCount_)",
  "function getHoldFor(HoldIdentifier _holdIdentifier) view returns (int64 amount_, uint256 expirationTimestamp_, address escrow_, address destination_, bytes data_, bytes operatorData_)",
  "event HoldCreated(address indexed operator, address indexed tokenHolder, uint256 holdId, Hold hold, bytes operatorData)",
  // The Studio's own hold errors, from `IHoldManagement`.
  "error InvalidExpiration(uint256 provided, uint256 current)",
  "error InsufficientHoldAmount(int64 required, int64 available)",
  "error HoldNotFound(address tokenHolder, uint256 holdId)",
  "error UnauthorizedEscrow(address caller, address escrow)",
  "error HoldExpired(uint256 expirationTime)",
  "error HoldNotExpired(uint256 expirationTime)",
  "error InvalidDestination(address expected, address provided)",
  "error AccountHasNoRole(address account, bytes32 role)",
]);

/** The HTS token's ERC-20 facade, plus HRC-719 `associate()`. Free balance is read here. */
export const cashAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function associate() returns (uint256)",
  "function isAssociated() view returns (bool)",
]);

// ------------------------------------------------------- the desk's contract

/** This repo's own contract. Its bytecode comes from the Foundry artifact; see `artifacts.ts`. */
export const settlementAbi = parseAbi([
  "struct Trade { address seller; address buyer; uint256 quantity; uint256 price; uint256 notBefore; uint256 securityHoldId; uint256 cashHoldId; uint8 state; }",
  "constructor(address security, address cash, uint256 graceSeconds)",
  "function security() view returns (address)",
  "function cash() view returns (address)",
  "function graceSeconds() view returns (uint256)",
  "function nextTradeId() view returns (uint256)",
  "function getTrade(uint256 tradeId) view returns (Trade)",
  "function isSettleable(uint256 tradeId) view returns (bool)",
  "function propose(address buyer, uint256 quantity, uint256 price, uint256 notBefore) returns (uint256 tradeId)",
  "function lockSecurity(uint256 tradeId, uint256 holdId)",
  "function lockCash(uint256 tradeId, uint256 holdId)",
  "function settle(uint256 tradeId)",
  "function cancel(uint256 tradeId)",
  "event TradeProposed(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 quantity, uint256 price, uint256 notBefore)",
  "event SecurityPledged(uint256 indexed tradeId, uint256 holdId)",
  "event CashPledged(uint256 indexed tradeId, uint256 holdId)",
  "event TradeSettled(uint256 indexed tradeId, uint256 quantity, uint256 price)",
  "event TradeCancelled(uint256 indexed tradeId, address indexed by)",
  "error BadParameters()",
  "error UnknownTrade(uint256 tradeId)",
  "error WrongState(uint8 state)",
  "error NotAParty(address caller)",
  "error AlreadyPledged(uint256 tradeId)",
  "error SecurityNotPledged(uint256 tradeId)",
  "error CashNotPledged(uint256 tradeId)",
  "error TooEarly(uint256 notBefore, uint256 nowTime)",
  "error HoldEscrowMismatch(address expected, address actual)",
  "error HoldDestinationMismatch(address expected, address actual)",
  "error HoldTooSmall(uint256 held, uint256 required)",
  "error HoldExpiresTooSoon(uint256 expiry, uint256 required)",
  "error HoldAlreadyUsed(address pledger, uint256 holdId)",
  "error AmountTooLarge(uint256 amount)",
  "error ExecuteFailed()",
  "error ReleaseFailed()",
]);

/**
 * What `settle` is actually called with. Settlement makes both tokens' calls, and a token's
 * revert data comes back up unchanged — so decoding the refusal needs both tokens' error
 * definitions alongside the settlement contract's own.
 */
export const settlementCallAbi = [...settlementAbi, ...parseAbi(atsErrors)] as const;
