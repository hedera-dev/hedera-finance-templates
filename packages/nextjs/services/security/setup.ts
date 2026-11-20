// Server-only: the four steps that build the desk. Each one is a route of its own, so the page
// can show them ticking off as they happen rather than waiting on one long request.
import { boardAbi, factoryAbi, resolverAbi, tokenAbi } from "./abi";
import { carryOrderNow, encodeGrantKyc } from "./actions";
import { officerBoardBytecode } from "./artifacts";
import { requireOperator, retryTransient } from "./clients";
import {
  ATS_FACTORY_CONTRACT_ID,
  ATS_RESOLVER_CONTRACT_ID,
  BOARD_ROLES,
  DEFAULT_ADMIN_ROLE,
  EQUITY_CONFIG_ID,
  GAS_CONTROL_LIST,
  GAS_DEPLOY_BOARD,
  GAS_DEPLOY_TOKEN,
  GAS_ISSUE,
  GAS_TRANSFER,
  HOLDER_A_AMOUNT,
  HOLDER_FUNDING_HBAR,
  ISSUE_AMOUNT,
  OFFICER_FUNDING_HBAR,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_SSI_MANAGER,
  TOKEN_ISIN,
  TOKEN_MAX_SUPPLY,
  TOKEN_NAME,
  TOKEN_NOMINAL_VALUE_CENTS,
  TOKEN_NOMINAL_VALUE_DECIMALS,
  TOKEN_SYMBOL,
  ZERO_ADDRESS,
} from "./constants";
import {
  addHistory,
  addHolder,
  requireBoard,
  requireHolder,
  requireToken,
  resetDesk,
  setBoard,
  setOfficers,
  setToken,
} from "./deskState";
import type { HolderRecord, OfficerRecord } from "./deskState";
import { decodeDeskError } from "./errors";
import {
  getAccountIdForEvmAddress,
  getAccountIdForEvmAddressOnce,
  getContractEvmAddress,
  getContractIdForEvmAddress,
} from "./mirror";
import { createFundedAccount, send } from "./tx";
import { decodeEventLog, getAddress, stringToHex } from "viem";
import type { Address, Hex } from "viem";
import { hederaTestnet } from "viem/chains";
import type { HolderId, OfficerId } from "~~/services/security/types";

export type OfficersResult = {
  officer3Kind: "wallet" | "demo";
  officers: { id: OfficerId; address: Address; accountId: string | null; isWallet: boolean }[];
  boardAddress: Address;
  boardContractId: string;
};

/**
 * Step 1: three officers and the board that holds the token's compliance roles.
 *
 * The connected wallet becomes Officer 3 when there is one, because the board's officers are
 * fixed at deployment and this is the only moment they can be chosen. Officers 1 and 2 are demo
 * keys the server holds; each is funded with a little HBAR so it can pay for its own proposals
 * and approvals.
 */
export async function setupOfficers(walletEvm?: string): Promise<OfficersResult> {
  const operator = requireOperator();
  resetDesk();

  const demoOfficers: OfficerRecord[] = [];
  for (const id of ["1", "2"] as const) {
    const created = await createFundedAccount(OFFICER_FUNDING_HBAR);
    demoOfficers.push({
      id,
      isWallet: false,
      address: created.address,
      accountId: await getAccountIdForEvmAddress(created.address),
      privateKey: created.privateKey,
    });
  }

  let officer3: OfficerRecord;
  if (walletEvm) {
    const address = getAddress(walletEvm);
    officer3 = {
      id: "3",
      isWallet: true,
      address,
      accountId: await getAccountIdForEvmAddressOnce(address),
      privateKey: null,
    };
  } else {
    const created = await createFundedAccount(OFFICER_FUNDING_HBAR);
    officer3 = {
      id: "3",
      isWallet: false,
      address: created.address,
      accountId: await getAccountIdForEvmAddress(created.address),
      privateKey: created.privateKey,
    };
  }

  const officers = [...demoOfficers, officer3];
  setOfficers(officers);

  const addresses = officers.map(o => o.address) as [Address, Address, Address];
  const deployHash = await operator.walletClient.deployContract({
    abi: boardAbi,
    bytecode: officerBoardBytecode(),
    args: [addresses],
    account: operator.account,
    chain: hederaTestnet,
    gas: GAS_DEPLOY_BOARD,
  });
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("The officer board did not deploy.");
  }

  const boardAddress = receipt.contractAddress;
  const boardContractId = (await getContractIdForEvmAddress(boardAddress)) ?? "pending";
  setBoard({ address: boardAddress, contractId: boardContractId });
  addHistory({
    action: `Deployed the 2-of-3 officer board ${boardContractId}`,
    reference: null,
    result: "SUCCESS",
    txHash: deployHash,
    kind: "other",
  });

  return {
    officer3Kind: officer3.isWallet ? "wallet" : "demo",
    officers: officers.map(o => ({ id: o.id, address: o.address, accountId: o.accountId, isWallet: o.isWallet })),
    boardAddress,
    boardContractId,
  };
}

