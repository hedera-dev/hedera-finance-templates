// Testnet-only app: HashScan links always point at testnet.
const HASHSCAN_BASE = "https://hashscan.io/testnet";

export const hashscanContractUrl = (contractId: string) => `${HASHSCAN_BASE}/contract/${contractId}`;
export const hashscanAccountUrl = (accountIdOrEvmAddress: string) =>
  `${HASHSCAN_BASE}/account/${accountIdOrEvmAddress}`;
export const hashscanTxUrl = (txHash: string) => `${HASHSCAN_BASE}/transaction/${txHash}`;
