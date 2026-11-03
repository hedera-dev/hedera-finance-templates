// Server-only: the slices of the ATS factory, resolver and security, and of the desk's own contracts, the desk uses.
// viem's human-readable ABI needs named structs, so each nested struct is declared once and referenced by name.
import { atsErrorsAbi } from "./atsErrors";
import { parseAbi } from "viem";

const factoryStructs = [
  "struct ResolverProxyConfiguration { bytes32 key; uint256 version; }",
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Rbac { bytes32 role; address[] members; }",
  "struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfiguration resolverProxyConfiguration; Erc20MetadataInfo erc20MetadataInfo; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }",
  "struct BondDetailsData { bytes3 currency; uint256 nominalValue; uint8 nominalValueDecimals; uint256 startingDate; uint256 maturityDate; }",
  "struct BondData { SecurityData security; BondDetailsData bondDetails; address[] proceedRecipients; bytes[] proceedRecipientsData; }",
  "struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }",
  "struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }",
] as const;

export const factoryAbi = parseAbi([
  ...factoryStructs,
  "function deployBond(BondData _bondData, FactoryRegulationData _factoryRegulationData) returns (address bondAddress_)",
  "event BondDeployed(address indexed deployer, address bondAddress, BondData bondData, FactoryRegulationData regulationData)",
]);

export const resolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 configurationId) view returns (uint256)",
]);

export const securityAbi = parseAbi([
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Erc20Metadata { Erc20MetadataInfo info; uint8 securityType; }",
  "function getERC20Metadata() view returns (Erc20Metadata)",
  "function getNominalValue() view returns (uint256)",
  "function getNominalValueDecimals() view returns (uint8)",
  "function getNominalValueCurrency() view returns (bytes3)",
  "function getMaxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function issue(address holder, uint256 amount, bytes data)",
  "function addToControlList(address account) returns (bool)",
  "function isInControlList(address account) view returns (bool)",
  "function grantRole(bytes32 role, address account) returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleMembers(bytes32 role, uint256 pageIndex, uint256 pageLength) view returns (address[])",
  "event RoleGranted(address indexed operator, address indexed account, bytes32 indexed role)",
]);

export const priceFeedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

export const gateErrorsAbi = parseAbi([
  "error NotAllowedToIssue(address caller)",
  "error ZeroAmount()",
  "error PriceNotPositive(int256 answer)",
  "error PriceStale(uint256 updatedAt, uint256 maxAge)",
  "error ReserveNegative(int256 answer)",
  "error DecimalsTooLarge()",
  "error ReserveDoesNotCover(uint256 reserveValue, uint256 liabilityAfter)",
  "error OwnableUnauthorizedAccount(address account)",
]);

export const gateAbi = parseAbi([
  "function issue(address holder, uint256 amount)",
  "function setIssuer(address account, bool allowed)",
  "function isAllowedToIssue(address account) view returns (bool)",
  "function headroom() view returns (uint256)",
  "function maxPriceAge() view returns (uint256)",
]);

/** Every error the desk can meet, for decoding a revert to its name. */
export const allErrorsAbi = [...atsErrorsAbi, ...gateErrorsAbi] as const;
