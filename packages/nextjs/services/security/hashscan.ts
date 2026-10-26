/** Links into HashScan for Hedera testnet, where every entity this desk creates lives. */

const BASE = "https://hashscan.io/testnet";

export const hashscanAccount = (accountId: string) => `${BASE}/account/${accountId}`;
export const hashscanToken = (tokenId: string) => `${BASE}/token/${tokenId}`;
export const hashscanSchedule = (scheduleId: string) => `${BASE}/schedule/${scheduleId}`;

/**
 * HashScan writes transaction ids as `shard.realm.num-seconds-nanos`, but the SDK's
 * `TransactionId.toString()` gives `shard.realm.num@seconds.nanos`. Converts between the two.
 */
export function hashscanTransaction(transactionId: string): string {
  const [account, time] = transactionId.split("@");
  const dashed = time ? `${account}-${time.replace(".", "-")}` : transactionId;
  return `${BASE}/transaction/${dashed}`;
}
