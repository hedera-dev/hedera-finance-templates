"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type HederaWalletAccount,
  disconnectHederaWallet,
  getConnectedAccount,
  getHederaWallet,
  openHederaConnectModal,
  signAndExecuteWithWallet,
  subscribeToAccount,
} from "~~/services/walletconnect/hederaWallet";

const NOT_CONNECTED: HederaWalletAccount = { accountId: "", isConnected: false };

/**
 * Connects the page to HashPack over WalletConnect. `projectId` comes from
 * `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`; when it is empty the hook reports
 * `isConfigured: false` and every action is a no-op.
 */
export function useHederaWallet(projectId: string) {
  const [account, setAccount] = useState<HederaWalletAccount>(NOT_CONNECTED);
  const isConfigured = projectId.length > 0;

  useEffect(() => {
    if (!isConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void getHederaWallet(projectId)
      ?.then(({ kit }) => {
        if (cancelled) return;
        setAccount(getConnectedAccount(kit));
        unsubscribe = subscribeToAccount(kit, setAccount);
      })
      .catch(e => console.error("HashPack connection could not start", e));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [projectId, isConfigured]);

  const connect = useCallback(async () => {
    const wallet = await getHederaWallet(projectId);
    if (!wallet) return;
    await openHederaConnectModal(wallet.kit);
  }, [projectId]);

  const disconnect = useCallback(async () => {
    const wallet = await getHederaWallet(projectId);
    if (!wallet) return;
    await disconnectHederaWallet(wallet.kit);
    setAccount(NOT_CONNECTED);
  }, [projectId]);

  const signAndExecute = useCallback(
    async (transactionBase64: string) => {
      const wallet = await getHederaWallet(projectId);
      if (!wallet || !account.accountId) throw new Error("HashPack is not connected.");
      return signAndExecuteWithWallet(wallet.provider, account.accountId, transactionBase64);
    },
    [projectId, account.accountId],
  );

  return { ...account, isConfigured, connect, disconnect, signAndExecute };
}
