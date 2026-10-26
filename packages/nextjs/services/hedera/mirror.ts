/**
 * Balance reads go through the mirror node's REST API rather than a consensus-node query:
 * it's the same source of truth the checker cross-references, and unlike a consensus query it
 * isn't subject to a testnet node's free-query throttling.
 */

const MIRROR_BASE = process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com";

type TokenBalancesResponse = { tokens?: { token_id?: string; balance: number | string }[] };

async function fetchTokenBalance(accountId: string, tokenId: string): Promise<bigint> {
  const url = `${MIRROR_BASE}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Mirror node request for ${accountId} failed with status ${res.status}`);
  const data = (await res.json()) as TokenBalancesResponse;
  const entry = data.tokens?.[0];
  return entry ? BigInt(entry.balance) : 0n;
}

export type MirrorBalances = { security: bigint; payment: bigint };

/** Reads an account's balance of the two DvP tokens from the mirror node. */
export async function fetchPartyBalances(
  accountId: string,
  securityTokenId: string,
  paymentTokenId: string,
): Promise<MirrorBalances> {
  const [security, payment] = await Promise.all([
    fetchTokenBalance(accountId, securityTokenId),
    fetchTokenBalance(accountId, paymentTokenId),
  ]);
  return { security, payment };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Waits until the mirror node confirms that an account is associated with every token. */
export async function waitForTokenAssociations(
  accountId: string,
  tokenIds: string[],
  maxAttempts = 8,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const associated = await Promise.all(
      tokenIds.map(async tokenId => {
        const res = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`, {
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = (await res.json()) as TokenBalancesResponse;
        return data.tokens?.some(token => token.token_id === tokenId) ?? false;
      }),
    );
    if (associated.every(Boolean)) return;
    await sleep(delayMs);
  }
  throw new Error(`Mirror node did not confirm token association for ${accountId}.`);
}

/**
 * "0.0.1234@1690000000.123456789" (SDK) -> "0.0.1234-1690000000-123456789" (mirror node).
 * A scheduled id carries a "?scheduled" suffix; the mirror node rejects that bare parameter
 * with a 400 and wants "?scheduled=true" instead, which selects the executed transfer.
 */
function toMirrorTransactionPath(sdkTransactionId: string): string {
  const [base, suffix] = sdkTransactionId.split("?");
  const [payer, time] = base.split("@");
  const [seconds, nanos] = time.split(".");
  return `${payer}-${seconds}-${nanos}${suffix === "scheduled" ? "?scheduled=true" : ""}`;
}

/**
 * Blocks until the mirror node has indexed the given (SDK-formatted) transaction id, so a
 * balance read issued right after is never stale. Gives up quietly after a few seconds — the
 * caller's balances may then lag by a beat, but will catch up on the next refresh.
 */
export async function waitForMirrorIndexing(sdkTransactionId: string, maxAttempts = 8, delayMs = 1000): Promise<void> {
  const mirrorPath = toMirrorTransactionPath(sdkTransactionId);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${MIRROR_BASE}/api/v1/transactions/${mirrorPath}`, { cache: "no-store" });
    if (res.ok) return;
    await sleep(delayMs);
  }
}

export type MirrorScheduleInfo = {
  deleted: boolean;
  /** Mirror node "seconds.nanos" string, or null while unexecuted. */
  executedTimestamp: string | null;
  /** Mirror node "seconds.nanos" string. */
  expirationTime: string | null;
  waitForExpiry: boolean;
};

type ScheduleResponse = {
  deleted?: boolean;
  executed_timestamp?: string | null;
  expiration_time?: string | null;
  wait_for_expiry?: boolean;
};

/** Reads a schedule's lifecycle fields from the mirror node: whether and when it executed, was deleted, or expires. */
export async function fetchScheduleInfo(scheduleId: string): Promise<MirrorScheduleInfo | null> {
  const res = await fetch(`${MIRROR_BASE}/api/v1/schedules/${scheduleId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mirror node request for schedule ${scheduleId} failed with status ${res.status}`);
  const data = (await res.json()) as ScheduleResponse;
  return {
    deleted: data.deleted ?? false,
    executedTimestamp: data.executed_timestamp ?? null,
    expirationTime: data.expiration_time ?? null,
    waitForExpiry: data.wait_for_expiry ?? false,
  };
}

export type MirrorPublicKey = { type: "ECDSA" | "ED25519"; key: string };

type AccountResponse = { key?: { _type?: string; key?: string } | null };

/** Reads an account's public key from the mirror node — needed to set a wallet Seller as a schedule's admin key. */
export async function fetchAccountPublicKey(accountId: string): Promise<MirrorPublicKey> {
  const res = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}?limit=1`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Mirror node request for account ${accountId} failed with status ${res.status}`);
  const data = (await res.json()) as AccountResponse;
  const key = data.key;
  if (!key?.key) throw new Error(`Mirror node has no public key on record for ${accountId} yet.`);
  return { type: key._type === "ED25519" ? "ED25519" : "ECDSA", key: key.key };
}

type TopicMessageResponse = {
  messages?: { sequence_number: number; consensus_timestamp: string; message: string }[];
  links?: { next?: string | null };
};

export type MirrorTopicMessage = { sequenceNumber: number; consensusTimestamp: string; message: string };

/** Reads every message published to a topic, oldest first, decoding each from base64 to a UTF-8 string. */
export async function fetchTopicMessages(topicId: string): Promise<MirrorTopicMessage[]> {
  const out: MirrorTopicMessage[] = [];
  let path: string | null = `/api/v1/topics/${topicId}/messages?order=asc&limit=100`;
  while (path) {
    const res = await fetch(`${MIRROR_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Mirror node request for topic ${topicId} failed with status ${res.status}`);
    const data = (await res.json()) as TopicMessageResponse;
    for (const m of data.messages ?? []) {
      out.push({
        sequenceNumber: m.sequence_number,
        consensusTimestamp: m.consensus_timestamp,
        message: Buffer.from(m.message, "base64").toString("utf8"),
      });
    }
    path = data.links?.next ?? null;
  }
  return out;
}

/** Mirror node "seconds.nanos" -> ISO timestamp string. */
export function mirrorTimestampToIso(secondsDotNanos: string): string {
  const [seconds, nanos] = secondsDotNanos.split(".");
  const millis = Number(seconds) * 1000 + Math.round(Number(nanos ?? "0") / 1e6);
  return new Date(millis).toISOString();
}
