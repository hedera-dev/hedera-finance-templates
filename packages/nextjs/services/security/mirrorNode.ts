import type { MirrorKey } from "~~/services/security/keys";

/**
 * Thin wrappers around the Hedera testnet mirror node REST API. Every read the desk shows —
 * KYC, frozen state, balances, supply, pause status, key structure — comes from here, never
 * from server memory. A thrown error means the read failed; callers must surface that as
 * "unknown"/"unavailable" rather than guessing a value.
 */

const MIRROR_BASE = process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com";

async function mirrorFetch(path: string): Promise<any | null> {
  const res = await fetch(`${MIRROR_BASE}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mirror node request failed (${res.status}): ${path}`);
  return res.json();
}

export type MirrorAccount = {
  accountId: string;
  key: MirrorKey;
  evmAddress: string | null;
};

/** Resolves an account by Hedera id or EVM address. Null if it does not exist (yet). */
export async function getMirrorAccount(accountIdOrEvm: string): Promise<MirrorAccount | null> {
  const data = await mirrorFetch(`/api/v1/accounts/${accountIdOrEvm}`);
  if (!data?.account) return null;
  return { accountId: data.account, key: data.key ?? null, evmAddress: data.evm_address ?? null };
}

export type MirrorTokenInfo = {
  tokenId: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  pauseStatus: "PAUSED" | "UNPAUSED" | "NOT_APPLICABLE";
  treasuryAccountId: string;
  adminKey: MirrorKey;
  kycKey: MirrorKey;
  freezeKey: MirrorKey;
  wipeKey: MirrorKey;
  pauseKey: MirrorKey;
};

export async function getMirrorTokenInfo(tokenId: string): Promise<MirrorTokenInfo | null> {
  const data = await mirrorFetch(`/api/v1/tokens/${tokenId}`);
  if (!data?.token_id) return null;
  return {
    tokenId: data.token_id,
    symbol: data.symbol,
    decimals: Number(data.decimals ?? 0),
    totalSupply: data.total_supply ?? "0",
    pauseStatus: data.pause_status ?? "NOT_APPLICABLE",
    treasuryAccountId: data.treasury_account_id,
    adminKey: data.admin_key ?? null,
    kycKey: data.kyc_key ?? null,
    freezeKey: data.freeze_key ?? null,
    wipeKey: data.wipe_key ?? null,
    pauseKey: data.pause_key ?? null,
  };
}

export type TokenRelationship = {
  balance: string;
  kycStatus: "GRANTED" | "REVOKED" | "NOT_APPLICABLE";
  freezeStatus: "FROZEN" | "UNFROZEN" | "NOT_APPLICABLE";
};

/** An account's relationship to a token: balance, KYC and frozen state, all in one read. */
export async function getTokenRelationship(accountId: string, tokenId: string): Promise<TokenRelationship | null> {
  const data = await mirrorFetch(`/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`);
  const entry = data?.tokens?.[0];
  if (!entry) return null;
  return {
    balance: String(entry.balance ?? 0),
    kycStatus: entry.kyc_status ?? "NOT_APPLICABLE",
    freezeStatus: entry.freeze_status ?? "NOT_APPLICABLE",
  };
}

export type MirrorSchedule = {
  scheduleId: string;
  deleted: boolean;
  executedTimestamp: string | null;
  expirationTime: string | null;
  memo: string | null;
  signatures: { publicKeyPrefix: string }[];
};

export async function getMirrorSchedule(scheduleId: string): Promise<MirrorSchedule | null> {
  const data = await mirrorFetch(`/api/v1/schedules/${scheduleId}`);
  if (!data?.schedule_id) return null;
  return {
    scheduleId: data.schedule_id,
    deleted: Boolean(data.deleted),
    executedTimestamp: data.executed_timestamp ?? null,
    expirationTime: data.expiration_time ?? null,
    memo: data.memo ?? null,
    // Mirror node sends `public_key_prefix` base64-encoded (like `signature` and `transaction_hash`
    // elsewhere in this API) — decoded to hex here so every caller can compare it against an SDK
    // `PublicKey`'s own hex bytes without needing to know that.
    signatures: (data.signatures ?? []).map((s: any) => ({
      publicKeyPrefix: s.public_key_prefix ? Buffer.from(String(s.public_key_prefix), "base64").toString("hex") : "",
    })),
  };
}
