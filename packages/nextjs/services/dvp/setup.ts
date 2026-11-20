// Server-only: the six steps that build the market. Each one is a route of its own, so the page
// can show them ticking off as they happen rather than waiting on one long request.
import {
  atsFactoryAbi,
  cashAbi,
  resolverAbi,
  securityAbi,
  settlementAbi,
  stablecoinAbi,
  studioFactoryAbi,
} from "./abi";
import { dvpSettlementBytecode } from "./artifacts";
import { getPublicClient, requireOperator, retryTransient } from "./clients";
import {
  ATS_FACTORY_CONTRACT_ID,
  ATS_RESOLVER_CONTRACT_ID,
  BUYER_INITIAL_CASH,
  CASH_DECIMALS,
  CASH_NAME,
  CASH_SYMBOL,
  CASH_UNITS_PER_DOLLAR,
  DEFAULT_ADMIN_ROLE,
  EQUITY_CONFIG_ID,
  GAS_ASSOCIATE,
  GAS_CONTROL_LIST,
  GAS_DEPLOY_SECURITY,
  GAS_DEPLOY_SETTLEMENT,
  GAS_DEPLOY_STABLECOIN,
  GAS_GRANT_KYC,
  GAS_GRANT_ROLE,
  GAS_ISSUE,
  GAS_MINT,
  HOLD_CREATOR_ROLE,
  KYC_VALID_YEARS,
  KYC_VC_ID,
  PARTY_FUNDING_HBAR,
  RESERVE_CONFIG_ID,
  RESERVE_INITIAL_DOLLARS,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_KYC,
  ROLE_SSI_MANAGER,
  SECURITY_ISIN,
  SECURITY_MAX_SUPPLY,
  SECURITY_NAME,
  SECURITY_NOMINAL_VALUE_CENTS,
  SECURITY_NOMINAL_VALUE_DECIMALS,
  SECURITY_SYMBOL,
  SELLER_INITIAL_SECURITY,
  SETTLEMENT_GRACE_SECONDS,
  SETUP_MIN_BALANCE_HBAR,
  STABLECOIN_ADMIN_ROLE,
  STABLECOIN_CONFIG_ID,
  STABLECOIN_CREATE_VALUE_WEI,
  STABLECOIN_FACTORY_CONTRACT_ID,
  STABLECOIN_RESOLVER_CONTRACT_ID,
  UNVERIFIED_BUYER_INITIAL_CASH,
  ZERO_ADDRESS,
} from "./constants";
import {
  addHistory,
  requireCash,
  requireParty,
  requireSecurity,
  resetDesk,
  setCash,
  setParties,
  setSecurity,
  setSettlement,
} from "./deskState";
import type { PartyRecord } from "./deskState";
import { decodeDeskError } from "./errors";
import {
  getAccountIdForEvmAddress,
  getAccountIdForEvmAddressOnce,
  getContractEvmAddress,
  getContractIdForEvmAddress,
  getTokenIdForEvmAddress,
} from "./mirror";
import { createFundedAccount, send } from "./tx";
import { decodeEventLog, formatEther, getAddress, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import { hederaTestnet } from "viem/chains";
import type { PartyId } from "~~/services/dvp/types";

const PARTY_LABELS: Record<PartyId, string> = {
  seller: "Seller",
  buyer: "Buyer",
  unverified: "Unverified Buyer",
};

/** Refused up front, so a short operator balance does not strand a half-built market. */
async function requireFunds() {
  const operator = requireOperator();
  const balance = Number(formatEther(await getPublicClient().getBalance({ address: operator.account.address })));
  if (balance < SETUP_MIN_BALANCE_HBAR) {
    throw new Error(
      `The operator holds ${balance.toFixed(2)} HBAR; setup needs about ${SETUP_MIN_BALANCE_HBAR}, most of it the two tokens. Top it up from the Hedera Portal faucet and run it again.`,
    );
  }
}

export type PartiesResult = {
  buyerKind: "wallet" | "demo";
  parties: { id: PartyId; label: string; address: Address; accountId: string | null; isWallet: boolean }[];
};

/**
 * Step 1: the three parties the market trades between.
 *
 * The connected wallet becomes the Buyer when there is one, because that is the side with one
 * transaction to sign — the cash pledge — and this is the only moment the choice can be made.
 * The others are demo keys the server holds, each funded with enough HBAR to pay for its own
 * pledges.
 */
export async function setupParties(walletEvm?: string): Promise<PartiesResult> {
  await requireFunds();
  resetDesk();

  const parties: PartyRecord[] = [];
  for (const id of ["seller", "buyer", "unverified"] as const) {
    if (id === "buyer" && walletEvm) {
      const address = getAddress(walletEvm);
      parties.push({
        id,
        label: PARTY_LABELS[id],
        address,
        accountId: await getAccountIdForEvmAddressOnce(address),
        privateKey: null,
        isWallet: true,
      });
      continue;
    }
    const created = await createFundedAccount(PARTY_FUNDING_HBAR);
    parties.push({
      id,
      label: PARTY_LABELS[id],
      address: created.address,
      accountId: await getAccountIdForEvmAddress(created.address),
      privateKey: created.privateKey,
      isWallet: false,
    });
  }
  setParties(parties);

  addHistory({
    action: `Created and funded the demo parties (${parties.filter(p => !p.isWallet).length} of 3)`,
    reference: null,
    result: "SUCCESS",
    txHash: null,
    kind: "other",
  });

  return {
    buyerKind: walletEvm ? "wallet" : "demo",
    parties: parties.map(({ id, label, address, accountId, isWallet }) => ({
      id,
      label,
      address,
      accountId,
      isWallet,
    })),
  };
}

export type SecurityResult = { address: Address; contractId: string; symbol: string; version: string };

/**
 * Step 2: the security, deployed by the ATS factory already on testnet.
 *
 * The issuer keeps what a transfer agent needs — admin, issuance, the control list, KYC and the
 * list of credential issuers. The settlement contract is given nothing: it never needs a role,
 * because a hold already names it as the escrow.
 */
export async function setupSecurity(): Promise<SecurityResult> {
  const operator = requireOperator();

  const [resolverAddress, factoryAddress] = await Promise.all([
    getContractEvmAddress(ATS_RESOLVER_CONTRACT_ID),
    getContractEvmAddress(ATS_FACTORY_CONTRACT_ID),
  ]);

  const version = await retryTransient(() =>
    operator.publicClient.readContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "getLatestVersionByConfiguration",
      args: [EQUITY_CONFIG_ID],
    }),
  );
  if (version === 0n) throw new Error("VersionZero: the equity configuration has no published version yet.");

  const equityData = {
    security: {
      resolver: resolverAddress,
      maxSupply: SECURITY_MAX_SUPPLY,
      resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version },
      erc20MetadataInfo: { name: SECURITY_NAME, symbol: SECURITY_SYMBOL, isin: SECURITY_ISIN, decimals: 0 },
      rbacs: [
        { role: DEFAULT_ADMIN_ROLE, members: [operator.account.address] },
        { role: ROLE_ISSUER, members: [operator.account.address] },
        { role: ROLE_CONTROL_LIST, members: [operator.account.address] },
        { role: ROLE_KYC, members: [operator.account.address] },
        { role: ROLE_SSI_MANAGER, members: [operator.account.address] },
      ],
      externalPauses: [] as Address[],
      externalControlLists: [] as Address[],
      externalKycLists: [] as Address[],
      compliance: ZERO_ADDRESS,
      identityRegistry: ZERO_ADDRESS,
      arePartitionsProtected: false,
      isMultiPartition: false,
      isControllable: true,
      isWhiteList: true,
      clearingActive: false,
      internalKycActivated: true,
      erc20VotesActivated: false,
    },
    equityDetails: {
      votingRight: true,
      informationRight: true,
      liquidationRight: true,
      subscriptionRight: false,
      conversionRight: false,
      redemptionRight: false,
      putRight: false,
      dividendRight: 1,
      currency: stringToHex("USD", { size: 3 }),
      nominalValue: SECURITY_NOMINAL_VALUE_CENTS,
      nominalValueDecimals: SECURITY_NOMINAL_VALUE_DECIMALS,
    },
  };
  const regulation = {
    regulationType: 1,
    regulationSubType: 0,
    additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: "" },
  };

  let predicted: Address;
  try {
    const sim = await retryTransient(() =>
      operator.publicClient.simulateContract({
        address: factoryAddress,
        abi: atsFactoryAbi,
        functionName: "deployEquity",
        args: [equityData, regulation],
        account: operator.account,
        gas: GAS_DEPLOY_SECURITY,
      }),
    );
    predicted = sim.result;
  } catch (error) {
    throw new Error(`The ATS factory refused to deploy the security: ${decodeDeskError(error).message}`);
  }

  const txHash = await operator.walletClient.writeContract({
    address: factoryAddress,
    abi: atsFactoryAbi,
    functionName: "deployEquity",
    args: [equityData, regulation],
    account: operator.account,
    chain: hederaTestnet,
    gas: GAS_DEPLOY_SECURITY,
  });
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("The security deployment failed on-chain.");

  // The factory's own event says where the token went. The simulated address is only a
  // prediction, computed against the state at simulation time: anyone else deploying through
  // this shared testnet factory in between would change it, and trusting it then would mean
  // abandoning a token that has just been paid for.
  const deployed = securityAddressFromLogs(receipt.logs, factoryAddress) ?? predicted;
  const contractId = (await getContractIdForEvmAddress(deployed)) ?? "pending";

  setSecurity({ address: deployed, contractId, symbol: SECURITY_SYMBOL });
  addHistory({
    action: `Deployed ${SECURITY_NAME} (${SECURITY_SYMBOL}) as ${contractId}`,
    reference: null,
    result: "SUCCESS",
    txHash,
    kind: "other",
  });
  return { address: deployed, contractId, symbol: SECURITY_SYMBOL, version: version.toString() };
}

