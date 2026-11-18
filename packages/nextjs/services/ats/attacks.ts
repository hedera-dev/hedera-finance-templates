// Server-only: the tour's three attempts to put the bond where the allowlist says it cannot go. Each is sent even
// though the bond is expected to refuse it, so the refusal is a reverted transaction anyone can look up.
import { type WriteOutcome, attemptIssue, transferBetweenInvestors } from "./investors";
import { readBondView, readInvestorView } from "./read";
import { type InvestorRecord, addActivity, getDesk, investorKey } from "./state";
import type { AttackType } from "~~/types/ats";

export class AttackRefused extends Error {}

async function partition(bondAddress: InvestorRecord["address"]) {
  const views = await Promise.all(
    getDesk().investors.map(async investor => ({
      investor,
      ...(await readInvestorView(bondAddress, investor.address)),
    })),
  );
  return { approved: views.filter(v => v.approved), unapproved: views.filter(v => !v.approved) };
}

export async function runAttack(type: AttackType): Promise<{ outcome: WriteOutcome; success: string }> {
  const bond = getDesk().bond;
  if (!bond) throw new AttackRefused("No bond has been issued yet.");
  const { approved, unapproved } = await partition(bond.address);

  const record = (action: string, outcome: WriteOutcome) =>
    addActivity({ action, result: outcome.ok ? "SUCCESS" : outcome.errorName, txHash: outcome.txHash });

  if (type === "issue-unapproved") {
    const target = unapproved[0]?.investor;
    if (!target) throw new AttackRefused("Every investor is on the allowlist. Revoke one first.");
    const outcome = await attemptIssue(bond.address, target.address, 100n);
    record(`Tried to issue 100 to ${target.label}, who is not on the allowlist`, outcome);
    return { outcome, success: `The bond minted 100 to ${target.label}, who is not on the allowlist.` };
  }

  if (type === "over-cap") {
    const target = approved[0]?.investor;
    if (!target) throw new AttackRefused("Approve an investor first, so only the cap stands in the way.");
    const view = await readBondView(bond.address);
    const amount = BigInt(view.maxSupply - view.totalSupply + 1);
    const outcome = await attemptIssue(bond.address, target.address, amount);
    record(`Tried to issue ${amount} to ${target.label}, one more than the cap allows`, outcome);
    return { outcome, success: `The bond minted past its maximum supply of ${view.maxSupply}.` };
  }

  const seller = approved.find(v => (v.balance ?? 0) > 0 && investorKey(v.investor.address));
  if (!seller) throw new AttackRefused("Issue bonds to an approved demo investor first.");
  const buyer = unapproved[0]?.investor;
  if (!buyer) throw new AttackRefused("Every investor is on the allowlist. Revoke one first.");
  const outcome = await transferBetweenInvestors(
    bond.address,
    investorKey(seller.investor.address)!,
    buyer.address,
    1n,
  );
  record(`${seller.investor.label} tried to sell 1 to ${buyer.label}, who is not on the allowlist`, outcome);
  return { outcome, success: `${seller.investor.label} sold a bond to ${buyer.label}, who is not on the allowlist.` };
}
