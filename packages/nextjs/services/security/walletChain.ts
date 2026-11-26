import { hederaTestnet } from "viem/chains";

/** Whatever answers `eth_chainId` for the connected wallet — a wagmi connector, in the app. */
type ChainSource = { getChainId: () => Promise<number> };

/**
 * Puts the connected wallet on Hedera testnet, or says plainly why it could not be.
 *
 * Neither of the obvious answers can be trusted here. `useAccount().chainId` is wagmi's own
 * view — the configured chain, whatever the wallet is doing — so it cannot see a wallet that
 * disagrees. And `wallet_switchEthereumChain` returns `null` for success, which HashPack's EVM
 * provider returns while staying on 295 (mainnet) and serving a testnet account. So the wallet
 * is asked before and after, and only its second answer decides.
 */
export async function ensureTestnet(
  connector: ChainSource,
  switchChain: (args: { chainId: number }) => Promise<unknown>,
): Promise<void> {
  if ((await connector.getChainId()) === hederaTestnet.id) return;

  // A wallet that refuses outright throws; one that lies resolves. The re-read covers both.
  await switchChain({ chainId: hederaTestnet.id }).catch(() => undefined);

  const current = await connector.getChainId();
  if (current === hederaTestnet.id) return;

  throw new Error(
    `This wallet is on chain ${current}, not Hedera testnet (${hederaTestnet.id}), and did not switch when asked. ` +
      `Connect a wallet set to Hedera testnet to approve as Officer 3.`,
  );
}
