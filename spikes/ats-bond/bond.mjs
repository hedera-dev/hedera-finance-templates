// ATS bond spike: issue a bond through the Asset Tokenization Studio v8 testnet factory with a
// plain operator key over JSON-RPC (the ATS SDK has no private-key signer), then read it back.
// Run: HEDERA_OPERATOR_ID=0.0.x HEDERA_OPERATOR_KEY=<ecdsa hex> node bond.mjs
import assert from "node:assert/strict";
import { ethers } from "ethers";

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const FACTORY_ID = "0.0.9213391"; // v8, from apps/ats/web/.env.example
const RESOLVER_ID = "0.0.9212226";
const BOND_CONFIG_ID = "0x" + "0".repeat(63) + "2"; // packages/ats/contracts/scripts/domain/constants.ts
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
// constants/roles.sol: issue() needs ROLE_ISSUER, addToControlList() needs ROLE_CONTROL_LIST
const ROLE_ISSUER = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
const ROLE_CONTROL_LIST = "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d";

const evmOf = async id => (await (await fetch(`${MIRROR}/contracts/${id}`)).json()).evm_address;

const security = `tuple(address resolver, uint256 maxSupply, tuple(bytes32 key, uint256 version) resolverProxyConfiguration,
  tuple(string name, string symbol, string isin, uint8 decimals) erc20MetadataInfo,
  tuple(bytes32 role, address[] members)[] rbacs, address[] externalPauses, address[] externalControlLists,
  address[] externalKycLists, address compliance, address identityRegistry, bool arePartitionsProtected,
  bool isMultiPartition, bool isControllable, bool isWhiteList, bool clearingActive, bool internalKycActivated,
  bool erc20VotesActivated)`;
const factoryAbi = [
  `function deployBond(tuple(${security} security, tuple(bytes3 currency, uint256 nominalValue, uint8 nominalValueDecimals,
     uint256 startingDate, uint256 maturityDate) bondDetails, address[] proceedRecipients, bytes[] proceedRecipientsData) _bondData,
     tuple(uint8 regulationType, uint8 regulationSubType, tuple(bool countriesControlListType, string listOfCountries, string info) additionalSecurityData) _factoryRegulationData)
     returns (address)`,
  "event ProxyDeployed(address indexed proxyAddress, address resolver, bytes32 configKey, uint256 version, tuple(bytes32 role, address[] members)[] rbac, bytes data)",
  "error WrongISIN(string isin)",
  "error WrongISINChecksum(string isin)",
  "error WrongTimestamp(uint256 timeStamp)",
  "error WrongDates(uint256 firstDate, uint256 secondDate)",
  "error RegulationTypeAndSubTypeForbidden(uint8 regulationType, uint8 regulationSubType)",
  "error VersionZero(bytes32 configurationId)",
];
const bondAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function getERC20Metadata() view returns (tuple(tuple(string name, string symbol, string isin, uint8 decimals) info, uint8 securityType))",
  "function getMaturityDate() view returns (uint256)",
  "function getNominalValue() view returns (uint256)",
  "function getNominalValueDecimals() view returns (uint8)",
  "function getNominalValueCurrency() view returns (bytes3)",
  "function addToControlList(address) returns (bool)",
  "function isInControlList(address) view returns (bool)",
  "function getControlListType() view returns (bool)",
  "function issue(address, uint256, bytes)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "error ListedAccount(address account)",
  "error UnlistedAccount(address account)",
  "error AccountIsBlocked(address account)",
];

const provider = new ethers.JsonRpcProvider("https://testnet.hashio.io/api");
const wallet = new ethers.Wallet(process.env.HEDERA_OPERATOR_KEY.replace(/^0x/, "0x"), provider);
const [factoryAddr, resolverAddr] = await Promise.all([evmOf(FACTORY_ID), evmOf(RESOLVER_ID)]);
console.log("operator", wallet.address, "| factory", factoryAddr, "| resolver", resolverAddr);

// Version 0 reverts with VersionZero(configId): ask the resolver for the bond configuration's latest version.
const resolver = new ethers.Contract(resolverAddr, ["function getLatestVersionByConfiguration(bytes32) view returns (uint256)"], provider);
const BOND_CONFIG_VERSION = await resolver.getLatestVersionByConfiguration(BOND_CONFIG_ID);
console.log("bond configuration latest version", BOND_CONFIG_VERSION.toString());

