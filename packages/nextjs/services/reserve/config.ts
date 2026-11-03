// Server-only: the operator the desk acts as, read from the environment.
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const MISSING_CONFIG_MESSAGE =
  "No operator is configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env.local, then restart the server.";

// DER prefixes: 302e…2b6570… wraps an ED25519 key, 3030/3074…2b8104000a… an ECDSA secp256k1 key.
const ED25519_OID = "06032b6570";
const SECP256K1_OID = "2b8104000a";

type KeyResult = { ok: true; key: Hex } | { ok: false; error: string };

/** Accepts raw ECDSA hex (with or without `0x`) or DER-encoded ECDSA. Refuses ED25519, which JSON-RPC cannot sign. */
export function parseOperatorKey(raw: string): KeyResult {
  const text = raw.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(text)) {
    return { ok: false, error: "HEDERA_OPERATOR_KEY is not hexadecimal. Use an ECDSA key as raw hex or DER." };
  }
  const lower = text.toLowerCase();
  if (lower.length === 64) return { ok: true, key: `0x${lower}` };

  if (lower.includes(ED25519_OID)) {
    return {
      ok: false,
      error:
        "HEDERA_OPERATOR_KEY is an ED25519 key. JSON-RPC transactions are ECDSA-signed, so the operator must be an ECDSA account.",
    };
  }
  // A DER ECDSA private key ends with the 32-byte key after an `0420` octet-string header.
  if (lower.includes(SECP256K1_OID) && lower.length >= 64 + 4) {
    const marker = lower.lastIndexOf("0420");
    const key = lower.slice(marker + 4, marker + 4 + 64);
    if (marker !== -1 && key.length === 64) return { ok: true, key: `0x${key}` };
  }
  return {
    ok: false,
    error: "HEDERA_OPERATOR_KEY is not a recognised ECDSA key. Use 32 bytes of raw hex, or a DER-encoded ECDSA key.",
  };
}

export type OperatorConfig =
  | { ok: true; accountId: string; key: Hex; address: `0x${string}` }
  | { ok: false; error: string };

export function readOperatorConfig(env: NodeJS.ProcessEnv = process.env): OperatorConfig {
  const accountId = env.HEDERA_OPERATOR_ID?.trim();
  const rawKey = env.HEDERA_OPERATOR_KEY?.trim();
  if (!accountId || !rawKey) return { ok: false, error: MISSING_CONFIG_MESSAGE };
  if (!/^\d+\.\d+\.\d+$/.test(accountId)) {
    return { ok: false, error: "HEDERA_OPERATOR_ID must look like 0.0.1234." };
  }
  const parsed = parseOperatorKey(rawKey);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, accountId, key: parsed.key, address: privateKeyToAccount(parsed.key).address as `0x${string}` };
  } catch {
    return { ok: false, error: "HEDERA_OPERATOR_KEY is not a valid secp256k1 private key." };
  }
}