function securityAddressFromLogs(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  factory: Address,
): Address | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: atsFactoryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "EquityDeployed") continue;
      return (decoded.args as unknown as { equityAddress: Address }).equityAddress;
    } catch {
      // Not the event we are looking for; the factory emits others.
    }
  }
  return null;
}

export type CashResult = { proxyAddress: Address; proxyContractId: string; tokenAddress: Address; tokenId: string };

/**
 * Step 3: the cash, deployed by the Stablecoin Studio factory already on testnet.
 *
 * Two addresses come out of this: a proxy, where roles, minting and holds live, and the HTS token
 * behind it, where balances live and which each party has to associate.
 */
export async function setupCash(): Promise<CashResult> {
  const operator = requireOperator();

  const [factoryAddress, resolverAddress] = await Promise.all([
    getContractEvmAddress(STABLECOIN_FACTORY_CONTRACT_ID),
    getContractEvmAddress(STABLECOIN_RESOLVER_CONTRACT_ID),
  ]);

  const [version, reserveVersion] = await Promise.all(
    [STABLECOIN_CONFIG_ID, RESERVE_CONFIG_ID].map(key =>
      retryTransient(() =>
        operator.publicClient.readContract({
          address: resolverAddress,
          abi: resolverAbi,
          functionName: "getLatestVersionByConfiguration",
          args: [key],
        }),
      ),
    ),
  );
  if (version === 0n || reserveVersion === 0n) {
    throw new Error("VersionZero: the Stablecoin Studio configurations have no published version yet.");
  }

  const requestedToken = {
    tokenName: CASH_NAME,
    tokenSymbol: CASH_SYMBOL,
    freeze: false,
    supplyType: false, // infinite
    tokenMaxSupply: 0n,
    tokenInitialSupply: 0n,
    tokenDecimals: CASH_DECIMALS,
    reserveAddress: ZERO_ADDRESS,
    reserveInitialAmount: RESERVE_INITIAL_DOLLARS * CASH_UNITS_PER_DOLLAR,
    // Proof of reserve on the cash leg is what stops the stablecoin being over-minted. Nothing in
    // this template depends on it; it is here because a cash leg without one is not cash.
    createReserve: true,
    // Admin, wipe, supply and pause keys, all held by the proxy (an empty public key means the proxy).
    keys: [1n, 8n, 16n, 64n].map(keyType => ({ keyType, publicKey: "0x" as Hex, isEd25519: false })),
    roles: [{ role: STABLECOIN_ADMIN_ROLE, account: operator.account.address }],
    cashinRole: { account: operator.account.address, allowance: 0n },
    metadata: "",
    businessLogicResolverAddress: resolverAddress,
    stableCoinConfigurationId: { key: STABLECOIN_CONFIG_ID, version },
    reserveConfigurationId: { key: RESERVE_CONFIG_ID, version: reserveVersion },
  };

  try {
    await retryTransient(() =>
      operator.publicClient.simulateContract({
        address: factoryAddress,
        abi: studioFactoryAbi,
        functionName: "deployStableCoin",
        args: [requestedToken],
        account: operator.account,
        gas: GAS_DEPLOY_STABLECOIN,
        value: STABLECOIN_CREATE_VALUE_WEI,
      }),
    );
  } catch (error) {
    throw new Error(`The Stablecoin Studio factory refused the stablecoin: ${decodeDeskError(error).message}`);
  }

  const txHash = await operator.walletClient.writeContract({
    address: factoryAddress,
    abi: studioFactoryAbi,
    functionName: "deployStableCoin",
    args: [requestedToken],
    account: operator.account,
    chain: hederaTestnet,
    gas: GAS_DEPLOY_STABLECOIN,
    value: STABLECOIN_CREATE_VALUE_WEI,
  });
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("The stablecoin deployment failed on-chain.");

  const deployed = stablecoinFromLogs(receipt.logs, factoryAddress);
  if (!deployed) {
    throw new Error("The stablecoin deployment was mined but its receipt names no proxy or token.");
  }

  const [proxyContractId, tokenId] = await Promise.all([
    getContractIdForEvmAddress(deployed.stableCoinProxy),
    getTokenIdForEvmAddress(deployed.tokenAddress),
  ]);

  const record = {
    proxyAddress: deployed.stableCoinProxy,
    proxyContractId: proxyContractId ?? "pending",
    tokenAddress: deployed.tokenAddress,
    tokenId: tokenId ?? "pending",
    symbol: CASH_SYMBOL,
  };
  setCash(record);
  addHistory({
    action: `Deployed ${CASH_NAME} (${CASH_SYMBOL}) as ${record.tokenId}`,
    reference: null,
    result: "SUCCESS",
    txHash,
    kind: "other",
  });
  return {
    proxyAddress: record.proxyAddress,
    proxyContractId: record.proxyContractId,
    tokenAddress: record.tokenAddress,
    tokenId: record.tokenId,
  };
}

