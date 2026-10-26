// Server-only: orchestrates issuing a new bond through the ATS factory, emitting one event per
// step so the caller (the streaming API route) can report real progress as it happens.
import { factoryAbi, resolverAbi } from "./abi";
import { requireOperator, retryTransient } from "./clients";
import {
  ATS_FACTORY_CONTRACT_ID,
  ATS_RESOLVER_CONTRACT_ID,
  BOND_CONFIG_ID,
  DEFAULT_ADMIN_ROLE,
  GAS_LIMIT_DEPLOY_BOND,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ZERO_ADDRESS,
} from "./constants";
import { decodeAtsError } from "./errors";
import { createDemoInvestor } from "./investors";
import { getContractEvmAddress, getContractIdForEvmAddress } from "./mirror";
import { readBondView } from "./read";
import { addActivity, addInvestor, resetDesk } from "./state";
import { decodeEventLog, stringToHex } from "viem";
import type { Address } from "viem";
import * as chains from "viem/chains";
import type { InvestorView, IssueBondInput, IssueEvent, IssueStepId } from "~~/types/ats";
import { bondDates } from "~~/utils/ats/dates";

export async function runIssueBond(input: IssueBondInput, emit: (event: IssueEvent) => void): Promise<void> {
  const operator = requireOperator();
  // Tracked so a throw anywhere below can mark the step that was running as failed. A step
  // left `active` spins forever while the page says the run failed.
  let active: IssueStepId = "version";

  try {
    // --- Step 1: resolve the bond configuration's latest version -------------------------------
    active = "version";
    emit({ step: "version", status: "active" });
    const [resolverAddress, factoryAddress] = await Promise.all([
      getContractEvmAddress(ATS_RESOLVER_CONTRACT_ID),
      getContractEvmAddress(ATS_FACTORY_CONTRACT_ID),
    ]);
    const version = await operator.publicClient.readContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "getLatestVersionByConfiguration",
      args: [BOND_CONFIG_ID],
    });
    if (version === 0n) {
      const message = "VersionZero: the bond configuration has no published version yet.";
      emit({ step: "version", status: "failed", error: message });
      emit({ step: "result", status: "failed", error: message });
      return;
    }
    emit({ step: "version", status: "done", version: version.toString() });

    // --- Step 2: deploy through the ATS factory -------------------------------------------------
    active = "deploy";
    emit({ step: "deploy", status: "active" });

    const { startingDate, maturityDate } = bondDates(Math.floor(Date.now() / 1000), input.maturityMonths);

    const bondData = {
      security: {
        resolver: resolverAddress,
        maxSupply: BigInt(input.maxSupply),
        resolverProxyConfiguration: { key: BOND_CONFIG_ID, version },
        erc20MetadataInfo: { name: input.name, symbol: input.symbol, isin: input.isin, decimals: 0 },
        rbacs: [
          { role: DEFAULT_ADMIN_ROLE, members: [operator.account.address] },
          { role: ROLE_ISSUER, members: [operator.account.address] },
          { role: ROLE_CONTROL_LIST, members: [operator.account.address] },
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
        internalKycActivated: false,
        erc20VotesActivated: false,
      },
      bondDetails: {
        currency: stringToHex("USD", { size: 3 }),
        nominalValue: BigInt(Math.round(input.faceValue * 100)),
        nominalValueDecimals: 2,
        startingDate,
        maturityDate,
      },
      proceedRecipients: [] as Address[],
      proceedRecipientsData: [] as `0x${string}`[],
    };
    const regulation = {
      regulationType: 1,
      regulationSubType: 0,
      additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: "" },
    };

    let predictedAddress: Address;
    try {
      const sim = await retryTransient(() =>
        operator.publicClient.simulateContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "deployBond",
          args: [bondData, regulation],
          account: operator.account,
          gas: GAS_LIMIT_DEPLOY_BOND,
        }),
      );
      predictedAddress = sim.result;
    } catch (error) {
      const decoded = decodeAtsError(error);
      emit({ step: "deploy", status: "failed", error: decoded.message });
      addActivity({ action: `Issue bond ${input.name} (${input.symbol})`, result: decoded.name });
      emit({ step: "result", status: "failed", error: decoded.message });
      return;
    }

    const txHash = await operator.walletClient.writeContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "deployBond",
      args: [bondData, regulation],
      account: operator.account,
      chain: chains.hederaTestnet,
      gas: GAS_LIMIT_DEPLOY_BOND,
    });
    const receipt = await operator.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      const message = "The deployment transaction failed on-chain.";
      emit({ step: "deploy", status: "failed", error: message });
      addActivity({ action: `Issue bond ${input.name} (${input.symbol})`, result: "Error", txHash });
      emit({ step: "result", status: "failed", error: message });
      return;
    }

    // The factory's own event says where the bond went, and what dates it was given. The
    // simulated address is only a prediction: it is computed against the state at simulation
    // time, so anyone else deploying through this shared testnet factory in between would
    // change it — and trusting it then meant abandoning a bond that had just been paid for.
    const deployed = bondFromReceiptLogs(receipt.logs, factoryAddress);
    const bondAddress = deployed?.address ?? predictedAddress;
    if (!deployed) {
      const emittedFromPredicted = receipt.logs.some(
        log => log.address.toLowerCase() === predictedAddress.toLowerCase(),
      );
      if (!emittedFromPredicted) {
        const message = "The deployment emitted no BondDeployed event and no logs from the predicted address.";
        emit({ step: "deploy", status: "failed", error: message });
        addActivity({ action: `Issue bond ${input.name} (${input.symbol})`, result: "Error", txHash });
        emit({ step: "result", status: "failed", error: message });
        return;
      }
    }
    const startingDateOnChain = deployed?.startingDate ?? startingDate;

    const contractId = (await getContractIdForEvmAddress(bondAddress)) ?? "pending";
    emit({ step: "deploy", status: "done", address: bondAddress, contractId, txHash });

    resetDesk({
      address: bondAddress,
      contractId,
      name: input.name,
      symbol: input.symbol,
      isin: input.isin,
      currency: "USD",
      faceValue: input.faceValue,
      startingDateIso: new Date(Number(startingDateOnChain) * 1000).toISOString(),
      maturityDateIso: new Date(Number(maturityDate) * 1000).toISOString(),
      maxSupply: input.maxSupply,
    });
    addActivity({ action: `Issued bond ${input.name} (${input.symbol})`, result: "SUCCESS", txHash });

    // --- Step 3: create the demo investors --------------------------------------------------
    active = "investors";
    emit({ step: "investors", status: "active" });
    const investorViews: InvestorView[] = [];
    for (const label of ["Investor A", "Investor B"] as const) {
      const { record, txHash: fundingTxHash } = await createDemoInvestor(label);
      addInvestor(record);
      addActivity({ action: `Created ${label}`, result: "SUCCESS", txHash: fundingTxHash });
      investorViews.push({
        label,
        address: record.address,
        hederaAccountId: record.hederaAccountId,
        approved: false,
        balance: 0,
      });
    }
    emit({ step: "investors", status: "done", investors: investorViews });

    // --- Step 4: read the bond back from the chain ------------------------------------------
    active = "verify";
    emit({ step: "verify", status: "active" });
    const view = await readBondView(bondAddress);
    emit({
      step: "verify",
      status: "done",
      bond: {
        address: bondAddress,
        contractId,
        name: view.name,
        symbol: view.symbol,
        isin: view.isin,
        currency: view.currency,
        faceValue: view.faceValue,
        startingDateIso: new Date(Number(startingDateOnChain) * 1000).toISOString(),
        maturityDateIso: view.maturityDateIso,
        maxSupply: view.maxSupply,
        totalSupply: view.totalSupply,
        chainRead: true,
      },
    });

    emit({ step: "result", status: "done" });
  } catch (error) {
    const decoded = decodeAtsError(error);
    emit({ step: active, status: "failed", error: decoded.message });
    emit({ step: "result", status: "failed", error: decoded.message });
  }
}

/** The bond address and starting date the factory recorded, from its `BondDeployed` event. */
function bondFromReceiptLogs(
  logs: readonly { address: string; data: `0x${string}`; topics: readonly `0x${string}`[] }[],
  factoryAddress: Address,
): { address: Address; startingDate: bigint } | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "BondDeployed") continue;
      const args = decoded.args as unknown as {
        bondAddress: Address;
        bondData: { bondDetails: { startingDate: bigint } };
      };
      return { address: args.bondAddress, startingDate: args.bondData.bondDetails.startingDate };
    } catch {
      // Not the event we are looking for; the factory emits others.
    }
  }
  return null;
}
