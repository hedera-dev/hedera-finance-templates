import * as chains from "viem/chains";

export type ScaffoldConfig = {
  targetNetworks: readonly [chains.Chain, ...chains.Chain[]];
  pollingInterval: number;
  rpcOverrides?: Record<number, string>;
  /**
   * A second, genuinely different RPC per chain to fall back to. `rpcOverrides` and viem's own
   * built-in default for Hedera's chains both resolve to the same Hashio URL, so a wallet action
   * (connecting, signing) has no real fallback if that one host has an outage — which it does,
   * intermittently. This is what actually gives `fallback([...])` in `wagmiConfig.tsx` a second
   * provider to try.
   */
  rpcFallbackOverrides?: Record<number, string>;
  enableBurnerWallet: boolean;
  walletConnectProjectId: string;
};

const hederaLocalFork = {
  ...chains.hardhat,
  name: "Hedera Local Fork",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    // Note: HBAR has 8 protocol decimals (tinybar),
    // but JSON-RPC msg.value & gasPrice use 18 decimals for EVM compatibility.
    // We keep 18 here so tx.value formatting matches what viem/hardhat return.
    decimals: 18,
  },
} as const satisfies chains.Chain;

const targetNetworks = [chains.hederaTestnet, chains.hedera, hederaLocalFork] as const satisfies readonly [
  chains.Chain,
  ...chains.Chain[],
];

const scaffoldConfig = {
  targetNetworks,

  pollingInterval: 10000,

  enableBurnerWallet: true,

  rpcOverrides: {
    [chains.hedera.id]: process.env.NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL || "https://mainnet.hashio.io/api",
    [chains.hederaTestnet.id]: process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
  },

  // thirdweb's public relay: a different operator from Hashio, so it stays up when Hashio doesn't.
  rpcFallbackOverrides: {
    [chains.hedera.id]: process.env.NEXT_PUBLIC_HEDERA_MAINNET_RPC_FALLBACK_URL || "https://hedera.rpc.thirdweb.com",
    [chains.hederaTestnet.id]:
      process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_FALLBACK_URL || "https://hedera-testnet.rpc.thirdweb.com",
  },

  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
