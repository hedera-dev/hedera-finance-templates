// Server-only: builds the single consolidated view the page polls. Every fact about the chain
// here is read from the token and the board on every call — desk memory supplies only what the
// chain does not record, like a case reference.
import { tokenAbi } from "./abi";
import { actionLabel, readApprovedBy, readProposal } from "./actions";
import { getOperatorConfig, getPublicClient, retryTransient } from "./clients";
import { BOARD_ROLES } from "./constants";
import { addHistory, getDeskState, getOfficer, removePending } from "./deskState";
import { getAccountIdForEvmAddressOnce } from "./mirror";
import type { Address } from "viem";
import { getAddress } from "viem";
import type {
  BoardView,
  DeskStateView,
  HolderView,
  PendingView,
  TokenRoleRow,
  TokenView,
  WalletState,
} from "~~/services/security/types";

async function buildTokenView(address: Address, contractId: string, symbol: string): Promise<TokenView> {
  const client = getPublicClient();
  // One helper for a dozen reads of the same contract; viem cannot infer a return type from a
  // `functionName` held in a variable, so each call site says what it expects back.
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    retryTransient(() => client.readContract({ address, abi: tokenAbi, functionName, args } as never) as Promise<T>);

  try {
    const board = getDeskState().board?.address;
    const officers = getDeskState().officers.map(o => o.address);
    const [onChainSymbol, paused, supply] = await Promise.all([
      read<string>("symbol"),
      read<boolean>("paused"),
      read<bigint>("totalSupply"),
    ]);

    let roles: TokenRoleRow[] | "unavailable" = "unavailable";
    if (board) {
      roles = await Promise.all(
        BOARD_ROLES.map(async ({ name, role }) => {
          const [heldByBoard, ...heldByOfficers] = await Promise.all([
            read<boolean>("hasRole", [role, board]),
            ...officers.map(officer => read<boolean>("hasRole", [role, officer])),
          ]);
          return { name, heldByBoard, heldByAnyOfficer: heldByOfficers.some(Boolean) };
        }),
      );
    }

    return {
      contractId,
      address,
      symbol: onChainSymbol || symbol,
      status: paused ? "PAUSED" : "ACTIVE",
      supply: supply.toString(),
      roles,
    };
  } catch {
    // A failed read has made no claim about the token: say so rather than guessing a number.
    return { contractId, address, symbol, status: "unavailable", supply: "unavailable", roles: "unavailable" };
  }
}

async function buildHolderView(
  id: "A" | "B",
  label: string,
  address: Address,
  accountId: string | null,
  token: Address,
): Promise<HolderView> {
  const client = getPublicClient();
  try {
    const [balance, listed, kycStatus] = await Promise.all([
      retryTransient(() =>
        client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [address] }),
      ),
      // ATS freezes an address by taking it off the control list, which on this token is a
      // whitelist, so a holder's frozen state is read from the list rather than from `isFrozen` —
      // that one reports the separate partial freeze of a balance.
      retryTransient(() =>
        client.readContract({ address: token, abi: tokenAbi, functionName: "isInControlList", args: [address] }),
      ),
      retryTransient(() =>
        client.readContract({ address: token, abi: tokenAbi, functionName: "getKycStatusFor", args: [address] }),
      ),
    ]);
    return {
      id,
      label,
      accountId,
      address,
      // ATS's KycStatus: 1 is granted.
      kyc: kycStatus === 1 ? "GRANTED" : "NOT_GRANTED",
      frozen: listed ? "NOT_FROZEN" : "FROZEN",
      balance: balance.toString(),
    };
  } catch {
    return { id, label, accountId, address, kyc: "Unknown", frozen: "Unknown", balance: "unavailable" };
  }
}

async function buildBoardView(): Promise<BoardView | null> {
  const state = getDeskState();
  if (!state.board) return null;
  const officers = await Promise.all(
    state.officers.map(async officer => ({
      id: officer.id,
      label: `Officer ${officer.id}${officer.isWallet ? " (wallet)" : ""}`,
      address: officer.address,
      // Looked up again each time, because a lazily-created account takes a moment to index.
      accountId: officer.accountId ?? (await getAccountIdForEvmAddressOnce(officer.address)),
      isWallet: officer.isWallet,
    })),
  );
  return { contractId: state.board.contractId, address: state.board.address, officers, approvalsRequired: 2 };
}

