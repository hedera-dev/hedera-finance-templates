// Server-only: hand-written ABI fragments for the ATS v8 factory, the business-logic resolver,
// and the deployed bond itself. The published `@hashgraph/asset-tokenization-contracts` package
// ships no Factory ABI, so these are written from the ATS contracts source (struct shapes,
// function and error signatures) per the spec. viem's `parseAbi` human-readable format needs
// named structs (no inline anonymous tuples), so every nested struct is declared once and
// referenced by name.
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

/** Custom errors surfaced across the factory and the bond's facets, decoded back to their name. */
const atsErrors = [
  "error AccountIsBlocked(address account)",
  "error ListedAccount(address account)",
  "error UnlistedAccount(address account)",
  "error WrongISIN(string isin)",
  "error WrongISINChecksum(string isin)",
  "error WrongDates(uint256 firstDate, uint256 secondDate)",
  "error VersionZero(bytes32 configurationId)",
  "error RegulationTypeAndSubTypeForbidden(uint8 regulationType, uint8 regulationSubType)",
  "error MaxSupplyReached(uint256 maxSupply)",
  "error NoInitialAdmins()",
  "error EmptyResolver(address resolver)",
] as const;

export const factoryAbi = parseAbi([
  ...factoryStructs,
  "function deployBond(BondData _bondData, FactoryRegulationData _factoryRegulationData) external returns (address bondAddress_)",
  "event BondDeployed(address indexed deployer, address bondAddress, BondData bondData, FactoryRegulationData regulationData)",
  ...atsErrors,
]);

export const resolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 configurationId) view returns (uint256)",
  ...atsErrors,
]);

const bondStructs = [
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Erc20Metadata { Erc20MetadataInfo info; uint8 securityType; }",
] as const;

export const bondAbi = parseAbi([
  ...bondStructs,
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getERC20Metadata() view returns (Erc20Metadata)",
  "function getMaturityDate() view returns (uint256)",
  "function getNominalValue() view returns (uint256)",
  "function getNominalValueDecimals() view returns (uint8)",
  "function getNominalValueCurrency() view returns (bytes3)",
  "function getMaxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function addToControlList(address account) returns (bool)",
  "function removeFromControlList(address account) returns (bool)",
  "function isInControlList(address account) view returns (bool)",
  "function getControlListType() view returns (bool)",
  "function issue(address holder, uint256 amount, bytes data)",
  "function transfer(address to, uint256 amount) returns (bool)",
  ...atsErrors,
]);
