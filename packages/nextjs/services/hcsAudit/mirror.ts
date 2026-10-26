// Thin REST client for the public Hedera mirror node. Used by the regulator
// feed and the issuer's trail directly from the browser, and by server
// routes that need to read back what actually landed on chain (e.g. to
// verify a HashPack-signed submission). Testnet only, per this template.

export const MIRROR_BASE_URL = "https://testnet.mirrornode.hedera.com";

export type MirrorTopicMessage = {
  consensus_timestamp: string;
  topic_id: string;
  message: string; // base64
  payer_account_id: string;
  sequence_number: number;
  running_hash: string;
};

type MirrorTopicMessagesResponse = {
  messages: MirrorTopicMessage[];
  links?: { next?: string | null };
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mirror node request failed (${res.status}): ${url}`);
  return (await res.json()) as T;
}

/** Fetches every message currently on a topic, oldest first. */
export async function fetchAllTopicMessages(topicId: string, baseUrl = MIRROR_BASE_URL): Promise<MirrorTopicMessage[]> {
  const out: MirrorTopicMessage[] = [];
  let url: string | null = `${baseUrl}/api/v1/topics/${topicId}/messages?order=asc&limit=100`;
  while (url) {
    const page: MirrorTopicMessagesResponse | null = await fetchJson<MirrorTopicMessagesResponse>(url);
    if (!page) break;
    out.push(...page.messages);
    url = page.links?.next ? `${baseUrl}${page.links.next}` : null;
  }
  return out;
}

/** Converts the SDK transaction id form (`0.0.1234@seconds.nanos`) to the mirror node's dashed form. */
export function sdkTxIdToMirrorForm(tx: string): string {
  const [account, validStart] = tx.split("@");
  const [seconds, nanos] = validStart.split(".");
  return `${account}-${seconds}-${nanos}`;
}

export type MirrorTokenTransfer = { token_id: string; account: string; amount: number };

export type MirrorTransaction = {
  transaction_id: string;
  result: string;
  name: string;
  entity_id: string | null;
  /** Present on CRYPTOTRANSFER; the legs a token transfer actually moved. */
  token_transfers?: MirrorTokenTransfer[];
};

/** Looks up a transaction's recorded result on the mirror node, by its SDK-form id. */
export async function fetchMirrorTransaction(
  txIdSdkForm: string,
  baseUrl = MIRROR_BASE_URL,
): Promise<MirrorTransaction | null> {
  const mirrorForm = sdkTxIdToMirrorForm(txIdSdkForm);
  const data = await fetchJson<{ transactions: MirrorTransaction[] }>(`${baseUrl}/api/v1/transactions/${mirrorForm}`);
  if (!data || data.transactions.length === 0) return null;
  return data.transactions[0];
}

/**
 * The newest messages on a topic. Used to confirm that the bytes a wallet was asked
 * to submit are the bytes that actually landed, which a successful transaction id
 * on its own does not establish.
 */
export async function fetchRecentTopicMessages(
  topicId: string,
  limit = 10,
  baseUrl = MIRROR_BASE_URL,
): Promise<MirrorTopicMessage[]> {
  const data = await fetchJson<MirrorTopicMessagesResponse>(
    `${baseUrl}/api/v1/topics/${topicId}/messages?order=desc&limit=${limit}`,
  );
  return data?.messages ?? [];
}

export type MirrorAccountKey = { type: "ECDSA_SECP256K1" | "ED25519" | string; key: string } | null;

/** Looks up an account's public key from the mirror node. */
export async function fetchAccountPublicKey(accountId: string, baseUrl = MIRROR_BASE_URL): Promise<MirrorAccountKey> {
  const data = await fetchJson<{ key?: { _type?: string; key?: string } | null }>(
    `${baseUrl}/api/v1/accounts/${accountId}`,
  );
  if (!data?.key?.key || !data.key._type) return null;
  return { type: data.key._type, key: data.key.key };
}

export function hashscanAccountUrl(accountId: string): string {
  return `https://hashscan.io/testnet/account/${accountId}`;
}

export function hashscanTopicUrl(topicId: string): string {
  return `https://hashscan.io/testnet/topic/${topicId}`;
}

export function hashscanTokenUrl(tokenId: string): string {
  return `https://hashscan.io/testnet/token/${tokenId}`;
}

export function hashscanTransactionUrl(txIdSdkForm: string): string {
  return `https://hashscan.io/testnet/transaction/${sdkTxIdToMirrorForm(txIdSdkForm)}`;
}
