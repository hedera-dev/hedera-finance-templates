// Server-only: builds the desk's full status payload (bond, investors, activity) with every
// balance, supply and approval flag read fresh from the chain. Shared by the status route and
// every mutating route, so each action's response reflects the result immediately.
import { getOperatorConfig } from "./clients";
import { readBondView, readInvestorView } from "./read";
import { getDesk } from "./state";
import type { Address } from "viem";
import type { BondTerms, DeskStatus, InvestorView } from "~~/types/ats";

export async function buildDeskStatus(): Promise<DeskStatus> {
  const operator = getOperatorConfig();
  const desk = getDesk();

  let bond: BondTerms | null = null;
  if (desk.bond) {
    try {
      const view = await readBondView(desk.bond.address);
      bond = {
        address: desk.bond.address,
        contractId: desk.bond.contractId,
        name: view.name,
        symbol: view.symbol,
        isin: view.isin,
        currency: view.currency,
        faceValue: view.faceValue,
        startingDateIso: desk.bond.startingDateIso,
        maturityDateIso: view.maturityDateIso,
        maxSupply: view.maxSupply,
        totalSupply: view.totalSupply,
        chainRead: true,
      };
    } catch (error) {
      // The bond exists and its terms were read from it at issue; a read failing now is a
      // network problem, not a bond that stopped existing. Show what was read then, say the
      // live values are missing, and leave the one number that moves as unknown.
      console.error("[ats/status] failed to read bond", error);
      bond = {
        address: desk.bond.address,
        contractId: desk.bond.contractId,
        name: desk.bond.name,
        symbol: desk.bond.symbol,
        isin: desk.bond.isin,
        currency: desk.bond.currency,
        faceValue: desk.bond.faceValue,
        startingDateIso: desk.bond.startingDateIso,
        maturityDateIso: desk.bond.maturityDateIso,
        maxSupply: desk.bond.maxSupply,
        totalSupply: null,
        chainRead: false,
      };
    }
  }

  const bondAddress: Address | undefined = desk.bond?.address;
  const investors: InvestorView[] = await Promise.all(
    desk.investors.map(async investor => {
      if (!bondAddress) return { ...investor, approved: null, balance: null };
      try {
        const view = await readInvestorView(bondAddress, investor.address);
        return { ...investor, approved: view.approved, balance: view.balance };
      } catch (error) {
        // Never fall back to `false` and `0`: on a compliance desk that reads as an
        // investor who is not approved and holds nothing, which is a claim about the
        // chain this server has just failed to make.
        console.error("[ats/status] failed to read investor", error);
        return { ...investor, approved: null, balance: null };
      }
    }),
  );

  return {
    configured: operator.configured,
    configError: operator.configured ? undefined : operator.error,
    bond,
    investors,
    activity: desk.activity,
  };
}
