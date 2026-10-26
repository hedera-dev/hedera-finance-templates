import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";
import { getOperatorCredentials } from "~~/services/hedera/env";

/**
 * Builds a fresh testnet client bound to the operator account. Server-only:
 * the operator's private key never leaves this process.
 */
export function getOperatorClient(): Client {
  const credentials = getOperatorCredentials();
  if (!credentials) {
    throw new Error("Operator is not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.");
  }
  const operatorId = AccountId.fromString(credentials.operatorId);
  return Client.forTestnet().setOperator(operatorId, parseOperatorKey(credentials.operatorKey));
}

/**
 * Accepts the formats the Hedera Portal hands out: a raw 32-byte ECDSA key in hex (with or without
 * `0x`), or a DER-encoded key of either type (`3030…` ECDSA, `302e…` ED25519), which says its type.
 */
function parseOperatorKey(key: string): PrivateKey {
  const hex = key.trim().replace(/^0x/i, "");
  return /^[0-9a-f]{64}$/i.test(hex) ? PrivateKey.fromStringECDSA(hex) : PrivateKey.fromStringDer(hex);
}