function stablecoinFromLogs(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  factory: Address,
): { stableCoinProxy: Address; tokenAddress: Address } | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: studioFactoryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "Deployed") continue;
      const { deployedStableCoin } = decoded.args as unknown as {
        deployedStableCoin: { stableCoinProxy: Address; tokenAddress: Address };
      };
      if (deployedStableCoin?.stableCoinProxy) return deployedStableCoin;
    } catch {
      // Not the event we are looking for; the factory emits others.
    }
  }
  return null;
}

export type SettlementResult = { address: Address; contractId: string; graceSeconds: string };

/** Step 4: this repo's own contract, pointed at the two tokens it will settle between. */
export async function setupSettlement(): Promise<SettlementResult> {
  const operator = requireOperator();
  const security = requireSecurity();
  const cash = requireCash();

  const txHash = await operator.walletClient.deployContract({
    abi: settlementAbi,
    bytecode: dvpSettlementBytecode(),
    // The cash leg is escrowed on the proxy, not on the HTS token: that is where holds live.
    args: [security.address, cash.proxyAddress, SETTLEMENT_GRACE_SECONDS],
    account: operator.account,
    chain: hederaTestnet,
    gas: GAS_DEPLOY_SETTLEMENT,
  });
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("The settlement contract did not deploy.");
  }

  const address = receipt.contractAddress;
  const contractId = (await getContractIdForEvmAddress(address)) ?? "pending";
  setSettlement({ address, contractId });
  addHistory({
    action: `Deployed the settlement contract as ${contractId}`,
    reference: null,
    result: "SUCCESS",
    txHash,
    kind: "other",
  });
  return { address, contractId, graceSeconds: SETTLEMENT_GRACE_SECONDS.toString() };
}

