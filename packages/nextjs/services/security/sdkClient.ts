import { Client } from "@hiero-ledger/sdk";
import { getOperatorConfig } from "~~/services/security/operator";

let client: Client | null = null;

/** Shared Hedera SDK client for the desk. The operator is both payer and token treasury. */
export async function getSdkClient(): Promise<Client> {
  if (client) return client;
  const result = await getOperatorConfig();
  if (!result.ok) throw new Error("Operator is not configured.");
  client = Client.forTestnet().setOperator(result.config.accountId, result.config.privateKey);
  return client;
}
