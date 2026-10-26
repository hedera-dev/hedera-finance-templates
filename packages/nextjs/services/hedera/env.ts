/**
 * Server-only environment lookups for the DvP desk. Never import this file
 * from a client component — it reads the operator's private key.
 */

export const MISSING_OPERATOR_ENV_VARS = ["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"] as const;

export type OperatorCredentials = {
  operatorId: string;
  operatorKey: string;
};

/** Returns the operator credentials, or null if either env var is unset. */
export function getOperatorCredentials(): OperatorCredentials | null {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) return null;
  return { operatorId, operatorKey };
}

/** Names of the operator env vars that are not currently set. */
export function missingOperatorEnvVars(): string[] {
  return MISSING_OPERATOR_ENV_VARS.filter(name => !process.env[name]);
}
