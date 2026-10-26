// HashPack, wired through `@hashgraph/hedera-wallet-connect`, is the only
// wallet this app offers (see hooks/hcsAudit/useHashPackWallet.ts). Wagmi
// itself is kept only for the handful of EVM-chain plumbing hooks still used
// by the generic scaffold shell (e.g. network/price display); it is never
// used to connect a wallet, so there are no connectors to offer here.
export const wagmiConnectors = () => [];
