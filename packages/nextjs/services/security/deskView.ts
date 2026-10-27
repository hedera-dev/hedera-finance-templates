import { actionLabel, reconcilePending } from "~~/services/security/actions";
import { getDeskState, getOfficer } from "~~/services/security/deskState";
import { isThresholdKey } from "~~/services/security/keys";
import { getMirrorAccount, getMirrorTokenInfo, getTokenRelationship } from "~~/services/security/mirrorNode";
import { getOperatorConfig } from "~~/services/security/operator";
import type {
  DeskStateView,
  HistoryView,
  HolderView,
  TokenKeyName,
  TokenView,
  WalletState,
} from "~~/services/security/types";

const TOKEN_KEY_NAMES: { name: TokenKeyName; field: "kycKey" | "freezeKey" | "wipeKey" | "pauseKey" | "adminKey" }[] = [
  { name: "KYC", field: "kycKey" },
  { name: "Freeze", field: "freezeKey" },
  { name: "Wipe", field: "wipeKey" },
  { name: "Pause", field: "pauseKey" },
  { name: "Admin", field: "adminKey" },
];

async function buildTokenView(tokenId: string, symbol: string): Promise<TokenView> {
  try {
    const info = await getMirrorTokenInfo(tokenId);
    if (!info) return { tokenId, symbol, status: "unavailable", supply: "unavailable", keys: "unavailable" };
    return {
      tokenId,
      symbol: info.symbol,
      status: info.pauseStatus === "PAUSED" ? "PAUSED" : "ACTIVE",
      supply: info.totalSupply,
      keys: TOKEN_KEY_NAMES.map(({ name, field }) => ({ name, isThreshold: isThresholdKey(info[field], 2, 3) })),
    };
  } catch {
    return { tokenId, symbol, status: "unavailable", supply: "unavailable", keys: "unavailable" };
  }
}

async function buildHolderView(id: "A" | "B", label: string, accountId: string, tokenId: string): Promise<HolderView> {
  try {
    const relationship = await getTokenRelationship(accountId, tokenId);
    if (!relationship) return { id, label, accountId, kyc: "Unknown", frozen: "Unknown", balance: "unavailable" };
    return {
      id,
      label,
      accountId,
      kyc: relationship.kycStatus === "GRANTED" ? "GRANTED" : "NOT_GRANTED",
      frozen: relationship.freezeStatus === "FROZEN" ? "FROZEN" : "NOT_FROZEN",
      balance: relationship.balance,
    };
  } catch {
    return { id, label, accountId, kyc: "Unknown", frozen: "Unknown", balance: "unavailable" };
  }
}

async function buildWalletState(walletEvmAddress?: string): Promise<WalletState> {
  if (!walletEvmAddress) return { kind: "not-connected" };
  const officer3 = getOfficer("3");
  // A desk with no wallet officer can answer this without the mirror node at all.
  if (!officer3?.isWallet || !officer3.accountId) return { kind: "not-officer" };
  try {
    const account = await getMirrorAccount(walletEvmAddress);
    if (!account) return { kind: "not-officer" };
    return account.accountId === officer3.accountId
      ? { kind: "officer3", accountId: account.accountId }
      : { kind: "not-officer" };
  } catch {
    // The desk could not check. Saying "not an officer" would be a claim about this wallet
    // that a failed read has not made, and it hides the approve control from the one account
    // that may be able to use it.
    return { kind: "unknown" };
  }
}

/** Builds the single consolidated view the page polls. Every chain fact here comes fresh from the mirror node. */
export async function buildDeskStateView(walletEvmAddress?: string): Promise<DeskStateView> {
  const operatorResult = await getOperatorConfig();
  if (!operatorResult.ok) {
    return {
      config: { configured: false, missing: operatorResult.missing },
      setupComplete: false,
      token: null,
      holders: [],
      pending: [],
      history: [],
      wallet: { kind: "not-connected" },
    };
  }

  const state = getDeskState();
  const setupComplete = state.officers.length === 3 && state.token !== null && state.holders.length === 2;

  const stillPending = await reconcilePending();

  const [token, holders, wallet] = await Promise.all([
    state.token ? buildTokenView(state.token.tokenId, state.token.symbol) : Promise.resolve(null),
    state.token
      ? Promise.all(state.holders.map(h => buildHolderView(h.id, h.label, h.accountId, state.token!.tokenId)))
      : Promise.resolve([]),
    buildWalletState(walletEvmAddress),
  ]);

  const pending = state.pending
    .map(p => {
      const live = stillPending.get(p.scheduleId);
      if (!live) return null;
      const holder = p.holderId ? state.holders.find(h => h.id === p.holderId) : undefined;
      return {
        scheduleId: p.scheduleId,
        action: p.action,
        actionLabel: actionLabel(p.action, holder?.label ?? null),
        holderLabel: holder?.label ?? null,
        reference: p.reference,
        signatureCount: live.signatureCount,
        expiresAtMs: live.expiresAtMs,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const history: HistoryView[] = state.history.slice(0, 50).map(h => ({
    id: h.id,
    timestampMs: h.timestampMs,
    action: h.action,
    reference: h.reference,
    result: h.result,
    transactionId: h.transactionId,
    linkKind: h.linkKind,
  }));

  return { config: { configured: true, missing: [] }, setupComplete, token, holders, pending, history, wallet };
}