export type PermissionsResult = { listed: PartyId[]; kyc: PartyId[]; holdCreators: PartyId[] };

/**
 * Step 5: who is allowed to do what, on both tokens.
 *
 * On the security: every party that a settled leg can land on has to be on the control list, and
 * every party that may receive the security has to be granted KYC — which the Unverified Buyer
 * deliberately is not. The settlement contract needs neither: it is only an escrow, and never a
 * destination.
 *
 * On the cash: each party associates the HTS token so it can hold units, and each buyer is
 * granted the hold-creator role so it can pledge its own cash.
 */
export async function setupPermissions(): Promise<PermissionsResult> {
  const operator = requireOperator();
  const security = requireSecurity();
  const cash = requireCash();
  const issuer = operator.account.address;

  const listed: PartyId[] = [];
  const kyc: PartyId[] = [];
  const holdCreators: PartyId[] = [];

  // The factory already lists the deployer, so adding it again would be refused as `ListedAccount`.
  for (const account of [issuer, ...(["seller", "buyer", "unverified"] as const).map(id => requireParty(id).address)]) {
    const already = await retryTransient(() =>
      operator.publicClient.readContract({
        address: security.address,
        abi: securityAbi,
        functionName: "isInControlList",
        args: [account],
      }),
    );
    if (already) continue;
    await send(security.address, securityAbi, "addToControlList", [account], GAS_CONTROL_LIST);
  }
  listed.push("seller", "buyer", "unverified");

  // `grantKyc` has an `onlyValidIssuer` check: holding the KYC role is not enough, the issuer has
  // to be on the token's own list of credential issuers.
  const registered = await retryTransient(() =>
    operator.publicClient.readContract({
      address: security.address,
      abi: securityAbi,
      functionName: "isIssuer",
      args: [issuer],
    }),
  );
  if (!registered) await send(security.address, securityAbi, "addIssuer", [issuer], GAS_CONTROL_LIST);

  const validFrom = BigInt(Math.floor(Date.now() / 1000));
  const validTo = validFrom + BigInt(KYC_VALID_YEARS * 365 * 24 * 60 * 60);
  // The issuer itself needs KYC to issue into its own book; the Unverified Buyer never gets it.
  for (const account of [issuer, requireParty("seller").address, requireParty("buyer").address]) {
    await send(
      security.address,
      securityAbi,
      "grantKyc",
      [account, KYC_VC_ID, validFrom, validTo, issuer],
      GAS_GRANT_KYC,
    );
  }
  kyc.push("seller", "buyer");

  // Minting cash needs the supplier role, however the deployment asked for it.
  await send(cash.proxyAddress, stablecoinAbi, "grantUnlimitedSupplierRole", [issuer], GAS_GRANT_ROLE);

  // HRC-719: only the account itself can associate, so each demo party signs its own. A wallet
  // buyer may already be associated, or may have automatic association; it is checked, not assumed.
  for (const id of ["seller", "buyer", "unverified"] as const) {
    const party = requireParty(id);
    const associated = await retryTransient(() =>
      operator.publicClient
        .readContract({ address: cash.tokenAddress, abi: cashAbi, functionName: "isAssociated", args: [] })
        .catch(() => false),
    );
    if (associated) continue;
    if (!party.privateKey) continue; // the wallet buyer associates for itself, if it has to
    await send(cash.tokenAddress, cashAbi, "associate", [], GAS_ASSOCIATE, {
      signer: { privateKey: party.privateKey },
    });
  }

  // Only a buyer pledges cash, so only a buyer needs to be able to create a hold on it.
  for (const id of ["buyer", "unverified"] as const) {
    await send(
      cash.proxyAddress,
      stablecoinAbi,
      "grantRole",
      [HOLD_CREATOR_ROLE, requireParty(id).address],
      GAS_GRANT_ROLE,
    );
    holdCreators.push(id);
  }

  addHistory({
    action: "Admitted the parties, granted KYC to all but the Unverified Buyer, and let both buyers pledge cash",
    reference: null,
    result: "SUCCESS",
    txHash: null,
    kind: "other",
  });
  return { listed, kyc, holdCreators };
}

