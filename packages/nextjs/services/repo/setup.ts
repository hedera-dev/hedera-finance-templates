// Server-only: sets up a fresh desk, step by step, recording progress as it goes.
import { atsFactoryAbi, billAbi, cashAbi, feedAbi, resolverAbi, stablecoinAbi, studioFactoryAbi } from "./abi";
import { billPriceFeedArtifact, billRepoArtifact } from "./artifacts";
import { getOperator } from "./clients";
import {
  ATS_FACTORY_CONTRACT_ID,
  ATS_RESOLVER_CONTRACT_ID,
  BILLS_ISSUED,
  BILL_FACE_USD,
  BILL_MAX_SUPPLY,
  BILL_NAME,
  BILL_REAL_DAYS,
  BILL_SYMBOL,
  BOND_CONFIG_ID,
  BORROWER_CASH_USD,
  BORROWER_GAS_FUNDING_WEI,
  CASH_DECIMALS,
  CASH_UNITS_PER_USD,
  DEMO_BILL_DAYS,
  DISCOUNT_RATE_BPS,
  GAS_ASSOCIATE,
  GAS_CONTROL_LIST,
  GAS_DEPLOY_ATS,
  GAS_HTS_TRANSFER,
  GAS_ISSUE,
  GRACE_SECONDS,
  HAIRCUT_BPS,
  LENDER_CASH_USD,
  LIQUIDATION_THRESHOLD_BPS,
  NOMINAL_VALUE_DECIMALS,
  RESERVE_CONFIG_ID,
  RESERVE_INITIAL_USD,
  ROLES,
  SECONDS_PER_DAY,
  STABLECOIN_CONFIG_ID,
  STABLECOIN_CREATE_VALUE_WEI,
  STABLECOIN_FACTORY_CONTRACT_ID,
  STABLECOIN_RESOLVER_CONTRACT_ID,
  STALENESS_SECONDS,
  ZERO_ADDRESS,
} from "./constants";
import { type Desk, type Entity, beginSetup, completeSetup, failSetup, logActivity, updateStep } from "./desk";
import { decodeFailure, shortText } from "./errors";
import { USD8, makeIsin, toInt64 } from "./math";
import { contractCallResult, contractEvmAddress, entityId } from "./mirror";
import { read, sendTransaction, simulate, withTxLock } from "./rpc";
import { type Executed, deployContract, execute } from "./tx";
import { type Address, type Hex, decodeFunctionResult, getAddress, parseEventLogs, stringToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { StepId } from "~~/types/repo";

class SetupFailure extends Error {}

const refuse = (what: string, result: Extract<Executed, { ok: false }>): never => {
  throw new SetupFailure(`${what} was refused: ${result.message}`);
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function bondData(resolver: Address, version: bigint, operator: Address) {
  const startingDate = BigInt(nowSeconds() + 300);
  return {
    security: {
      resolver,
      maxSupply: BILL_MAX_SUPPLY,
      resolverProxyConfiguration: { key: BOND_CONFIG_ID, version },
      erc20MetadataInfo: {
        name: BILL_NAME,
        symbol: BILL_SYMBOL,
        isin: makeIsin(String(Math.floor(Math.random() * 1e9)).padStart(9, "0")),
        decimals: 0,
      },
      // The operator administers the bill, issues it and keeps its control list. The repo contract is given
      // no role at all and is never put on the control list: it is only ever an escrow.
      rbacs: [
        { role: ROLES.admin as Hex, members: [operator] },
        { role: ROLES.issuer as Hex, members: [operator] },
        { role: ROLES.controlList as Hex, members: [operator] },
      ],
      externalPauses: [] as Address[],
      externalControlLists: [] as Address[],
      externalKycLists: [] as Address[],
      compliance: ZERO_ADDRESS,
      identityRegistry: ZERO_ADDRESS,
      arePartitionsProtected: false,
      isMultiPartition: false,
      isControllable: false,
      isWhiteList: true,
      clearingActive: false,
      internalKycActivated: false,
      erc20VotesActivated: false,
    },
    bondDetails: {
      currency: stringToHex("USD", { size: 3 }),
      // Stored with 2 decimals: a $1,000 face is 100000.
      nominalValue: BigInt(BILL_FACE_USD * 10 ** NOMINAL_VALUE_DECIMALS),
      nominalValueDecimals: NOMINAL_VALUE_DECIMALS,
      startingDate,
      // The instrument's own maturity is 91 REAL days out. The demo clock lives in the price feed, not here.
      maturityDate: startingDate + BigInt(BILL_REAL_DAYS) * 86_400n,
    },
    proceedRecipients: [] as Address[],
    proceedRecipientsData: [] as Hex[],
  };
}

const regulation = {
  regulationType: 1,
  regulationSubType: 0,
  additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: "" },
} as const;

/** `0.0.N` of an HTS token from its long-zero EVM address. */
const tokenId = (address: string) => `0.0.${BigInt(`0x${address.slice(-16)}`).toString()}`;

async function step<T>(id: StepId, run: () => Promise<T>, detail: (value: T) => string): Promise<T> {
  updateStep(id, { status: "active", error: undefined });
  const value = await run();
  updateStep(id, { status: "done", detail: detail(value) });
  return value;
}

async function entity(address: Address): Promise<Entity> {
  const contractId = await entityId("contracts", address);
  if (!contractId) throw new SetupFailure(`The mirror node has not yet indexed ${address}.`);
  return { address: getAddress(address), contractId };
}

/** Deploys through the ATS factory. The address comes from the receipt's BondDeployed event, never from a simulation. */
async function deployBill(context: {
  factory: Address;
  resolver: Address;
  version: bigint;
  operator: ReturnType<typeof privateKeyToAccount>;
}): Promise<Entity> {
  const action = "Deploy the bill (ATS)";
  const args = [bondData(context.resolver, context.version, context.operator.address), regulation] as const;

  // Run first: it is how a refusal is decoded before a transaction is sent.
  const dryRun = await simulate({
    account: context.operator.address,
    address: context.factory,
    abi: atsFactoryAbi,
    functionName: "deployBond",
    args,
    gas: GAS_DEPLOY_ATS,
  });
  if (!dryRun.ok) {
    logActivity({ action, result: dryRun.name });
    throw new SetupFailure(`The ATS factory refused the bill: ${dryRun.message}`);
  }

  const result = await execute({
    account: context.operator,
    action,
    to: context.factory,
    abi: atsFactoryAbi,
    functionName: "deployBond",
    args,
    gas: GAS_DEPLOY_ATS,
  });
  if (!result.ok) return refuse(action, result);

  const deployed = parseEventLogs({ abi: atsFactoryAbi, eventName: "BondDeployed", logs: result.logs as never }).find(
    log => log.address.toLowerCase() === context.factory.toLowerCase(),
  );
  const address = deployed?.args.bondAddress as Address | undefined;
  if (!address) throw new SetupFailure("The bill deployment was mined but its receipt carries no BondDeployed event.");
  return entity(address);
}

export function stablecoinRequest(context: {
  resolver: Address;
  version: bigint;
  reserveVersion: bigint;
  operator: { address: Address };
}) {
  return {
    tokenName: "Demo Dollar",
    tokenSymbol: "dUSD",
    freeze: false,
    supplyType: false, // infinite
    tokenMaxSupply: 0n,
    tokenInitialSupply: 0n,
    tokenDecimals: CASH_DECIMALS,
    reserveAddress: ZERO_ADDRESS,
    // The reserve starts above anything the demo will mint.
    reserveInitialAmount: toInt64(RESERVE_INITIAL_USD * CASH_UNITS_PER_USD),
    // A demo reserve the admin can move by hand. Nothing in this template depends on it; it is shown because
    // proof of reserve on the cash leg is what stops the stablecoin being over-minted.
    createReserve: true,
    // Admin, wipe, supply and pause keys, all held by the stablecoin proxy (an empty public key means the proxy).
    keys: [1n, 8n, 16n, 64n].map(keyType => ({ keyType, publicKey: "0x" as Hex, isEd25519: false })),
    roles: [{ role: ROLES.admin as Hex, account: context.operator.address }],
    cashinRole: { account: context.operator.address, allowance: 0n },
    metadata: "",
    businessLogicResolverAddress: context.resolver,
    stableCoinConfigurationId: { key: STABLECOIN_CONFIG_ID, version: context.version },
    reserveConfigurationId: { key: RESERVE_CONFIG_ID, version: context.reserveVersion },
  };
}

type Deployed = { stableCoinProxy: Address; tokenAddress: Address; reserveProxy: Address };

/**
 * Deploys through the Stablecoin Studio factory. The addresses come from the receipt (the `Deployed` event, or
 * failing that the call's own return value on the mirror node), never from a simulation: the factory is shared, so a
 * simulated address is valid only against the state at that moment.
 */
async function deployStablecoin(context: {
  factory: Address;
  resolver: Address;
  version: bigint;
  reserveVersion: bigint;
  operator: ReturnType<typeof privateKeyToAccount>;
}): Promise<Deployed> {
  const action = "Deploy the stablecoin (Stablecoin Studio)";
  const requestedToken = stablecoinRequest(context);
  const args = [requestedToken] as const;

  const gas = 13_000_000n;
  const dryRun = await simulate({
    account: context.operator.address,
    address: context.factory,
    abi: studioFactoryAbi,
    functionName: "deployStableCoin",
    args,
    gas,
    value: STABLECOIN_CREATE_VALUE_WEI,
  });
  if (!dryRun.ok) {
    logActivity({ action, result: dryRun.name });
    throw new SetupFailure(`The Stablecoin Studio factory refused the stablecoin: ${dryRun.message}`);
  }

  const result = await execute({
    account: context.operator,
    action,
    to: context.factory,
    abi: studioFactoryAbi,
    functionName: "deployStableCoin",
    args,
    gas,
    value: STABLECOIN_CREATE_VALUE_WEI,
  });
  if (!result.ok) return refuse(action, result);

  const event = parseEventLogs({ abi: studioFactoryAbi, eventName: "Deployed", logs: result.logs as never }).find(
    log => log.address.toLowerCase() === context.factory.toLowerCase(),
  );
  const fromEvent = event?.args.deployedStableCoin as Deployed | undefined;
  if (fromEvent?.stableCoinProxy) return fromEvent;

  const callResult = await contractCallResult(result.hash);
  if (callResult) {
    const decoded = decodeFunctionResult({
      abi: studioFactoryAbi,
      functionName: "deployStableCoin",
      data: callResult,
    }) as Deployed;
    if (decoded.stableCoinProxy) return decoded;
  }
  throw new SetupFailure("The stablecoin deployment was mined but its receipt names no proxy, token or reserve.");
}

export async function runSetup(): Promise<void> {
  const found = getOperator();
  if (!found.ok) {
    beginSetup();
    failSetup(found.error);
    return;
  }
  const { operator } = found;
  beginSetup();

  try {
    const borrowerKey = generatePrivateKey();
    const borrower = privateKeyToAccount(borrowerKey);

    const versions = await step(
      "version",
      async () => {
        const [atsFactory, atsResolver, studioFactory, studioResolver] = await Promise.all([
          contractEvmAddress(ATS_FACTORY_CONTRACT_ID),
          contractEvmAddress(ATS_RESOLVER_CONTRACT_ID),
          contractEvmAddress(STABLECOIN_FACTORY_CONTRACT_ID),
          contractEvmAddress(STABLECOIN_RESOLVER_CONTRACT_ID),
        ]);
        // Version 0 reverts with VersionZero, so each configuration's latest version is resolved first.
        const [bond, stablecoin, reserve] = await Promise.all([
          read<bigint>(atsResolver, resolverAbi, "getLatestVersionByConfiguration", [BOND_CONFIG_ID]),
          read<bigint>(studioResolver, resolverAbi, "getLatestVersionByConfiguration", [STABLECOIN_CONFIG_ID]),
          read<bigint>(studioResolver, resolverAbi, "getLatestVersionByConfiguration", [RESERVE_CONFIG_ID]),
        ]);
        if (bond === 0n) throw new SetupFailure("VersionZero: the bond configuration has no published version.");
        if (stablecoin === 0n) {
          throw new SetupFailure("VersionZero: the stablecoin configuration has no published version.");
        }
        return { atsFactory, atsResolver, studioFactory, studioResolver, bond, stablecoin, reserve };
      },
      value => `Bond configuration v${value.bond} · stablecoin configuration v${value.stablecoin}`,
    );

    const bill = await step(
      "bill",
      () =>
        deployBill({
          factory: versions.atsFactory,
          resolver: versions.atsResolver,
          version: versions.bond,
          operator: operator.account,
        }),
      value => `${value.contractId} · ${value.address}`,
    );

    const stablecoin = await step(
      "stablecoin",
      async () => {
        const deployed = await deployStablecoin({
          factory: versions.studioFactory,
          resolver: versions.studioResolver,
          version: versions.stablecoin,
          reserveVersion: versions.reserve === 0n ? versions.stablecoin : versions.reserve,
          operator: operator.account,
        });
        const [proxy, reserve] = await Promise.all([
          entity(deployed.stableCoinProxy),
          deployed.reserveProxy === ZERO_ADDRESS ? Promise.resolve(null) : entity(deployed.reserveProxy),
        ]);
        const token: Entity = {
          address: getAddress(deployed.tokenAddress),
          contractId: tokenId(deployed.tokenAddress),
        };
        return { proxy, token, reserve };
      },
      value => `Proxy ${value.proxy.contractId} · token ${value.token.contractId}`,
    );

    const feed = await step(
      "feed",
      async () => {
        const artifact = billPriceFeedArtifact();
        const deployed = await deployContract({
          account: operator.account,
          action: "Deploy the bill price feed",
          abi: artifact.abi,
          bytecode: artifact.bytecode,
          args: [
            BigInt(BILL_FACE_USD) * USD8,
            BigInt(nowSeconds() + DEMO_BILL_DAYS),
            SECONDS_PER_DAY,
            BigInt(DISCOUNT_RATE_BPS),
            operator.account.address,
          ],
        });
        if (!deployed.ok || !deployed.contractAddress) return refuse("The price feed deployment", deployed as never);
        return entity(deployed.contractAddress);
      },
      value => `${value.contractId} · ${value.address}`,
    );

    const repo = await step(
      "repo",
      async () => {
        const artifact = billRepoArtifact();
        const deployed = await deployContract({
          account: operator.account,
          action: "Deploy the repo contract",
          abi: artifact.abi,
          bytecode: artifact.bytecode,
          args: [
            bill.address,
            stablecoin.proxy.address,
            stablecoin.token.address,
            feed.address,
            BigInt(HAIRCUT_BPS),
            BigInt(LIQUIDATION_THRESHOLD_BPS),
            BigInt(STALENESS_SECONDS),
            BigInt(GRACE_SECONDS),
            SECONDS_PER_DAY,
          ],
        });
        if (!deployed.ok || !deployed.contractAddress) return refuse("The repo contract deployment", deployed as never);
        return entity(deployed.contractAddress);
      },
      value => `${value.contractId} · ${value.address}`,
    );

    const lender = operator.account.address;

    await step(
      "permissions",
      async () => {
        // The demo borrower pays gas for its own transactions.
        const funding = await withTxLock(async () => {
          const outcome = await sendTransaction({
            account: operator.account,
            to: borrower.address,
            data: "0x",
            value: BORROWER_GAS_FUNDING_WEI,
          });
          logActivity({
            action: "Fund the demo borrower with HBAR for gas",
            result: outcome.status === "success" ? "SUCCESS" : "Reverted",
            txHash: outcome.hash,
          });
          return outcome;
        });
        if (funding.status !== "success") throw new SetupFailure("Funding the demo borrower with HBAR reverted.");

        // The bill's control list is an allowlist. The destination of every hold needs an entry, because execute
        // delivers units to it. The repo contract needs none: it is only an escrow.
        for (const [who, account] of [
          ["borrower", borrower.address],
          ["lender", lender],
        ] as const) {
          const listed = await execute({
            account: operator.account,
            action: `Allowlist the ${who} on the bill`,
            to: bill.address,
            abi: billAbi,
            functionName: "addToControlList",
            args: [account],
            gas: GAS_CONTROL_LIST,
          });
          if (!listed.ok) refuse(`Allowlisting the ${who}`, listed);
        }

        // Cash-in role to the lender. The deployment already asked for it; this makes it certain, and is allowed to
        // be a no-op if the role is already unlimited.
        await execute({
          account: operator.account,
          action: "Grant the lender the stablecoin's cash-in role",
          to: stablecoin.proxy.address,
          abi: stablecoinAbi,
          functionName: "grantUnlimitedSupplierRole",
          args: [lender],
        });

        // HRC-719 association. The borrower must be associated to receive the stablecoin; the lender may already be.
        const borrowerAssociated = await execute({
          account: borrower,
          action: "Associate the stablecoin to the borrower",
          to: stablecoin.token.address,
          abi: cashAbi,
          functionName: "associate",
          args: [],
          gas: GAS_ASSOCIATE,
        });
        if (!borrowerAssociated.ok) refuse("Associating the stablecoin to the borrower", borrowerAssociated);
        await execute({
          account: operator.account,
          action: "Associate the stablecoin to the lender",
          to: stablecoin.token.address,
          abi: cashAbi,
          functionName: "associate",
          args: [],
          gas: GAS_ASSOCIATE,
        });
      },
      () => "Borrower and lender allowlisted; cash-in role to the lender; stablecoin associated to the borrower",
    );

    await step(
      "positions",
      async () => {
        const issued = await execute({
          account: operator.account,
          action: `Issue ${BILLS_ISSUED} bills to the borrower`,
          to: bill.address,
          abi: billAbi,
          functionName: "issue",
          args: [borrower.address, BILLS_ISSUED, "0x"],
          gas: GAS_ISSUE,
        });
        if (!issued.ok) refuse("Issuing the bills", issued);

        const lenderUnits = LENDER_CASH_USD * CASH_UNITS_PER_USD;
        const minted = await execute({
          account: operator.account,
          action: `Mint $${LENDER_CASH_USD} of stablecoin to the lender`,
          to: stablecoin.proxy.address,
          abi: stablecoinAbi,
          functionName: "mint",
          args: [lender, toInt64(lenderUnits)],
        });
        if (!minted.ok) refuse("Minting the lender's stablecoin", minted);

        // Interest has to come from somewhere: the borrower only borrows the principal.
        const buffer = await execute({
          account: operator.account,
          action: `Send the borrower $${BORROWER_CASH_USD} of stablecoin to cover interest`,
          to: stablecoin.token.address,
          abi: cashAbi,
          functionName: "transfer",
          args: [borrower.address, BORROWER_CASH_USD * CASH_UNITS_PER_USD],
          gas: GAS_HTS_TRANSFER,
        });
        if (!buffer.ok) refuse("Funding the borrower's interest buffer", buffer);

        // The bill's 91 demo days start now, not when the feed happened to be deployed several transactions ago.
        const anchored = await execute({
          account: operator.account,
          action: "Start the bill's 91-day clock",
          to: feed.address,
          abi: feedAbi,
          functionName: "setMaturityTimestamp",
          args: [BigInt(nowSeconds() + DEMO_BILL_DAYS)],
        });
        if (!anchored.ok) refuse("Starting the bill's clock", anchored);
      },
      () => `${BILLS_ISSUED} bills to the borrower; $${LENDER_CASH_USD} minted to the lender`,
    );

    const desk: Desk = {
      operator: lender,
      bill,
      stablecoin: stablecoin.proxy,
      token: stablecoin.token,
      reserve: stablecoin.reserve,
      feed,
      repo,
      borrower: { address: borrower.address, accountId: borrower.address, key: borrowerKey },
      wallets: [],
      activeBorrower: borrower.address,
      holdId: null,
      loanId: null,
    };
    const accountId = await entityId("accounts", borrower.address, 10_000);
    if (accountId) desk.borrower.accountId = accountId;
    completeSetup(desk);
  } catch (error) {
    const message = error instanceof SetupFailure ? error.message : decodeFailure(error).message || shortText(error);
    console.error("[desk/setup]", message);
    failSetup(message);
  }
}
