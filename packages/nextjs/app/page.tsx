"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NextPage } from "next";
import { AuditLog } from "~~/app/_components/dvp/AuditLog";
import { HashScanLink } from "~~/app/_components/dvp/HashScanLink";
import { SetupPanel } from "~~/app/_components/dvp/SetupPanel";
import { TradeChanges } from "~~/app/_components/dvp/TradeChanges";
import { TradesList } from "~~/app/_components/dvp/TradesList";
import { useHederaWallet } from "~~/hooks/scaffold-hbar/useHederaWallet";
import * as dvp from "~~/services/hedera/dvpClient";
import {
  type AuditEntrySnapshot,
  BUYER_INITIAL_PAYMENT,
  type BuyerChoice,
  type MarketSnapshot,
  SELLER_INITIAL_SECURITY,
  type SettlementMode,
  type TradeSnapshot,
  UNVERIFIED_BUYER_INITIAL_PAYMENT,
  type WalletRole,
} from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type SigningMode = "demo" | "hashpack";
type BusyAction = { scheduleId: string; kind: "sign" | "cancel" } | null;

const WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";
const POLL_INTERVAL_MS = 4000;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

const Home: NextPage = () => {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntrySnapshot[]>([]);
  const [auditTopicId, setAuditTopicId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [operatorConfigured, setOperatorConfigured] = useState(false);

  const [signingMode, setSigningMode] = useState<SigningMode>("demo");
  const [walletRole, setWalletRole] = useState<WalletRole>("seller");

  const [quantity, setQuantity] = useState(100);
  const [price, setPrice] = useState(10000);
  const [buyerChoice, setBuyerChoice] = useState<BuyerChoice>("buyer");
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("onSignature");
  const [settlementDelay, setSettlementDelay] = useState(2);

  const [busyPropose, setBusyPropose] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyOnboard, setBusyOnboard] = useState(false);
  const [busyWallet, setBusyWallet] = useState(false);

  const wallet = useHederaWallet(WALLET_CONNECT_PROJECT_ID);
  const trades = useMemo(() => market?.trades ?? [], [market]);
  const newestTrade = trades[0] ?? null;

  const refresh = useCallback(() => {
    dvp
      .fetchMarket()
      .then(m => {
        setMarket(m);
        if (m) {
          dvp
            .fetchAuditLog()
            .then(({ entries, topicId }) => {
              setAuditEntries(entries);
              setAuditTopicId(topicId);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    dvp
      .fetchConfig()
      .then(cfg => setOperatorConfigured(cfg.operatorConfigured))
      .finally(() => setConfigLoaded(true));
    refresh();
  }, [refresh]);

  // Every page refreshes the market, the trades list and the audit log on its own every few
  // seconds, so two browsers on the same app see each other's actions without reloading.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const id = setInterval(() => refreshRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (buyerChoice === "wallet" && !market?.walletBuyer) setBuyerChoice("buyer");
  }, [buyerChoice, market?.walletBuyer]);

  const handlePropose = useCallback(
    async (seller: "demo" | "wallet") => {
      setBusyPropose(true);
      try {
        const delay = settlementMode === "atTime" ? settlementDelay : undefined;
        const next =
          seller === "wallet"
            ? await dvp.completeWalletSellerPropose(
                await wallet.signAndExecute(
                  await dvp.prepareWalletSellerPropose(quantity, price, buyerChoice, settlementMode, delay),
                ),
              )
            : await dvp.proposeTrade(quantity, price, buyerChoice, settlementMode, delay);
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
    [quantity, price, buyerChoice, settlementMode, settlementDelay, wallet],
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
    [wallet],
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
    [wallet],
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
  }, [wallet, walletRole]);

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
  const validDelay = Number.isInteger(settlementDelay) && settlementDelay >= 1 && settlementDelay <= 60;
  const delayInvalid = settlementMode === "atTime" && !validDelay;
  const demoProposeDisabled =
    busyPropose || !market || delayInvalid || (buyerChoice === "wallet" && !market.walletBuyer);
  const walletSellerReady = market?.walletSeller != null && wallet.accountId === market.walletSeller.accountId;
  const walletProposeDisabled = demoProposeDisabled || !walletSellerReady;
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
    <div className="flex flex-col grow px-5 py-10 w-full">
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        <section>
          <h1 className="text-3xl font-bold mb-2">DvP settlement desk</h1>
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
              <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
                <h2 className="font-bold text-lg mb-1">Trade ticket</h2>
                <p className="text-xs text-base-content/70 mb-3">
                  Buyer is the demo buyer. My wallet is listed after you onboard a wallet as Buyer.
                </p>
                <div className="flex flex-wrap gap-4 items-end mb-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-base-content/70" htmlFor="trade-quantity">
                      Quantity (security)
                    </label>
                    <input
                      id="trade-quantity"
                      type="number"
                      min={1}
                      className="input input-bordered w-32"
                      value={quantity}
                      onChange={e => setQuantity(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-base-content/70" htmlFor="trade-price">
                      Price (stablecoin)
                    </label>
                    <input
                      id="trade-price"
                      type="number"
                      min={1}
                      className="input input-bordered w-40"
                      value={price}
                      onChange={e => setPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-base-content/70" htmlFor="trade-buyer">
                      Buyer
                    </label>
                    <select
                      id="trade-buyer"
                      className="select select-bordered"
                      value={buyerChoice}
                      onChange={e => setBuyerChoice(e.target.value as BuyerChoice)}
                    >
                      <option value="buyer">Buyer</option>
                      <option value="unverifiedBuyer">Unverified Buyer</option>
                      {market.walletBuyer && <option value="wallet">My wallet ({market.walletBuyer.accountId})</option>}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-base-content/70" htmlFor="settlement-mode">
                      Settlement
                    </label>
                    <select
                      id="settlement-mode"
                      className="select select-bordered"
                      value={settlementMode}
                      onChange={e => setSettlementMode(e.target.value as SettlementMode)}
                    >
                      <option value="onSignature">On the Buyer&apos;s signature</option>
                      <option value="atTime">At a set time</option>
                    </select>
                  </div>
                  {settlementMode === "atTime" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-base-content/70" htmlFor="settlement-delay">
                        Minutes from now
                      </label>
                      <input
                        id="settlement-delay"
                        type="number"
                        min={1}
                        max={60}
                        className="input input-bordered w-24"
                        value={settlementDelay}
                        onChange={e => setSettlementDelay(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>
                {settlementMode === "atTime" && (
                  <p className="text-xs text-base-content/60 mb-4">
                    Stands in for a real settlement date such as T+1, shortened to minutes so it can be watched.
                  </p>
                )}

                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    id="propose-trade"
                    className="btn btn-primary"
                    disabled={demoProposeDisabled}
                    onClick={() => handlePropose("demo")}
                  >
                    {busyPropose ? "Proposing…" : "Propose as demo Seller"}
                  </button>
                  {market.walletSeller && (
                    <button
                      id="propose-trade-wallet"
                      className="btn btn-secondary"
                      disabled={walletProposeDisabled}
                      onClick={() => handlePropose("wallet")}
                    >
                      {busyPropose ? "Proposing…" : `Propose as my wallet (${market.walletSeller.accountId})`}
                    </button>
                  )}
                </div>

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
              </section>
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

export default Home;