const now = Math.floor(Date.now() / 1000);
const terms = {
  name: "Spike Corp 1Y Bond",
  symbol: "SPK1Y",
  isin: "US0378331005", // a checksum-valid ISIN; the factory validates the check digit
  nominalValue: 100000n, // 1,000.00
  nominalValueDecimals: 2,
  startingDate: BigInt(now + 300),
  maturityDate: BigInt(now + 365 * 24 * 3600),
};
const bondData = {
  security: {
    resolver: resolverAddr,
    maxSupply: 1_000_000n,
    resolverProxyConfiguration: { key: BOND_CONFIG_ID, version: BOND_CONFIG_VERSION },
    erc20MetadataInfo: { name: terms.name, symbol: terms.symbol, isin: terms.isin, decimals: 0 },
    rbacs: [
      { role: DEFAULT_ADMIN_ROLE, members: [wallet.address] },
      { role: ROLE_ISSUER, members: [wallet.address] },
      { role: ROLE_CONTROL_LIST, members: [wallet.address] },
    ],
    externalPauses: [],
    externalControlLists: [],
    externalKycLists: [],
    compliance: ethers.ZeroAddress,
    identityRegistry: ethers.ZeroAddress,
    arePartitionsProtected: false,
    isMultiPartition: false,
    isControllable: true,
    isWhiteList: true, // the control list is an allowlist: only listed accounts may hold
    clearingActive: false,
    internalKycActivated: false,
    erc20VotesActivated: false,
  },
  bondDetails: {
    currency: ethers.hexlify(ethers.toUtf8Bytes("USD")),
    nominalValue: terms.nominalValue,
    nominalValueDecimals: terms.nominalValueDecimals,
    startingDate: terms.startingDate,
    maturityDate: terms.maturityDate,
  },
  proceedRecipients: [],
  proceedRecipientsData: [],
};
const regulation = { regulationType: 1, regulationSubType: 0, additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: "" } }; // REG_S

const factory = new ethers.Contract(factoryAddr, factoryAbi, wallet);
let predicted;
try {
  predicted = await factory.deployBond.staticCall(bondData, regulation, { gasLimit: 8_000_000 });
  console.log("dry run ok, predicted bond", predicted);
} catch (e) {
  console.error("dry run reverted:", e.revert ? `${e.revert.name}(${e.revert.args.join(", ")})` : e.shortMessage ?? e.message, "data:", e.data);
  process.exit(1);
}

const before = await provider.getBalance(wallet.address);
const tx = await factory.deployBond(bondData, regulation, { gasLimit: 8_000_000 });
const receipt = await tx.wait();
// BondDeployed only indexes the deployer, so take the address the dry run predicted and confirm
// the new bond emitted its initialisation logs in this very transaction.
assert.equal(receipt.status, 1, "deployBond failed");
const bondAddr = predicted;
assert(receipt.logs.some(l => l.address.toLowerCase() === bondAddr.toLowerCase()), "no logs from the predicted bond address");
const spent = Number(before - (await provider.getBalance(wallet.address))) / 1e18;
console.log(`deployed bond ${bondAddr} | tx ${tx.hash} | gas used ${receipt.gasUsed} | ~${spent.toFixed(2)} HBAR`);

const mirrorBond = await (await fetch(`${MIRROR}/contracts/${bondAddr}`)).json();
console.log("bond contract id", mirrorBond.contract_id);

const bond = new ethers.Contract(bondAddr, bondAbi, provider);
const md = await bond.getERC20Metadata();
const read = {
  name: await bond.name(),
  symbol: await bond.symbol(),
  isin: md.info.isin,
  currency: ethers.toUtf8String(await bond.getNominalValueCurrency()),
  nominal: (await bond.getNominalValue()).toString(),
  nominalDecimals: Number(await bond.getNominalValueDecimals()),
  maturity: new Date(Number(await bond.getMaturityDate()) * 1000).toISOString(),
};
console.log("read back", read);
assert.equal(read.name, terms.name);
assert.equal(read.isin, terms.isin);
assert.equal(read.currency, "USD");
assert.equal(read.nominal, terms.nominalValue.toString());
assert.equal(read.maturity, new Date(Number(terms.maturityDate) * 1000).toISOString());
// --- Allowlist and distribution: only listed investors can receive bonds
const issuer = new ethers.Contract(bondAddr, bondAbi, wallet);
const listed = ethers.Wallet.createRandom().address;
const unlisted = ethers.Wallet.createRandom().address;
assert.equal(await issuer.getControlListType(), true, "control list should be an allowlist");
await (await issuer.addToControlList(listed, { gasLimit: 400_000 })).wait();
assert.equal(await issuer.isInControlList(listed), true);
await (await issuer.issue(listed, 10n, "0x", { gasLimit: 1_500_000 })).wait();
console.log("issued 10 to listed investor; balance", (await issuer.balanceOf(listed)).toString(), "| supply", (await issuer.totalSupply()).toString());
assert.equal(await issuer.balanceOf(listed), 10n);

let refused = null;
try {
  await issuer.issue.staticCall(unlisted, 10n, "0x", { gasLimit: 1_500_000 });
} catch (e) {
  refused = e.revert ? `${e.revert.name}(${e.revert.args.join(", ")})` : `${e.shortMessage} data=${e.data}`;
}
console.log("issue to unlisted investor:", refused);
assert(refused, "issuing to an unlisted investor must be refused");

console.log("\nATS bond spike passed");
