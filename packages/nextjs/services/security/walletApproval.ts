import { approveOrder } from "~~/services/security/actions";
import { getOfficer, getPending, setWalletApprovalStarted } from "~~/services/security/deskState";
import { SIGN_SCHEDULE_SELECTOR, scheduleEvmAddress } from "~~/services/security/hrc755";

/**
 * Lets the connected wallet, when it is Officer 3, put its own key on a pending order instead of
 * the desk leaning on a server-held one for everything.
 *
 * It cannot do that by signing the admin transaction. Hedera validates an ECDSA signature as
 * secp256k1 over `keccak256(bodyBytes)`, raw and unframed, and every signing method an EVM wallet
 * exposes frames what it signs: `eth_sign` and `personal_sign` with the EIP-191 prefix,
 * `eth_signTypedData` with its own. `eth_sign` — which this flow used to ask for — is also removed
 * from MetaMask outright, and over WalletConnect an unrecognised method is simply never answered,
 * so the button sat spinning with no prompt in the wallet and nothing to cancel. An EVM wallet can
 * only ever sign an Ethereum transaction.
 *
 * HRC-755 makes an Ethereum transaction enough: `prepare` hands the browser the schedule's own
 * address and the `signSchedule()` selector, the wallet prompts for that transaction like any
 * other, and the network adds Officer 3's key to the record schedule — the mirror node shows its
 * key prefix there and `#pending-approvals` counts it. `submit` then runs the real admin
 * transaction, exactly as "Approve as Officer 2" does.
 *
 * ponytail: so a wallet approval is genuinely the wallet's signature, but on the schedule, while
 * the admin transaction stays Officers 1 + 2. Moving it onto the admin transaction needs a
 * Hedera-native wallet and HIP-820 `hedera_signTransaction` (`@hashgraph/hedera-wallet-connect`,
 * HashPack or Kabila) — a second connector stack beside the scaffold's RainbowKit, and no help at
 * all to a MetaMask user. Worth it if the template's point becomes who signs what.
 */

function requireWalletOfficer() {
  const officer3 = getOfficer("3");
  if (!officer3?.isWallet || !officer3.accountId) throw new Error("The wallet is not Officer 3 for this desk.");
  return officer3;
}

export function prepareWalletApproval(scheduleId: string) {
  if (!getPending(scheduleId)) throw new Error("This desk did not create that order.");
  requireWalletOfficer();

  // Claimed before the wallet is asked, because the wallet's signature is what executes the record
  // schedule: without this, the poll that runs while the wallet prompt is open would see an
  // executed schedule and retire the order as done before the admin transaction had run at all.
  setWalletApprovalStarted(scheduleId, Date.now());

  return { to: scheduleEvmAddress(scheduleId), data: SIGN_SCHEDULE_SELECTOR };
}

export async function submitWalletApproval(scheduleId: string) {
  requireWalletOfficer();
  try {
    return await approveOrder(scheduleId, "2", "the wallet, Officer 3, which signed the schedule itself");
  } finally {
    setWalletApprovalStarted(scheduleId, undefined);
  }
}
