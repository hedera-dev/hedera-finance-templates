import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";

// Server-only: the operator key is parsed and used here, and nowhere else.
// Never import this module from a client component.

export function hasOperatorEnv(): boolean {
  return Boolean(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
}

/**
 * The operator key may be a raw ECDSA hex key (with or without `0x`), or a
 * DER-encoded ECDSA or ED25519 key. DER keys carry their own algorithm tag;
 * raw hex keys are assumed ECDSA, matching every Hedera wallet's default.
 */
export function parseOperatorKey(raw: string): PrivateKey {
  const trimmed = raw.trim();
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (PrivateKey.isDerKey(hex)) {
    return PrivateKey.fromStringDer(hex);
  }
  return PrivateKey.fromStringECDSA(hex);
}

type Operator = { accountId: AccountId; key: PrivateKey };

let cachedOperator: Operator | null = null;

export function getOperator(): Operator {
  if (cachedOperator) return cachedOperator;
  const id = process.env.HEDERA_OPERATOR_ID;
  const rawKey = process.env.HEDERA_OPERATOR_KEY;
  if (!id || !rawKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set.");
  }
  cachedOperator = { accountId: AccountId.fromString(id), key: parseOperatorKey(rawKey) };
  return cachedOperator;
}

// Keep a single Client (and the single underlying network connection pool)
// across requests in this server process. Stashed on globalThis so Next.js
// dev-mode module reloads don't spawn a new one per request.
//
// Callers must never `close()` it: it is shared, and a closed client fails every
// later transaction with "transaction must have been frozen before calculating the
// hash will be stable" — which looks like a bug in the transaction, not the client.
const globalForHedera = globalThis as unknown as { __hcsAuditClient?: Client };

export function getOperatorClient(): Client {
  if (globalForHedera.__hcsAuditClient) return globalForHedera.__hcsAuditClient;
  const { accountId, key } = getOperator();
  const client = Client.forTestnet().setOperator(accountId, key);
  globalForHedera.__hcsAuditClient = client;
  return client;
}