export type TokenResult = { address: Address; contractId: string; symbol: string; version: string };

/**
 * Step 2: the security itself, deployed by the ATS factory already on testnet.
 *
 * The four compliance roles go to the board and to nobody else — that is the whole control. The
 * operator keeps only what a transfer agent needs day to day: admin, issuance and the control
 * list.
 */
export async function setupToken(): Promise<TokenResult> {
  const operator = requireOperator();
  const board = requireBoard().address;

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
      maxSupply: TOKEN_MAX_SUPPLY,
      resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version },
      erc20MetadataInfo: { name: TOKEN_NAME, symbol: TOKEN_SYMBOL, isin: TOKEN_ISIN, decimals: 0 },
      rbacs: [
        { role: DEFAULT_ADMIN_ROLE, members: [operator.account.address] },
        { role: ROLE_ISSUER, members: [operator.account.address] },
        { role: ROLE_CONTROL_LIST, members: [operator.account.address] },
        { role: ROLE_SSI_MANAGER, members: [operator.account.address] },
        // Every coercive power, held by the board alone.
        ...BOARD_ROLES.map(({ role }) => ({ role, members: [board] })),
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
      nominalValue: TOKEN_NOMINAL_VALUE_CENTS,
      nominalValueDecimals: TOKEN_NOMINAL_VALUE_DECIMALS,
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
        abi: factoryAbi,
        functionName: "deployEquity",
        args: [equityData, regulation],
        account: operator.account,
        gas: GAS_DEPLOY_TOKEN,
      }),
    );
    predicted = sim.result;
  } catch (error) {
    throw new Error(`The factory refused to deploy the token: ${decodeDeskError(error).message}`);
  }

  const txHash = await operator.walletClient.writeContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "deployEquity",
    args: [equityData, regulation],
    account: operator.account,
    chain: hederaTestnet,
    gas: GAS_DEPLOY_TOKEN,
  });
  const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("The token deployment failed on-chain.");

  // The factory's own event says where the token went. The simulated address is only a
  // prediction, computed against the state at simulation time: anyone else deploying through
  // this shared testnet factory in between would change it, and trusting it then would mean
  // abandoning a token that has just been paid for.
  const deployed = tokenAddressFromLogs(receipt.logs, factoryAddress) ?? predicted;
  const contractId = (await getContractIdForEvmAddress(deployed)) ?? "pending";

  setToken({ address: deployed, contractId, symbol: TOKEN_SYMBOL });
  addHistory({
    action: `Issued ${TOKEN_NAME} (${TOKEN_SYMBOL}) as ${contractId}`,
    reference: null,
    result: "SUCCESS",
    txHash,
    kind: "other",
  });
  return { address: deployed, contractId, symbol: TOKEN_SYMBOL, version: version.toString() };
}

