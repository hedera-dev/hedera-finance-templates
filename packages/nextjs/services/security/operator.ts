import { AccountId, PrivateKey } from "@hiero-ledger/sdk";
import { getMirrorAccount } from "~~/services/security/mirrorNode";

/**
 * Parses HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY once per server process. The operator is the
 * issuer: it pays every fee in this desk and is the token's treasury.
 */
export type OperatorConfig = {
  accountId: AccountId;
  privateKey: PrivateKey;
};

export type OperatorConfigResult = { ok: true; config: OperatorConfig } | { ok: false; missing: string[] };

/**
 * A DER-encoded key carries its own curve, so it parses unambiguously. A raw hex key does not —
 * 32 bytes is a valid private key on both ED25519 and secp256k1 — so for that case this asks the
 * mirror node which curve the account actually uses and parses accordingly. Guessing wrong here
 * doesn't throw; it silently produces a key that fails every signature check against the network.
 */
async function resolveOperatorKey(accountId: string, keyRaw: string): Promise<PrivateKey> {
  if (PrivateKey.isDerKey(keyRaw)) return PrivateKey.fromStringDer(keyRaw);

  const account = await getMirrorAccount(accountId).catch(() => null);
  if (account?.key?._type === "ECDSA_SECP256K1") return PrivateKey.fromStringECDSA(keyRaw);
  return PrivateKey.fromStringED25519(keyRaw);
}

let cached: Promise<OperatorConfigResult> | null = null;

export function getOperatorConfig(): Promise<OperatorConfigResult> {
  if (cached) return cached;

  cached = (async (): Promise<OperatorConfigResult> => {
    const accountIdRaw = process.env.HEDERA_OPERATOR_ID;
    const keyRaw = process.env.HEDERA_OPERATOR_KEY;
    const missing: string[] = [];
    if (!accountIdRaw) missing.push("HEDERA_OPERATOR_ID");
    if (!keyRaw) missing.push("HEDERA_OPERATOR_KEY");
    if (missing.length > 0) return { ok: false, missing };

    try {
      const privateKey = await resolveOperatorKey(accountIdRaw as string, keyRaw as string);
      return { ok: true, config: { accountId: AccountId.fromString(accountIdRaw as string), privateKey } };
    } catch {
      return { ok: false, missing: ["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"] };
    }
  })();

  return cached;
}
