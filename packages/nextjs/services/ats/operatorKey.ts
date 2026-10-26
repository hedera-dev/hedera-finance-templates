// Server-only. HEDERA_OPERATOR_KEY must be ECDSA (JSON-RPC transactions are ECDSA-signed): raw
// hex with or without "0x", or DER-encoded ECDSA. An ED25519 key must be refused with a readable
// message. DER encoding carries its own algorithm OID, so `PrivateKey.isDerKey` / `getAlgorithm`
// (from the already-installed @hiero-ledger/sdk) tell ECDSA apart from ED25519 unambiguously;
// a *raw* hex string carries no such tag, so per the spec it is always treated as ECDSA.
import { PrivateKey } from "@hiero-ledger/sdk";
import type { Hex } from "viem";

export type OperatorKeyResult = { ok: true; privateKeyHex: Hex } | { ok: false; error: string };

const HEX_RE = /^[0-9a-fA-F]+$/;

export function parseOperatorKey(raw: string): OperatorKeyResult {
  const trimmed = raw.trim();
  const noPrefix = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;

  if (!HEX_RE.test(noPrefix)) {
    return { ok: false, error: "HEDERA_OPERATOR_KEY is not a recognized ECDSA key (expected hex or DER)." };
  }

  // A bare 32-byte hex string: the spec defines this as a raw ECDSA private key.
  if (noPrefix.length === 64) {
    return { ok: true, privateKeyHex: `0x${noPrefix}` as Hex };
  }

  if (!PrivateKey.isDerKey(noPrefix)) {
    return {
      ok: false,
      error: "HEDERA_OPERATOR_KEY is not a recognized ECDSA key: expected 32-byte raw hex or DER-encoded ECDSA.",
    };
  }

  const algorithm = PrivateKey.getAlgorithm(noPrefix);
  if (algorithm !== "ecdsa") {
    return {
      ok: false,
      error: "HEDERA_OPERATOR_KEY is an ED25519 key. JSON-RPC transactions are ECDSA-signed: set an ECDSA key.",
    };
  }

  const rawHex = PrivateKey.fromStringECDSA(noPrefix).toStringRaw();
  return { ok: true, privateKeyHex: `0x${rawHex}` as Hex };
}
