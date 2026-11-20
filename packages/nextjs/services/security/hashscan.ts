/** Links into HashScan for Hedera testnet, where everything this desk creates lives. */

const BASE = "https://hashscan.io/testnet";

export const hashscanAccount = (accountId: string) => `${BASE}/account/${accountId}`;
export const hashscanContract = (contractId: string) => `${BASE}/contract/${contractId}`;
/** An EVM transaction hash; HashScan resolves it to the Hedera transaction that carried it. */
export const hashscanTransaction = (hash: string) => `${BASE}/transaction/${hash}`;
