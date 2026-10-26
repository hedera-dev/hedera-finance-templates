"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HederaAdapter,
  HederaChainDefinition,
  HederaProvider,
  hederaNamespace,
} from "@hashgraph/hedera-wallet-connect";
import type { AppKit } from "@reown/appkit";
import { createAppKit } from "@reown/appkit";
import type UniversalProvider from "@walletconnect/universal-provider";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

const METADATA = {
  name: "HCS Audit Trail",
  description: "Issuer compliance desk for a Hedera security token",
  url: typeof window !== "undefined" ? window.location.origin : "https://example.com",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

type Wiring = { provider: HederaProvider; appKit: AppKit };

// Module-level: one provider/AppKit pair for the whole app. A failed
// start-up must not be cached, or every later attempt would fail forever.
let wiring: Promise<Wiring> | null = null;

function initWiring(): Promise<Wiring> {
  const attempt = (async (): Promise<Wiring> => {
    const provider = await HederaProvider.init({ projectId: PROJECT_ID, metadata: METADATA });
    const adapter = new HederaAdapter({
      projectId: PROJECT_ID,
      networks: [HederaChainDefinition.Native.Testnet],
      namespace: hederaNamespace,
    });
    const appKit = createAppKit({
      adapters: [adapter],
      // The library's own docs cast its HederaProvider to UniversalProvider here:
      // createAppKit's declared type predates Hedera's native `hedera_*` methods.
      universalProvider: provider as unknown as UniversalProvider,
      projectId: PROJECT_ID,
      metadata: METADATA,
      networks: [HederaChainDefinition.Native.Testnet],
    });
    return { provider, appKit };
  })();
  attempt.catch(() => {
    wiring = null;
  });
  return attempt;
}

function getWiring(): Promise<Wiring> {
  if (!wiring) wiring = initWiring();
  return wiring;
}

function connectedAccountId(provider: HederaProvider): string | null {
  // After a page reload the session is restored by WalletConnect's own storage,
  // but the provider's native sub-provider isn't rebuilt until something reads
  // `rpcProviders`. Touch it before relying on account/signing state.
  void provider.rpcProviders;
  return provider.getAccountAddresses()[0] ?? null;
}

export function useHashPackWallet() {
  const configured = PROJECT_ID.length > 0;
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const providerRef = useRef<HederaProvider | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    getWiring()
      .then(({ provider, appKit }) => {
        if (cancelled) return;
        providerRef.current = provider;
        setAccountId(connectedAccountId(provider));

        const refresh = () => setAccountId(connectedAccountId(provider));
        provider.on("session_event", refresh);
        provider.on("session_update", refresh);
        provider.on("session_delete", () => setAccountId(null));
        appKit.subscribeAccount(() => refresh(), hederaNamespace);
      })
      .catch(e => {
        if (!cancelled) setInitError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [configured]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setInitError(null);
    try {
      const { provider, appKit } = await getWiring();
      providerRef.current = provider;
      await appKit.open();
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const current = wiring;
    if (!current) return;
    const { appKit } = await current;
    await appKit.disconnect();
    setAccountId(null);
  }, []);

  const signAndSubmit = useCallback(
    async (transactionBytesBase64: string): Promise<{ transactionId: string }> => {
      const provider = providerRef.current;
      if (!provider || !accountId) throw new Error("Connect HashPack first.");
      const result = await provider.hedera_signAndExecuteTransaction({
        signerAccountId: `hedera:testnet:${accountId}`,
        transactionList: transactionBytesBase64,
      });
      return { transactionId: result.transactionId };
    },
    [accountId],
  );

  return { configured, accountId, connecting, initError, connect, disconnect, signAndSubmit };
}
