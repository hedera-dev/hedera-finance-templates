// Server-only: sets up a fresh desk, step by step, recording progress as it goes.
import { factoryAbi, gateAbi, resolverAbi, securityAbi } from "./abi";
import { reserveFeedArtifact, reserveGateArtifact } from "./artifacts";
import { getOperator } from "./clients";
import {
  ASSET_FACE_VALUE_USD,
  ASSET_MAX_SUPPLY,
  ATS_FACTORY_CONTRACT_ID,
  ATS_RESOLVER_CONTRACT_ID,
  BOND_CONFIG_ID,
  BTC_USD_FEED,
  COLLATERAL_MAX_SUPPLY,
  GAS_DEPLOY_ATS,
  MAX_PRICE_AGE_SECONDS,
  NOMINAL_VALUE_DECIMALS,
  RESERVE_COLLATERAL_UNITS,
  RESERVE_GAS_FUNDING_WEI,
  ROLES,
  ZERO_ADDRESS,
} from "./constants";
import { type Desk, type Entity, beginSetup, completeSetup, failSetup, logActivity, updateStep } from "./desk";
import { decodeFailure, shortText } from "./errors";
import { makeIsin } from "./math";
import { contractEvmAddress, entityId } from "./mirror";
import { read, sendTransaction, simulate, withTxLock } from "./rpc";
import { type Executed, deployContract, execute } from "./tx";
import { type Address, type Hex, getAddress, parseEventLogs, stringToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { StepId } from "~~/types/reserve";

class SetupFailure extends Error {}

const refuse = (what: string, result: Extract<Executed, { ok: false }>): never => {
  throw new SetupFailure(`${what} was refused: ${result.message}`);
};

type AtsSpec = { name: string; symbol: string; maxSupply: bigint; nominalValue: bigint; operatorIsIssuer: boolean };

function bondData(spec: AtsSpec, resolver: Address, version: bigint, operator: Address) {
  const now = Math.floor(Date.now() / 1000);
  const startingDate = BigInt(now + 300);
  return {
    security: {
      resolver,
      maxSupply: spec.maxSupply,
      resolverProxyConfiguration: { key: BOND_CONFIG_ID, version },
      erc20MetadataInfo: {
        name: spec.name,
        symbol: spec.symbol,
        isin: makeIsin(String(Math.floor(Math.random() * 1e9)).padStart(9, "0")),
        decimals: 0,
      },
      // Admin and control list stay with the operator. The issuer role is granted to nobody here: the collateral
      // gets the operator as issuer below, the asset gets only the gate. The agent role goes to nobody ever.
      rbacs: [
        { role: ROLES.admin as Hex, members: [operator] },
        ...(spec.operatorIsIssuer ? [{ role: ROLES.issuer as Hex, members: [operator] }] : []),
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
      nominalValue: spec.nominalValue,
      nominalValueDecimals: NOMINAL_VALUE_DECIMALS,
      startingDate,
      maturityDate: startingDate + 365n * 86_400n,
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

/** Deploys through the ATS factory. The address comes from the receipt's BondDeployed event, never from a simulation. */
async function deployThroughFactory(
  action: string,
  spec: AtsSpec,
  context: { factory: Address; resolver: Address; version: bigint; operator: ReturnType<typeof privateKeyToAccount> },
): Promise<Entity> {
  const args = [bondData(spec, context.resolver, context.version, context.operator.address), regulation] as const;

  // Run first: it is how a refusal is decoded before a transaction is sent.
  const dryRun = await simulate({
    account: context.operator.address,
    address: context.factory,
    abi: factoryAbi,
    functionName: "deployBond",
    args,
    gas: GAS_DEPLOY_ATS,
  });
  if (!dryRun.ok) {
    logActivity({ action, result: dryRun.name });
    throw new SetupFailure(`The factory refused ${action.toLowerCase()}: ${dryRun.message}`);
  }

  const result = await execute({
    account: context.operator,
    action,
    to: context.factory,
    abi: factoryAbi,
    functionName: "deployBond",
    args,
    gas: GAS_DEPLOY_ATS,
  });
  if (!result.ok) return refuse(action, result);

  const deployed = parseEventLogs({ abi: factoryAbi, eventName: "BondDeployed", logs: result.logs as never }).find(
    log => log.address.toLowerCase() === context.factory.toLowerCase(),
  );
  let address = deployed?.args.bondAddress as Address | undefined;
  if (!address) {
    // The event did not decode; fall back to the first contract other than the factory that logged in this receipt.
    address = result.logs
      .map(log => log.address)
      .find(candidate => candidate.toLowerCase() !== context.factory.toLowerCase());
  }
  if (!address) throw new SetupFailure(`${action} was mined but its receipt names no deployed token.`);

  const contractId = await entityId("contracts", address);
  if (!contractId) throw new SetupFailure(`The mirror node has not yet indexed the new token ${address}.`);
  return { address: getAddress(address), contractId };
}

async function step<T>(id: StepId, run: () => Promise<T>, detail: (value: T) => string): Promise<T> {
  updateStep(id, { status: "active", error: undefined });
  const value = await run();
  updateStep(id, { status: "done", detail: detail(value) });
  return value;
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
    const reserveKey = generatePrivateKey();
    const reserveAccount = privateKeyToAccount(reserveKey);
    const investor = privateKeyToAccount(generatePrivateKey()).address; // the key is discarded: the investor never signs

    const { factory, resolver, version } = await step(
      "version",
      async () => {
        const [factoryAddress, resolverAddress] = await Promise.all([
          contractEvmAddress(ATS_FACTORY_CONTRACT_ID),
          contractEvmAddress(ATS_RESOLVER_CONTRACT_ID),
        ]);
        const latest = await read<bigint>(resolverAddress, resolverAbi, "getLatestVersionByConfiguration", [
          BOND_CONFIG_ID,
        ]);
        if (latest === 0n) throw new SetupFailure("VersionZero: the bond configuration has no published version.");
        return { factory: factoryAddress, resolver: resolverAddress, version: latest };
      },
      value => `Bond configuration version ${value.version}`,
    );
    const context = { factory, resolver, version, operator: operator.account };

    const collateral = await step(
      "collateral",
      () =>
        deployThroughFactory(
          "Deploy collateral token (ATS)",
          {
            name: "Custodied BTC",
            symbol: "cBTC",
            maxSupply: COLLATERAL_MAX_SUPPLY,
            nominalValue: 100n,
            operatorIsIssuer: true,
          },
          context,
        ),
      value => `${value.contractId} · ${value.address}`,
    );

    const asset = await step(
      "asset",
      () =>
        deployThroughFactory(
          "Deploy asset token (ATS)",
          {
            name: "Reserve-backed Note",
            symbol: "RBN",
            maxSupply: ASSET_MAX_SUPPLY,
            nominalValue: BigInt(ASSET_FACE_VALUE_USD * 10 ** NOMINAL_VALUE_DECIMALS),
            operatorIsIssuer: false,
          },
          context,
        ),
      value => `${value.contractId} · ${value.address}`,
    );

    const { reserveFeed, gate } = await step(
      "gate",
      async () => {
        const feedArtifact = reserveFeedArtifact();
        const feed = await deployContract({
          account: operator.account,
          action: "Deploy reserve feed",
          abi: feedArtifact.abi,
          bytecode: feedArtifact.bytecode,
          args: [collateral.address, reserveAccount.address, 0],
        });
        if (!feed.ok || !feed.contractAddress) return refuse("The reserve feed deployment", feed as never);

        const gateArtifact = reserveGateArtifact();
        const gateDeploy = await deployContract({
          account: operator.account,
          action: "Deploy gate",
          abi: gateArtifact.abi,
          bytecode: gateArtifact.bytecode,
          args: [
            asset.address,
            feed.contractAddress,
            BTC_USD_FEED,
            BigInt(MAX_PRICE_AGE_SECONDS),
            operator.account.address,
          ],
        });
        if (!gateDeploy.ok || !gateDeploy.contractAddress) return refuse("The gate deployment", gateDeploy as never);

        const listed = await execute({
          account: operator.account,
          action: "List the operator as allowed to issue through the gate",
          to: gateDeploy.contractAddress,
          abi: gateAbi,
          functionName: "setIssuer",
          args: [operator.account.address, true],
        });
        if (!listed.ok) return refuse("Listing the operator on the gate", listed);

        const [feedId, gateId] = await Promise.all([
          entityId("contracts", feed.contractAddress),
          entityId("contracts", gateDeploy.contractAddress),
        ]);
        if (!feedId || !gateId) throw new SetupFailure("The mirror node has not yet indexed the feed and the gate.");
        return {
          reserveFeed: { address: getAddress(feed.contractAddress), contractId: feedId },
          gate: { address: getAddress(gateDeploy.contractAddress), contractId: gateId },
        };
      },
      value => `Gate ${value.gate.contractId} · feed ${value.reserveFeed.contractId}`,
    );

    await step(
      "roles",
      async () => {
        const grants = [
          {
            action: "Grant the gate the issuer role on the asset",
            to: asset.address,
            functionName: "grantRole",
            args: [ROLES.issuer, gate.address],
          },
          {
            action: "Allowlist the reserve address on the collateral",
            to: collateral.address,
            functionName: "addToControlList",
            args: [reserveAccount.address],
          },
          {
            action: "Allowlist the operator on the collateral",
            to: collateral.address,
            functionName: "addToControlList",
            args: [operator.account.address],
          },
          {
            action: "Allowlist the demo investor on the asset",
            to: asset.address,
            functionName: "addToControlList",
            args: [investor],
          },
        ] as const;
        for (const grant of grants) {
          const result = await execute({
            account: operator.account,
            abi: securityAbi,
            ...grant,
            args: [...grant.args],
          });
          if (!result.ok) refuse(grant.action, result);
        }
      },
      () => "Issuer role to the gate; reserve and investor allowlisted",
    );

    const reserveAccountId = await step(
      "reserve",
      async () => {
        const funding = await withTxLock(async () => {
          const outcome = await sendTransaction({
            account: operator.account,
            to: reserveAccount.address,
            data: "0x",
            value: RESERVE_GAS_FUNDING_WEI,
          });
          logActivity({
            action: "Fund the reserve address with HBAR for gas",
            result: outcome.status === "success" ? "SUCCESS" : "Reverted",
            txHash: outcome.hash,
          });
          return outcome;
        });
        if (funding.status !== "success") throw new SetupFailure("Funding the reserve address with HBAR reverted.");

        const minted = await execute({
          account: operator.account,
          action: `Issue ${RESERVE_COLLATERAL_UNITS} collateral units into the reserve`,
          to: collateral.address,
          abi: securityAbi,
          functionName: "issue",
          args: [reserveAccount.address, RESERVE_COLLATERAL_UNITS, "0x"],
        });
        if (!minted.ok) refuse("Issuing collateral into the reserve", minted);

        // The book opens with one unit through the gate, so coverage is a real ratio from the first screen.
        const opening = await execute({
          account: operator.account,
          action: "Issue 1 unit through the gate (opening the book)",
          to: gate.address,
          abi: gateAbi,
          functionName: "issue",
          args: [investor, 1n],
        });
        if (!opening.ok) refuse("The opening issuance through the gate", opening);

        return (await entityId("accounts", reserveAccount.address)) ?? reserveAccount.address;
      },
      id => `${RESERVE_COLLATERAL_UNITS} units into ${id}`,
    );

    const desk: Desk = {
      operator: operator.account.address,
      collateral,
      asset,
      gate,
      reserveFeed,
      reserve: { address: reserveAccount.address, accountId: reserveAccountId, key: reserveKey },
      holders: [{ label: "Demo investor", address: investor, kind: "investor" }],
      maxPriceAge: MAX_PRICE_AGE_SECONDS,
    };
    completeSetup(desk);
  } catch (error) {
    const message = error instanceof SetupFailure ? error.message : decodeFailure(error).message || shortText(error);
    console.error("[reserve/setup]", message);
    failSetup(message);
  }
}