async function buildWalletState(walletEvmAddress?: string): Promise<WalletState> {
  if (!walletEvmAddress) return { kind: "not-connected" };
  const officer3 = getOfficer("3");
  // A desk with no wallet officer can answer this without looking anything up.
  if (!officer3?.isWallet) return { kind: "not-officer" };
  try {
    const connected = getAddress(walletEvmAddress);
    if (connected !== getAddress(officer3.address)) return { kind: "not-officer" };
    return {
      kind: "officer3",
      address: connected,
      accountId: officer3.accountId ?? (await getAccountIdForEvmAddressOnce(connected)),
    };
  } catch {
    // The desk could not check. Saying "not an officer" would be a claim about this wallet that a
    // failed read has not made, and it hides the approve control from the one account that may
    // be able to use it.
    return { kind: "unknown" };
  }
}

/**
 * The pending orders, as the board reports them. A proposal the board says has executed, been
 * withdrawn or run out of time leaves the list; one the board could not be asked about keeps its
 * place but says its approval count is unknown.
 */
async function buildPendingViews(): Promise<PendingView[]> {
  const state = getDeskState();
  const officerAddresses = state.officers.map(o => o.address);
  const views: PendingView[] = [];

  for (const pending of [...state.pending]) {
    const holder = pending.holderId ? state.holders.find(h => h.id === pending.holderId) : undefined;
    const base = {
      proposalId: pending.proposalId,
      action: pending.action,
      actionLabel: actionLabel(pending.action, holder?.label ?? null),
      holderLabel: holder?.label ?? null,
      reference: pending.reference,
      expiresAtMs: pending.expiresAtMs,
      proposeTxHash: pending.proposeTxHash,
    };

    try {
      const proposal = await readProposal(pending.proposalId);
      // Left in desk memory rather than removed: the route that carried the order records it and
      // clears it. Removing it here would pull the entry out from under a wallet approval that
      // the board has executed but the browser has not reported back yet.
      if (proposal.executed || proposal.cancelled) continue;
      if (Date.now() > Number(proposal.expiresAt) * 1000) {
        // The board will refuse an approval from here on, so the order is over. Recorded once,
        // because the pending entry it is read from goes with it.
        addHistory({
          action: `${base.actionLabel} — expired`,
          reference: pending.reference,
          result: "EXPIRED",
          txHash: "",
          kind: "other",
        });
        removePending(pending.proposalId);
        continue;
      }
      const approved = await readApprovedBy(pending.proposalId, officerAddresses);
      views.push({
        ...base,
        approvals: proposal.approvals,
        approvedBy: state.officers.filter((_, i) => approved[i]).map(o => `Officer ${o.id}`),
        expiresAtMs: Number(proposal.expiresAt) * 1000,
      });
    } catch {
      views.push({ ...base, approvals: "unknown", approvedBy: [] });
    }
  }
  return views;
}

export async function buildDeskStateView(walletEvmAddress?: string): Promise<DeskStateView> {
  const operator = getOperatorConfig();
  if (!operator.configured) {
    return {
      config: { configured: false, missing: operator.missing },
      setupComplete: false,
      token: null,
      board: null,
      holders: [],
      pending: [],
      history: [],
      wallet: { kind: "not-connected" },
    };
  }

  const state = getDeskState();
  const [token, board, holders, wallet, pending] = await Promise.all([
    state.token ? buildTokenView(state.token.address, state.token.contractId, state.token.symbol) : null,
    buildBoardView(),
    state.token
      ? Promise.all(
          state.holders.map(h => buildHolderView(h.id, h.label, h.address, h.accountId, state.token!.address)),
        )
      : [],
    buildWalletState(walletEvmAddress),
    state.board ? buildPendingViews() : [],
  ]);

  // The last setup step issues the supply, so a token with none is a desk whose setup did not
  // finish: the tour must stay on Set up rather than offer orders against an empty register.
  const setupComplete =
    state.officers.length === 3 &&
    state.board !== null &&
    state.holders.length === 2 &&
    token !== null &&
    token.supply !== "unavailable" &&
    token.supply !== "0";

  return {
    config: { configured: true, missing: [] },
    setupComplete,
    token,
    board,
    holders,
    pending,
    history: state.history.slice(0, 50),
    wallet,
  };
}