function tokenAddressFromLogs(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  factory: Address,
): Address | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "EquityDeployed") continue;
      return (decoded.args as unknown as { equityAddress: Address }).equityAddress;
    } catch {
      // Not the event we are looking for; the factory emits others.
    }
  }
  return null;
}

export type HolderResult = { id: HolderId; label: string; address: Address; accountId: string | null };

/** Step 3: two demo holders. They only ever receive, so each gets just enough to exist. */
export async function setupHolders(): Promise<HolderResult[]> {
  const results: HolderResult[] = [];
  for (const [id, label] of [
    ["A", "Holder A"],
    ["B", "Holder B"],
  ] as const) {
    const created = await createFundedAccount(HOLDER_FUNDING_HBAR);
    const record: HolderRecord = {
      id,
      label,
      address: created.address,
      accountId: await getAccountIdForEvmAddress(created.address),
      privateKey: created.privateKey,
    };
    addHolder(record);
    addHistory({
      action: `Created ${label}`,
      reference: null,
      result: "SUCCESS",
      txHash: created.txHash,
      kind: "other",
    });
    results.push({ id, label, address: record.address, accountId: record.accountId });
  }
  return results;
}

/**
 * Step 4: who may hold the token, and the first distribution.
 *
 * Both holders go on the control list; only Holder A is granted KYC, so the tour's first attack
 * is about KYC and nothing else. The KYC grants go through the board, like every other
 * compliance action — two officers, even here.
 */
export async function setupDistribute(): Promise<{ holderA: string; issued: string }> {
  const operator = requireOperator();
  const token = requireToken();
  const holders = { A: requireHolder("A"), B: requireHolder("B") };
  const issuer = operator.account.address;

  // The factory puts the deployer on the list already, and `addToControlList` refuses an account
  // that is on it, so ask the token before adding. Both holders go on: holder B is kept off the
  // token by KYC alone, so the first refusal in "Break it" is unambiguously about KYC.
  for (const account of [issuer, holders.A.address, holders.B.address]) {
    const listed = await operator.publicClient.readContract({
      address: token.address,
      abi: tokenAbi,
      functionName: "isInControlList",
      args: [account],
    });
    if (!listed) await send(token.address, tokenAbi, "addToControlList", [account], GAS_CONTROL_LIST);
  }

  // `grantKyc` names the credential's issuer and refuses one the token does not know, so the
  // transfer agent's back office registers itself as an issuer first. That is bookkeeping about
  // who vouches for a credential, not a coercive power, so it does not go through the board.
  const registered = await operator.publicClient.readContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "isIssuer",
    args: [issuer],
  });
  if (!registered) await send(token.address, tokenAbi, "addIssuer", [issuer], GAS_CONTROL_LIST);

  // The board makes the call, because ROLE_KYC is the board's.
  for (const account of [issuer, holders.A.address]) {
    await carryOrderNow(token.address, encodeGrantKyc(account, issuer));
  }
  addHistory({
    action: `Granted KYC to the issuer and ${holders.A.label}, two officers each`,
    reference: null,
    result: "SUCCESS",
    txHash: "",
    kind: "other",
  });

  const issued = await send(token.address, tokenAbi, "issue", [issuer, ISSUE_AMOUNT, "0x"], GAS_ISSUE);
  addHistory({
    action: `Issued ${ISSUE_AMOUNT} ${token.symbol} to the issuer`,
    reference: null,
    result: "SUCCESS",
    txHash: issued.txHash,
    kind: "other",
  });

  const transferred = await send(
    token.address,
    tokenAbi,
    "transfer",
    [holders.A.address, HOLDER_A_AMOUNT],
    GAS_TRANSFER,
  );
  addHistory({
    action: `Transferred ${HOLDER_A_AMOUNT} ${token.symbol} to ${holders.A.label}`,
    reference: null,
    result: "SUCCESS",
    txHash: transferred.txHash,
    kind: "other",
  });

  return { holderA: HOLDER_A_AMOUNT.toString(), issued: ISSUE_AMOUNT.toString() };
}
