"use client";

import { hashscanAccountUrl } from "~~/services/hcsAudit/mirror";
import type { Publisher, SigningMode } from "~~/services/hcsAudit/types";

type WalletInfo = {
  configured: boolean;
  accountId: string | null;
  connecting: boolean;
  initError: string | null;
  connect: () => void;
  disconnect: () => void;
};

type SigningModePanelProps = {
  signingMode: SigningMode;
  onSigningModeChange: (mode: SigningMode) => void;
  wallet: WalletInfo;
  publishers: Publisher[];
  authorizing: boolean;
  authorizeError: string | null;
  onAuthorize: () => void;
};

export const SigningModePanel = ({
  signingMode,
  onSigningModeChange,
  wallet,
  publishers,
  authorizing,
  authorizeError,
  onAuthorize,
}: SigningModePanelProps) => {
  const isAuthorized = Boolean(wallet.accountId && publishers.some(p => p.accountId === wallet.accountId));

  let walletStateText = "";
  if (!wallet.configured) {
    walletStateText = "HashPack signing is not configured.";
  } else if (!wallet.accountId) {
    walletStateText = "Connect HashPack to continue.";
  } else if (!isAuthorized) {
    walletStateText = "Authorise this wallet as a publisher, then perform an action.";
  } else {
    walletStateText = "Perform an action below — HashPack will sign and submit its audit entry.";
  }

  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300">
      <div className="flex flex-col gap-1 mb-3">
        <label htmlFor="signing-mode" className="text-xs font-medium text-base-content/70">
          Signing mode
        </label>
        <select
          id="signing-mode"
          className="select select-sm select-bordered w-40"
          value={signingMode}
          onChange={e => onSigningModeChange(e.target.value as SigningMode)}
        >
          <option value="issuer">Issuer</option>
          <option value="hashpack">HashPack</option>
        </select>
      </div>

      {signingMode === "hashpack" && (
        <div className="flex flex-col gap-3">
          {!wallet.configured && (
            <p id="wallet-config-error" className="text-sm text-error">
              Set <code>NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID</code> to enable HashPack signing.
            </p>
          )}

          <button
            id="connect-hashpack"
            className="btn btn-sm btn-outline w-fit"
            disabled={!wallet.configured || wallet.connecting}
            onClick={() => (wallet.accountId ? wallet.disconnect() : wallet.connect())}
          >
            {wallet.connecting ? "Connecting…" : wallet.accountId ? "Disconnect HashPack" : "Connect HashPack"}
          </button>
          {wallet.initError && <p className="text-sm text-error">{wallet.initError}</p>}

          {wallet.accountId && (
            <div className="text-sm">
              <span className="font-medium">Connected: </span>
              <a
                id="wallet-account-id"
                href={hashscanAccountUrl(wallet.accountId)}
                target="_blank"
                rel="noreferrer"
                className="link link-primary"
              >
                {wallet.accountId}
              </a>
            </div>
          )}

          <button
            id="authorize-publisher"
            className="btn btn-sm btn-outline w-fit"
            disabled={!wallet.configured || !wallet.accountId || isAuthorized || authorizing}
            onClick={onAuthorize}
          >
            {authorizing ? "Authorising…" : "Authorise as publisher"}
          </button>
          {authorizeError && <p className="text-sm text-error">{authorizeError}</p>}

          <div id="publishers" className="text-sm">
            <span className="font-medium">Publishers: </span>
            {publishers.length === 0 ? "none yet" : publishers.map(p => `${p.accountId} (${p.role})`).join(", ")}
          </div>

          <p id="wallet-state" className="text-sm text-base-content/70">
            {walletStateText}
          </p>
        </div>
      )}
    </div>
  );
};
