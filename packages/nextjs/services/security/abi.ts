// Server-only: hand-written ABI fragments for the ATS v8 factory, the business-logic resolver,
// the deployed security token, and this repo's own board.
//
// The published ATS package ships no factory ABI, so these are written from the contracts'
// source at the **`v.8.0.0-ats` tag**, which is what is deployed on testnet. The repository's
// `main` has drifted from it (`resolverProxyConfigurationV2`, an extra equity details field) and
// taking shapes from there produces calls the deployed factory rejects.
//
// viem's `parseAbi` human-readable format needs named structs rather than inline tuples, so each
// nested struct is declared once and referenced by name.
import { parseAbi } from "viem";

const factoryStructs = [
  "struct ResolverProxyConfiguration { bytes32 key; uint256 version; }",
  "struct Erc20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }",
  "struct Rbac { bytes32 role; address[] members; }",
  "struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfiguration resolverProxyConfiguration; Erc20MetadataInfo erc20MetadataInfo; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }",
  "struct EquityDetailsData { bool votingRight; bool informationRight; bool liquidationRight; bool subscriptionRight; bool conversionRight; bool redemptionRight; bool putRight; uint8 dividendRight; bytes3 currency; uint256 nominalValue; uint8 nominalValueDecimals; }",
  "struct EquityData { SecurityData security; EquityDetailsData equityDetails; }",
  "struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }",
  "struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }",
] as const;

/** Custom errors surfaced across the factory and the token's facets, decoded back to their name. */
export const atsErrors = [
  "error AccountIsBlocked(address account)",
  "error AccountHasNoRole(address account, bytes32 role)",
  "error AccountHasNoRoles(address account, bytes32[] roles)",
  "error AccountAssignedToRole(bytes32 role, address account)",
  "error AccountNotAssignedToRole(bytes32 role, address account)",
  "error InvalidKycStatus()",
  "error KycIsNotGranted()",
  "error InvalidFreezeAmount()",
  "error IsPaused()",
  "error IsUnpaused()",
  "error TokenIsNotControllable()",
  "error ListedAccount(address account)",
  "error AccountIsNotIssuer(address issuer)",
  "error ListedIssuer(address issuer)",
  "error UnlistedIssuer(address issuer)",
  "error UnlistedAccount(address account)",
  "error WrongISIN(string isin)",
  "error WrongISINChecksum(string isin)",
  "error VersionZero(bytes32 configurationId)",
  "error RegulationTypeAndSubTypeForbidden(uint8 regulationType, uint8 regulationSubType)",
  "error MaxSupplyReached(uint256 maxSupply)",
  "error NoInitialAdmins()",
  "error EmptyResolver(address resolver)",
  "error ZeroAddressNotAllowed()",
  "error ZeroValueNotAllowed()",
  "error InvalidZeroAddress()",
  "error AlreadyInitialized()",
  "error UnexpectedError(bytes4 _errorId)",
] as const;

export const factoryAbi = parseAbi([
  ...factoryStructs,
  "function deployEquity(EquityData _equityData, FactoryRegulationData _factoryRegulationData) external returns (address equityAddress_)",
  "event EquityDeployed(address indexed deployer, address equityAddress, EquityData equityData, FactoryRegulationData regulationData)",
  ...atsErrors,
]);

export const resolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 configurationId) view returns (uint256)",
  ...atsErrors,
]);

/**
 * The slice of the deployed security this desk touches. Every selector here was checked against
 * the equity configuration on the deployed resolver before being written down.
 *
 * `getKycStatusFor` returns ATS's `KycStatus` enum: 0 is not granted, 1 is granted.
 */
export const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function paused() view returns (bool)",
  "function isFrozen(address account) view returns (bool)",
  "function getFrozenTokens(address account) view returns (uint256)",
  "function getKycStatusFor(address account) view returns (uint8)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function isInControlList(address account) view returns (bool)",
  "function isIssuer(address issuer) view returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function issue(address holder, uint256 amount, bytes data)",
  "function addToControlList(address account) returns (bool)",
  "function addIssuer(address issuer) returns (bool)",
  "function removeFromControlList(address account) returns (bool)",
  "function grantKyc(address account, string vcId, uint256 validFrom, uint256 validTo, address issuer) returns (bool)",
  "function revokeKyc(address account) returns (bool)",
  "function setAddressFrozen(address account, bool status)",
  "function pause() returns (bool)",
  "function unpause() returns (bool)",
  "function controllerRedeemByPartition(bytes32 partition, address from, uint256 value, bytes data, bytes operatorData)",
  ...atsErrors,
]);

/** This repo's own contract. Its bytecode comes from the Foundry artifact; see `artifacts.ts`. */
export const boardAbi = parseAbi([
  "constructor(address[3] officers)",
  "function propose(address target, bytes data) returns (uint256 id)",
  "function approve(uint256 id)",
  "function cancel(uint256 id)",
  "function isOfficer(address account) view returns (bool)",
  "function getOfficers() view returns (address[3])",
  "function approvedBy(uint256 id, address officer) view returns (bool)",
  "function getProposal(uint256 id) view returns (address target, bytes data, uint256 expiresAt, address proposer, uint8 approvals, bool executed, bool cancelled)",
  "function APPROVALS_REQUIRED() view returns (uint8)",
  "event Proposed(uint256 indexed id, address indexed proposer, address target, bytes data, uint256 expiresAt)",
  "event Approved(uint256 indexed id, address indexed officer, uint8 approvals)",
  "event Executed(uint256 indexed id, address indexed target)",
  "event Cancelled(uint256 indexed id)",
  "error NotOfficer(address caller)",
  "error NotProposer(address caller, address proposer)",
  "error UnknownProposal(uint256 id)",
  "error AlreadySettled(uint256 id)",
  "error AlreadyApproved(uint256 id, address officer)",
  "error ProposalExpired(uint256 id, uint256 expiresAt)",
  "error OfficersNotDistinct()",
  "error CallReverted()",
]);

/**
 * What the board is actually called with. A board approval makes the token's call, and the board
 * bubbles the token's revert data up unchanged — so decoding the refusal needs the token's error
 * definitions alongside the board's own.
 */
export const boardCallAbi = [...boardAbi, ...parseAbi(atsErrors)] as const;
