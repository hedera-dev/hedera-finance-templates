"use client";

import { useCallback, useMemo, useState } from "react";
import { AuditLog } from "~~/app/_components/dvp/AuditLog";
import { HashScanLink } from "~~/app/_components/dvp/HashScanLink";
import { SetupPanel } from "~~/app/_components/dvp/SetupPanel";
import { TradeChanges } from "~~/app/_components/dvp/TradeChanges";
import { type Terms, TradeTicket } from "~~/app/_components/dvp/TradeTicket";
import { TradesList } from "~~/app/_components/dvp/TradesList";
import { useMarket } from "~~/app/_components/dvp/useMarket";
import { useHederaWallet } from "~~/hooks/scaffold-hbar/useHederaWallet";
import * as dvp from "~~/services/hedera/dvpClient";
import {
  BUYER_INITIAL_PAYMENT,
  SELLER_INITIAL_SECURITY,
  type TradeSnapshot,
  UNVERIFIED_BUYER_INITIAL_PAYMENT,
  type WalletRole,
} from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type SigningMode = "demo" | "hashpack";
type BusyAction = { scheduleId: string; kind: "sign" | "cancel" } | null;

const WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Every control on one page: the original desk, for exploring past the tour and for signing with HashPack. */
export const Sandbox = () => {
  const { market, setMarket, auditEntries, auditTopicId, configLoaded, operatorConfigured } = useMarket();

  const [signingMode, setSigningMode] = useState<SigningMode>("demo");
  const [walletRole, setWalletRole] = useState<WalletRole>("seller");

  const [busyPropose, setBusyPropose] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyOnboard, setBusyOnboard] = useState(false);
  const [busyWallet, setBusyWallet] = useState(false);

  const wallet = useHederaWallet(WALLET_CONNECT_PROJECT_ID);
  const trades = useMemo(() => market?.trades ?? [], [market]);
  const newestTrade = trades[0] ?? null;

  const handlePropose = useCallback(
    async ({ quantity, price, buyerChoice, settlementMode, settlementDelay }: Terms, seller: "demo" | "wallet") => {
      setBusyPropose(true);
      try {
        const next =
          seller === "wallet"
            ? await dvp.completeWalletSellerPropose(
                await wallet.signAndExecute(
                  await dvp.prepareWalletSellerPropose(quantity, price, buyerChoice, settlementMode, settlementDelay),
                ),
              )
            : await dvp.proposeTrade(quantity, price, buyerChoice, settlementMode, settlementDelay);
        setMarket(next);
        notification.success(
          seller === "wallet"
            ? "Trade proposed. Your wallet signed as Seller."
            : "Trade proposed. The demo Seller signed.",
        );
      } catch (e) {
        notification.error(errorMessage(e));
      } finally {
        setBusyPropose(false);
      }
    },
    [wallet, setMarket],
  );

  const handleSign = useCallback(
    async (trade: TradeSnapshot) => {
      setBusyAction({ scheduleId: trade.scheduleId, kind: "sign" });
      try {
        const next = trade.buyerIsWallet
          ? await dvp.completeWalletBuyerSign(
              trade.scheduleId,
              await wallet.signAndExecute(await dvp.prepareWalletBuyerSign(trade.scheduleId)),
            )
          : await dvp.signTrade(trade.scheduleId);
        setMarket(next);
        const updated = next.trades.find(t => t.scheduleId === trade.scheduleId);
        if (updated?.status === "SETTLED") notification.success("Trade settled: both legs moved together.");
        else if (updated?.status === "REJECTED") notification.warning(`Trade rejected: ${updated.settlementResult}`);
        else if (updated?.status === "SCHEDULED") notification.success("Signed. Scheduled to settle at the set time.");
      } catch (e) {
        notification.error(errorMessage(e));
      } finally {
        setBusyAction(null);
      }
    },
    [wallet, setMarket],
  );

  const handleCancel = useCallback(
    async (trade: TradeSnapshot) => {
      setBusyAction({ scheduleId: trade.scheduleId, kind: "cancel" });
      try {
        const next = trade.sellerIsWallet
          ? await dvp.completeWalletSellerCancel(
              trade.scheduleId,
              await wallet.signAndExecute(await dvp.prepareWalletSellerCancel(trade.scheduleId)),
            )
          : await dvp.cancelTrade(trade.scheduleId);
        setMarket(next);
        notification.success("Trade cancelled.");
      } catch (e) {
        notification.error(errorMessage(e));
      } finally {
        setBusyAction(null);
      }
    },
    [wallet, setMarket],
  );

  const handleOnboard = useCallback(async () => {
    setBusyOnboard(true);
    try {
      // No transaction when the wallet already associated both tokens in its other role.
      const association = await dvp.prepareOnboardWallet(walletRole, wallet.accountId);
      const transactionId = association ? await wallet.signAndExecute(association) : null;
      setMarket(await dvp.completeOnboardWallet(walletRole, wallet.accountId, transactionId));
      notification.success("Wallet onboarded.");
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusyOnboard(false);
    }
  }, [wallet, walletRole, setMarket]);

  const handleConnectToggle = useCallback(async () => {
    setBusyWallet(true);
    try {
      if (wallet.isConnected) await wallet.disconnect();
      else await wallet.connect();
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusyWallet(false);
    }
  }, [wallet]);

  const onboardedForRole =
    walletRole === "seller"
      ? market?.walletSeller?.accountId === wallet.accountId
      : market?.walletBuyer?.accountId === wallet.accountId;

  const walletBlocksAction = signingMode === "hashpack" && !wallet.isConnected;
  const walletSellerReady = market?.walletSeller != null && wallet.accountId === market.walletSeller.accountId;
  const onboardDisabled = busyOnboard || !wallet.isConfigured || !wallet.isConnected || !market || onboardedForRole;

  const canSign = useCallback(
    (trade: TradeSnapshot) => {
      if (trade.status !== "PENDING" || walletBlocksAction) return false;
      if (trade.buyerIsWallet) return wallet.accountId !== "" && wallet.accountId === market?.walletBuyer?.accountId;
      return true;
    },
    [walletBlocksAction, wallet.accountId, market?.walletBuyer?.accountId],
  );

  const canCancel = useCallback(
    (trade: TradeSnapshot) => {
      if ((trade.status !== "PENDING" && trade.status !== "SCHEDULED") || walletBlocksAction) return false;
      if (trade.sellerIsWallet) return wallet.accountId !== "" && wallet.accountId === market?.walletSeller?.accountId;
      return true;
    },
    [walletBlocksAction, wallet.accountId, market?.walletSeller?.accountId],
  );

  const yourTurnTrade = useMemo(
    () => trades.find(t => t.status === "PENDING" && canSign(t)) ?? null,
    [trades, canSign],
  );

  const walletState = useMemo(() => {
    if (!wallet.isConfigured) return "Connect HashPack to continue (set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID first).";
    if (!wallet.isConnected) return "Connect HashPack to continue.";
    if (!market) return "Set up the market, then onboard your wallet.";
    const onboarded = walletRole === "seller" ? market.walletSeller : market.walletBuyer;
    if (onboarded && onboarded.accountId !== wallet.accountId) {
      return `Switch HashPack to ${onboarded.accountId}, the account onboarded as ${walletRole === "seller" ? "Seller" : "Buyer"}, or onboard this one.`;
    }
    if (!onboardedForRole)
      return `Onboard your wallet to take the ${walletRole === "seller" ? "Seller" : "Buyer"} role.`;
    if (walletRole === "seller") {
      const pending = market.trades.find(t => t.sellerIsWallet && (t.status === "PENDING" || t.status === "SCHEDULED"));
      return pending ? "Waiting for the Buyer to sign." : "Propose a trade as Seller.";
    }
    const mine = market.trades.find(t => t.buyerIsWallet);
    if (!mine) return "Waiting for a trade to be proposed.";
    if (mine.status === "PENDING") return "Sign the trade as Buyer.";
    if (mine.status === "SETTLED") return "Trade settled. Propose another trade when ready.";
    if (mine.status === "REJECTED") return `Trade rejected (${mine.settlementResult}); nothing moved.`;
    return "Propose another trade when ready.";
  }, [wallet.isConfigured, wallet.isConnected, wallet.accountId, market, onboardedForRole, walletRole]);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <section>
          <p className="text-base-content/80 m-0 max-w-4xl">
            Delivery-versus-payment (DvP) settles a security-for-stablecoin trade in a single Hedera transaction: a
            scheduled transfer carrying both legs. Either the security and the stablecoin both change hands, or neither
            does — there is no escrow contract, just a native transaction the Seller and the Buyer sign at different
            times.
          </p>
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left column: what the learner does. */}
          <div className="flex flex-col gap-6 min-w-0">
            <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
              <h2 className="font-bold text-lg mb-1">Signing</h2>
              <p className="text-xs text-base-content/70 mb-3">
                Choose whether demo accounts or your HashPack wallet sign.
              </p>
              <label className="block text-sm text-base-content/70 mb-1" htmlFor="signing-mode">
                Sign with
              </label>
              <select
                id="signing-mode"
                className="select select-bordered w-full max-w-xs mb-4"
                value={signingMode}
                onChange={e => setSigningMode(e.target.value as SigningMode)}
              >
                <option value="demo">Demo accounts</option>
                <option value="hashpack">HashPack</option>
              </select>

              {signingMode === "hashpack" && (
                <div className="flex flex-col gap-3 items-start">
                  {!wallet.isConfigured && (
                    <p id="wallet-config-error" className="text-warning text-sm">
                      Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID to enable HashPack.
                    </p>
                  )}

                  <button
                    id="connect-hashpack"
                    className="btn btn-primary btn-sm"
                    disabled={!wallet.isConfigured || busyWallet}
                    onClick={handleConnectToggle}
                  >
                    {busyWallet ? "Working…" : wallet.isConnected ? "Disconnect HashPack" : "Connect HashPack"}
                  </button>

                  {wallet.isConnected && (
                    <p>
                      Connected account:{" "}
                      <HashScanLink htmlId="wallet-account-id" hederaId={wallet.accountId} kind="account" />
                    </p>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-base-content/70" htmlFor="wallet-role">
                      Wallet acts as
                    </label>
                    <select
                      id="wallet-role"
                      className="select select-bordered w-full max-w-xs"
                      value={walletRole}
                      onChange={e => setWalletRole(e.target.value as WalletRole)}
                    >
                      <option value="seller">Seller</option>
                      <option value="buyer">Buyer</option>
                    </select>
                  </div>

                  <button
                    id="onboard-wallet"
                    className="btn btn-secondary btn-sm"
                    disabled={onboardDisabled}
                    onClick={handleOnboard}
                  >
                    {busyOnboard ? "Onboarding…" : "Onboard wallet"}
                  </button>

                  <p id="wallet-state" className="text-sm text-base-content/70">
                    {walletState}
                  </p>
                </div>
              )}
            </section>

            <SetupPanel configLoaded={configLoaded} operatorConfigured={operatorConfigured} onMarket={setMarket} />

            {market && (
              <TradeTicket
                market={market}
                busy={busyPropose}
                onPropose={handlePropose}
                walletSellerReady={walletSellerReady}
              >
                {newestTrade && (
                  <div className="text-sm flex flex-col gap-1">
                    <span>
                      Schedule: <HashScanLink htmlId="schedule-id" hederaId={newestTrade.scheduleId} kind="schedule" />
                    </span>
                    <span>
                      Status: <span id="trade-status">{newestTrade.status}</span>
                    </span>
                    {newestTrade.settlementResult && (
                      <span>
                        Settlement result: <span id="settlement-result">{newestTrade.settlementResult}</span>
                      </span>
                    )}
                    <TradeChanges trade={newestTrade} />
                  </div>
                )}
              </TradeTicket>
            )}
          </div>

          {/* Right column: what the network shows. Scrolls with the page, alongside the left column. */}
          <div className="flex flex-col gap-6 min-w-0">
            {!market && (
              <section className="card border border-dashed border-base-300 p-6 w-full text-sm text-base-content/70">
                <h2 className="font-bold text-lg mb-1 text-base-content">Market, trades and audit log</h2>
                <span>
                  Set up a market to see its token balances here, the trades you propose and their status, and the audit
                  log of every trade event read back from the mirror node.
                </span>
              </section>
            )}
            {market && (
              <section
                id="market"
                className="card bg-base-100 shadow-md border border-base-300 p-6 w-full overflow-x-auto scroll-mt-24"
              >
                <h2 className="font-bold text-lg mb-1">Market</h2>
                <p className="text-xs text-base-content/70 mb-3">
                  Live token ids and balances, read from the mirror node.
                </p>
                <div className="flex flex-wrap gap-6 mb-4 text-sm">
                  <span>
                    Security token:{" "}
                    <HashScanLink htmlId="security-token-id" hederaId={market.securityTokenId} kind="token" />
                  </span>
                  <span>
                    Stablecoin: <HashScanLink htmlId="payment-token-id" hederaId={market.paymentTokenId} kind="token" />
                  </span>
                </div>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th>Account</th>
                      <th>Security</th>
                      <th>Stablecoin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Seller</td>
                      <td>
                        <HashScanLink htmlId="seller-account-id" hederaId={market.seller.accountId} kind="account" />
                      </td>
                      <td id="balance-seller-security">{market.seller.balances.security}</td>
                      <td id="balance-seller-payment">{market.seller.balances.payment}</td>
                    </tr>
                    <tr>
                      <td>Buyer</td>
                      <td>
                        <HashScanLink htmlId="buyer-account-id" hederaId={market.buyer.accountId} kind="account" />
                      </td>
                      <td id="balance-buyer-security">{market.buyer.balances.security}</td>
                      <td id="balance-buyer-payment">{market.buyer.balances.payment}</td>
                    </tr>
                    <tr>
                      <td>Unverified buyer</td>
                      <td>
                        <HashScanLink
                          htmlId="unverified-buyer-account-id"
                          hederaId={market.unverifiedBuyer.accountId}
                          kind="account"
                        />
                      </td>
                      <td id="balance-unverified-buyer-security">{market.unverifiedBuyer.balances.security}</td>
                      <td id="balance-unverified-buyer-payment">{market.unverifiedBuyer.balances.payment}</td>
                    </tr>
                    {market.walletSeller && (
                      <tr>
                        <td>Wallet (Seller)</td>
                        <td>
                          <HashScanLink hederaId={market.walletSeller.accountId} kind="account" />
                        </td>
                        <td>{market.walletSeller.balances.security}</td>
                        <td>{market.walletSeller.balances.payment}</td>
                      </tr>
                    )}
                    {market.walletBuyer && (
                      <tr>
                        <td>Wallet (Buyer)</td>
                        <td>
                          <HashScanLink hederaId={market.walletBuyer.accountId} kind="account" />
                        </td>
                        <td>{market.walletBuyer.balances.security}</td>
                        <td>{market.walletBuyer.balances.payment}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <span id="starting-position" className="text-xs text-base-content/60 mt-3">
                  Seller starts with {SELLER_INITIAL_SECURITY} security. Buyer starts with{" "}
                  {BUYER_INITIAL_PAYMENT.toLocaleString()} stablecoin. Unverified buyer starts with{" "}
                  {UNVERIFIED_BUYER_INITIAL_PAYMENT.toLocaleString()} stablecoin. A trade moves tokens between parties;
                  it never creates any.
                </span>
              </section>
            )}

            {market && (
              <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
                <h2 className="font-bold text-lg mb-1">Trades</h2>
                <p className="text-xs text-base-content/70 mb-3">Every trade of this market, newest first.</p>
                <TradesList
                  trades={trades}
                  yourTurnScheduleId={yourTurnTrade?.scheduleId ?? null}
                  busyScheduleId={busyAction?.scheduleId ?? null}
                  canSign={canSign}
                  canCancel={canCancel}
                  onSign={handleSign}
                  onCancel={handleCancel}
                />
              </section>
            )}

            {market && (
              <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
                <h2 className="font-bold text-lg mb-1">Audit log</h2>
                <AuditLog entries={auditEntries} topicId={auditTopicId} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
