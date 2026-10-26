// Server-only: live reads from the bond contract. Every balance, the total supply, and the
// approval state are always read fresh from the chain rather than cached, per the spec.
import { bondAbi } from "./abi";
import { getPublicClient } from "./clients";
import { hexToString } from "viem";
import type { Address } from "viem";

export type BondChainView = {
  name: string;
  symbol: string;
  isin: string;
  currency: string;
  faceValue: number;
  maturityDateIso: string;
  maxSupply: number;
  totalSupply: number;
};

export async function readBondView(bondAddress: Address): Promise<BondChainView> {
  const client = getPublicClient();
  const base = { address: bondAddress, abi: bondAbi } as const;

  const [name, symbol, metadata, nominalValue, nominalDecimals, currencyBytes, maturityDate, maxSupply, totalSupply] =
    await Promise.all([
      client.readContract({ ...base, functionName: "name" }),
      client.readContract({ ...base, functionName: "symbol" }),
      client.readContract({ ...base, functionName: "getERC20Metadata" }),
      client.readContract({ ...base, functionName: "getNominalValue" }),
      client.readContract({ ...base, functionName: "getNominalValueDecimals" }),
      client.readContract({ ...base, functionName: "getNominalValueCurrency" }),
      client.readContract({ ...base, functionName: "getMaturityDate" }),
      client.readContract({ ...base, functionName: "getMaxSupply" }),
      client.readContract({ ...base, functionName: "totalSupply" }),
    ]);

  return {
    name,
    symbol,
    isin: metadata.info.isin,
    currency: hexToString(currencyBytes).replace(/\0+$/, ""),
    faceValue: Number(nominalValue) / 10 ** nominalDecimals,
    maturityDateIso: new Date(Number(maturityDate) * 1000).toISOString(),
    maxSupply: Number(maxSupply),
    totalSupply: Number(totalSupply),
  };
}

export type InvestorChainView = { approved: boolean; balance: number };

export async function readInvestorView(bondAddress: Address, investor: Address): Promise<InvestorChainView> {
  const client = getPublicClient();
  const base = { address: bondAddress, abi: bondAbi } as const;

  const [approved, balance] = await Promise.all([
    client.readContract({ ...base, functionName: "isInControlList", args: [investor] }),
    client.readContract({ ...base, functionName: "balanceOf", args: [investor] }),
  ]);

  return { approved, balance: Number(balance) };
}
