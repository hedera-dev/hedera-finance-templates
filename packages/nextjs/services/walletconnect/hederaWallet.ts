/**
 * Client-only HashPack connectivity via WalletConnect / Reown AppKit. The app never holds the
 * wallet's key: every signature is a `hedera_signAndExecuteTransaction` request relayed through
 * WalletConnect to HashPack. Only import this from client components.
 *
 * Wiring follows `@hashgraph/hedera-wallet-connect`: a `HederaProvider` is created first and
 * handed to AppKit as its `universalProvider`. Signing is called on that `HederaProvider` —
 * `appKit.getProvider()` returns an object without the `hedera_*` methods.
 */
import {
  HederaAdapter,
  HederaChainDefinition,
  HederaProvider,
  hederaNamespace,
} from "@hashgraph/hedera-wallet-connect";
import { type AppKit, createAppKit } from "@reown/appkit";

const HEDERA_TESTNET = HederaChainDefinition.Native.Testnet;

// `@reown/appkit`'s public types predate custom (non-eip155) namespaces, so its namespace
// parameters are typed as a fixed union that doesn't include "hedera". The adapter and provider
// both accept it at runtime; this alias documents the cast instead of sprinkling `as any`.
type Namespace = NonNullable<Parameters<AppKit["getAccount"]>[0]>;
const HEDERA_NS = hederaNamespace as unknown as Namespace;
// HederaProvider extends WalletConnect's UniversalProvider at runtime; AppKit types the option
// against its own copy of that class.
type AppKitUniversalProvider = NonNullable<Parameters<typeof createAppKit>[0]["universalProvider"]>;

export type HederaWallet = { kit: AppKit; provider: HederaProvider };

let wallet: Promise<HederaWallet> | null = null;
let walletProjectId: string | null = null;

/** Lazily creates the HederaProvider and AppKit once. Returns null until a project id is configured. */
export function getHederaWallet(projectId: string | undefined | null): Promise<HederaWallet> | null {
  if (!projectId) return null;
  if (wallet && walletProjectId === projectId) return wallet;

  walletProjectId = projectId;
  wallet = (async () => {
    const metadata = {
      name: "Hedera DvP Desk",
      description: "Delivery-versus-payment settlement demo",
      url: typeof window !== "undefined" ? window.location.origin : "https://hedera.com",
      icons: [],
    };
    const provider = await HederaProvider.init({ projectId, metadata });
    restoreProviders(provider);

    const kit = createAppKit({
      adapters: [new HederaAdapter({ projectId, networks: [HEDERA_TESTNET], namespace: hederaNamespace })],
      universalProvider: provider as unknown as AppKitUniversalProvider,
      networks: [HEDERA_TESTNET],
      defaultNetwork: HEDERA_TESTNET,
      projectId,
      metadata,
      features: { analytics: false, email: false, socials: [] },
    });
    return { kit, provider };
  })();
  // A failed start (relay down, bad project id) must not stick: the next call retries.
  wallet.catch(() => {
    wallet = null;
  });
  return wallet;
}

/**
 * After a page refresh `HederaProvider.init` restores the WalletConnect session but leaves
 * `provider.namespaces` empty, so the native provider is never created and signing fails with
 * "nativeProvider not initialized". Rebuild it from the session's approved namespaces.
 * Same fix as scaffold-hbar's hedera-demo template.
 */
function restoreProviders(provider: HederaProvider): void {
  const internals = provider as unknown as {
    session?: { namespaces?: Record<string, unknown> };
    namespaces?: Record<string, unknown>;
    nativeProvider?: unknown;
    initProviders?: () => void;
  };
  const sessionNamespaces = internals.session?.namespaces;
  if (!sessionNamespaces || internals.nativeProvider) return;
  if (Object.keys(internals.namespaces ?? {}).length === 0) internals.namespaces = { ...sessionNamespaces };
  internals.initProviders?.();
}

export type HederaWalletAccount = { accountId: string; isConnected: boolean };

/** Reads the currently connected Hedera account, if any. */
export function getConnectedAccount(kit: AppKit): HederaWalletAccount {
  const account = kit.getAccount(HEDERA_NS);
  const caipAddress = account?.caipAddress;
  const accountId = caipAddress ? (caipAddress.split(":").pop() ?? "") : "";
  return { accountId, isConnected: Boolean(account?.isConnected && accountId) };
}

/** Subscribes to connection changes; returns an unsubscribe function. */
export function subscribeToAccount(kit: AppKit, callback: (account: HederaWalletAccount) => void): () => void {
  return kit.subscribeAccount(() => callback(getConnectedAccount(kit)), HEDERA_NS);
}

export async function openHederaConnectModal(kit: AppKit): Promise<void> {
  await kit.open({ view: "Connect", namespace: HEDERA_NS });
}

export async function disconnectHederaWallet(kit: AppKit): Promise<void> {
  await kit.disconnect(HEDERA_NS);
}

/**
 * Asks HashPack (via WalletConnect) to sign and submit a frozen, unsigned transaction built by
 * the server. Returns the network transaction id so the server can look up what happened.
 */
export async function signAndExecuteWithWallet(
  provider: HederaProvider,
  accountId: string,
  transactionBase64: string,
): Promise<string> {
  restoreProviders(provider);
  const result = await provider.hedera_signAndExecuteTransaction({
    signerAccountId: `hedera:testnet:${accountId}`,
    transactionList: transactionBase64,
  });

  if (!result.transactionId) throw new Error("HashPack did not return a transaction id.");
  return result.transactionId;
}
