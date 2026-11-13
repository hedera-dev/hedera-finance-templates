// Server-only (and the wallet's pledge): the slices of the ATS factory, resolver and bond, of the Stablecoin
// Studio factory and proxy, and of the desk's own contracts. viem's human-readable ABI needs named structs, so each
// nested struct is declared once and referenced by name.
import { atsErrorsAbi } from "./atsErrors";
import { parseAbi } from "viem";

// ------------------------------------------------------------------ ATS

const atsFactoryStructs = [
  "struct ResolverProxyConfiguration { bytes32 key; uint256 version; }",
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Rbac { bytes32 role; address[] members; }",
  "struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfiguration resolverProxyConfiguration; Erc20MetadataInfo erc20MetadataInfo; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }",
  "struct BondDetailsData { bytes3 currency; uint256 nominalValue; uint8 nominalValueDecimals; uint256 startingDate; uint256 maturityDate; }",
  "struct BondData { SecurityData security; BondDetailsData bondDetails; address[] proceedRecipients; bytes[] proceedRecipientsData; }",
  "struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }",
  "struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }",
] as const;

export const atsFactoryAbi = parseAbi([
  ...atsFactoryStructs,
  "function deployBond(BondData _bondData, FactoryRegulationData _factoryRegulationData) returns (address bondAddress_)",
  "event BondDeployed(address indexed deployer, address bondAddress, BondData bondData, FactoryRegulationData regulationData)",
]);

export const resolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 configurationId) view returns (uint256)",
]);

/** The bond, including the hold functions. Holds take uint256 amounts; the Studio's take int64. */
export const billAbi = parseAbi([
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Erc20Metadata { Erc20MetadataInfo info; uint8 securityType; }",
  "struct Hold { uint256 amount; uint256 expirationTimestamp; address escrow; address to; bytes data; }",
  "struct HoldIdentifier { bytes32 partition; address tokenHolder; uint256 holdId; }",
  "function getERC20Metadata() view returns (Erc20Metadata)",
  "function getNominalValue() view returns (uint256)",
  "function getNominalValueDecimals() view returns (uint8)",
  "function getNominalValueCurrency() view returns (bytes3)",
  "function getMaturityDate() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function issue(address holder, uint256 amount, bytes data)",
  "function addToControlList(address account) returns (bool)",
  "function isInControlList(address account) view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleMembers(bytes32 role, uint256 pageIndex, uint256 pageLength) view returns (address[])",
  "function createHoldByPartition(bytes32 _partition, Hold _hold) returns (bool success_, uint256 holdId_)",
  "function reclaimHoldByPartition(HoldIdentifier _holdIdentifier) returns (bool success_)",
  "function releaseHoldByPartition(HoldIdentifier _holdIdentifier, uint256 _amount) returns (bool success_)",
  "function executeHoldByPartition(HoldIdentifier _holdIdentifier, address _to, uint256 _amount) returns (bool success_, bytes32 partition_)",
  "function getHeldAmountForByPartition(bytes32 _partition, address _tokenHolder) view returns (uint256 amount_)",
  "function getHoldForByPartition(HoldIdentifier _holdIdentifier) view returns (uint256 amount_, uint256 expirationTimestamp_, address escrow_, address destination_, bytes data_, bytes operatorData_, uint8 thirdPartyType_)",
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

/** The stablecoin proxy: management. Value does not move here; it moves through the HTS token address. */
export const stablecoinAbi = parseAbi([
  "function getTokenAddress() view returns (address)",
  "function getReserveAddress() view returns (address)",
  "function getReserveAmount() view returns (int256 amount_, uint256 updatedAt_)",
  "function mint(address _account, int64 _amount) returns (bool)",
  "function grantUnlimitedSupplierRole(address supplier)",
  "function isUnlimitedSupplierAllowance(address supplier) view returns (bool)",
  "function decimals() view returns (uint8)",
]);

export const reserveAbi = parseAbi(["function decimals() view returns (uint8)"]);

/** The HTS token's ERC-20 facade, plus HRC-719 `associate()`. */
export const cashAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function associate() returns (uint256)",
]);

// ------------------------------------------------------ the desk's contracts

export const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function daysRemaining() view returns (uint256)",
  "function discountRateBps() view returns (uint256)",
  "function maturityTimestamp() view returns (uint256)",
  "function secondsPerDay() view returns (uint256)",
  "function pinnedUpdatedAt() view returns (uint256)",
  "function setDiscountRate(uint256 rateBps)",
  "function pinUpdatedAt(uint256 updatedAt)",
  "function setMaturityTimestamp(uint256 maturityTimestamp_)",
]);

export const repoErrorsAbi = parseAbi([
  "error NotLender(address caller)",
  "error NotBorrower(address caller)",
  "error UnknownLoan(uint256 loanId)",
  "error WrongState(uint8 state)",
  "error ZeroAmount()",
  "error BadParameters()",
  "error AmountTooLarge(uint256 amount, uint256 maximum)",
  "error HoldEscrowMismatch(address expected, address actual)",
  "error HoldDestinationMismatch(address expected, address actual)",
  "error HoldTooSmall(uint256 held, uint256 required)",
  "error HoldExpiresTooSoon(uint256 expiry, uint256 required)",
  "error HoldAlreadyUsed(address borrower, uint256 holdId)",
  "error ExceedsCapacity(uint256 requested8, uint256 capacity8)",
  "error PriceInvalid(int256 answer)",
  "error PriceStale(uint256 updatedAt, uint256 maxAge)",
  "error NotLiquidatable(uint256 ltvBps, uint256 thresholdBps)",
  "error ReleaseFailed()",
  "error ExecuteFailed()",
  "error ReentrancyGuardReentrantCall()",
  "error OwnableUnauthorizedAccount(address account)",
  "error SafeERC20FailedOperation(address token)",
]);

const repoStructs = [
  "struct Loan { address borrower; address lender; uint256 collateral; uint256 holdId; uint256 principal; uint256 accrued; uint256 accruedDay; uint256 repoRateBps; uint256 openedAt; uint256 termDays; uint256 openPrice8; uint8 state; }",
  "struct Position { uint8 state; int256 rawPrice; uint256 updatedAt; bool priceUsable; uint256 value8; uint256 principal; uint256 interest; uint256 debt; uint256 ltvBps; uint256 liquidationPrice8; uint256 termRemainingDays; bool termElapsed; }",
] as const;

export const repoAbi = parseAbi([
  ...repoStructs,
  "function openLoan(address borrower, uint256 holdId, uint256 collateral, uint256 principalUnits, uint256 repoRateBps, uint256 termDays) returns (uint256 loanId)",
  "function repay(uint256 loanId)",
  "function topUp(uint256 loanId, uint256 amountUnits)",
  "function liquidate(uint256 loanId)",
  "function validateOpen(address borrower, uint256 holdId, uint256 collateral, uint256 principalUnits, uint256 termDays) view returns (uint256 price, uint256 value8, uint256 capacity8)",
  "function getLoan(uint256 loanId) view returns (Loan)",
  "function position(uint256 loanId) view returns (Position)",
  "function haircutBps() view returns (uint256)",
  "function liquidationThresholdBps() view returns (uint256)",
  "function graceSeconds() view returns (uint256)",
  "function nextLoanId() view returns (uint256)",
  "event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 collateral, uint256 holdId, uint256 principal)",
  "event LoanLiquidated(uint256 indexed loanId, bool byTerm)",
]);

/** Every error the desk can meet, for decoding a revert to its name. */
export const allErrorsAbi = [...atsErrorsAbi, ...repoErrorsAbi] as const;
