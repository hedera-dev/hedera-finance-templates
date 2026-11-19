import { NextResponse } from "next/server";
import { AccountCreateTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { getHederaClient, getOperatorConfigError } from "~~/services/coupons/operator";
import { DemoInvestor, getDeskState, setInvestors } from "~~/services/coupons/state";

/**
 * Creates the two demo investors: Hedera accounts with ECDSA keys, an EVM address derived from
 * the public key, and unlimited automatic token associations so they can receive the stablecoin
 * without signing anything. Each key stays in server memory, where only the tour's attacks use it:
 * no response ever includes it. Idempotent.
 */
export async function POST() {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const existing = getDeskState().investors;
  if (existing.length === 2) return NextResponse.json({ investors: existing });

  try {
    const client = getHederaClient();
    const investors: DemoInvestor[] = [];

    const specs: { id: "A" | "B"; label: "Investor A" | "Investor B"; defaultUnits: number }[] = [
      { id: "A", label: "Investor A", defaultUnits: 10 },
      { id: "B", label: "Investor B", defaultUnits: 5 },
    ];

    for (const spec of specs) {
      const key = PrivateKey.generateECDSA();
      const response = await new AccountCreateTransaction()
        .setECDSAKeyWithAlias(key)
        .setInitialBalance(new Hbar(1))
        .setMaxAutomaticTokenAssociations(-1)
        .execute(client);
      const receipt = await response.getReceipt(client);
      const accountId = receipt.accountId;
      if (!accountId) throw new Error(`Account creation for ${spec.label} did not return an account id`);

      getDeskState().investorKeys[spec.id] = key.toStringRaw();
      const evmAddress = key.publicKey.toEvmAddress();
      investors.push({
        id: spec.id,
        label: spec.label,
        defaultUnits: spec.defaultUnits,
        accountId: accountId.toString(),
        evmAddress: (evmAddress.startsWith("0x") ? evmAddress : `0x${evmAddress}`) as `0x${string}`,
      });
    }

    setInvestors(investors);
    return NextResponse.json({ investors });
  } catch (e) {
    console.error("[api/hedera/coupons/setup/investors]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create demo investors" },
      { status: 500 },
    );
  }
}