export type FundResult = { security: string; buyerCash: string; unverifiedCash: string };

/** Step 6: the starting position — security to the Seller, cash to both Buyers. */
export async function setupFund(): Promise<FundResult> {
  const security = requireSecurity();
  const cash = requireCash();

  await send(
    security.address,
    securityAbi,
    "issue",
    [requireParty("seller").address, SELLER_INITIAL_SECURITY, "0x"],
    GAS_ISSUE,
  );

  for (const [id, dollars] of [
    ["buyer", BUYER_INITIAL_CASH],
    ["unverified", UNVERIFIED_BUYER_INITIAL_CASH],
  ] as const) {
    await send(
      cash.proxyAddress,
      stablecoinAbi,
      "mint",
      [requireParty(id).address, dollars * CASH_UNITS_PER_DOLLAR],
      GAS_MINT,
    );
  }

  addHistory({
    action: `Issued ${SELLER_INITIAL_SECURITY} ${SECURITY_SYMBOL} to the Seller and minted cash to both Buyers`,
    reference: null,
    result: "SUCCESS",
    txHash: null,
    kind: "other",
  });
  return {
    security: SELLER_INITIAL_SECURITY.toString(),
    buyerCash: BUYER_INITIAL_CASH.toString(),
    unverifiedCash: UNVERIFIED_BUYER_INITIAL_CASH.toString(),
  };
}
