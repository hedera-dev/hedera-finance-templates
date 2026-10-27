# Permissioned security

Replace the home page at `/` with a transfer agent's desk for a permissioned
security token. The token's compliance rules are **keys on the token itself**,
enforced by the network: a holder without KYC cannot receive it, a frozen
holder cannot move it, and the issuer can wipe a holding or pause the whole
token. Every one of those admin actions needs **two officers**, because each
key is a 2-of-3 threshold key and one signature is not enough. No smart
contracts.

Three parties:

- **Compliance officers** — three key holders. Officers 1 and 2 are demo keys
  the server holds; the third is the connected wallet when one is connected at
  setup, and another demo key otherwise. Any two of the three can carry an
  action.
- **Holders** — two demo accounts the app creates: one granted KYC, one left
  without it.
- **The court** — the instruction that arrives. The learner plays it: choosing
  an order is what starts the two-officer flow.

## What a user sees

**Layout.** The title and a short explanation span the top: what a permissioned
security is, that the rules are keys the network enforces rather than contract
code, and that admin actions take two officers. Below them, on a window at
least 1024px wide, two columns scroll together with the page: what the learner
*does* on the left (setup, the holders, the court order), what the **network
shows** on the right (the token, its keys, pending approvals, history). Before
setup the right column holds a placeholder card saying what will appear there.
Narrower windows stack the columns, controls first. Every card has a title and a
one-sentence caption. Form labels sit above their inputs.

**Setup.** A control `#setup-desk`, labelled `Set up desk`, with its progress as
a one-line-per-step checklist, each step an element carrying its state in
`data-status` (`pending`, `active`, `done`, `failed`):

- `#setup-step-officers` — create the officer keys and the 2-of-3 threshold key
- `#setup-step-token` — create the security token with that key as its KYC,
  freeze, wipe, pause and admin key
- `#setup-step-holders` — create two demo holders and associate them
- `#setup-step-distribute` — grant KYC to Holder A and transfer it `100`

A spinner marks the running step, a check and the ids it produced mark finished
ones, a cross marks a failure. No step is left `active` once the run has ended.
When the app has no operator configured, `#setup-desk` is disabled and
`#config-error` names the variables to set: `HEDERA_OPERATOR_ID` and
`HEDERA_OPERATOR_KEY`.

**The token.** Once set up:

- `#token-id` — the token id, linked to HashScan, and `#token-symbol`
- `#token-status` — `ACTIVE` or `PAUSED`, read from the mirror node
- `#token-supply` — the total supply, read from the mirror node
- `#token-keys` — one row per key with the class `token-key`: the key's name
  (`KYC`, `Freeze`, `Wipe`, `Pause`, `Admin`) and the words `2-of-3 threshold`,
  read from the mirror node's key structure rather than assumed

**The holders.** `#holders` lists each holder as a row with the class
`holder-row` carrying `data-account`: its label (`Holder A`, `Holder B`), its
account id linked to HashScan, whether KYC is granted, whether it is frozen, and
its balance — each read from the mirror node. Each row has `Send 10`
(class `holder-send`), which transfers 10 units to that holder from the issuer
and shows what the network answered.

**The court order.** `#order-panel` holds:

- `#order-action` — which order to carry out: `Freeze holder`, `Unfreeze
  holder`, `Wipe holding`, `Pause token`, `Unpause token`
- `#order-holder` — which holder it applies to, where the action needs one
- `#order-reference` — a free-text case reference, default `CASE-2026-114`
- `#propose-order`, labelled `Propose as Officer 1` — proposes the order and
  nothing more

**Pending approvals.** `#pending-approvals` lists every proposed order that has
not executed, as rows with the class `approval-row` carrying `data-schedule`:
the schedule id linked to HashScan, what it will do, the case reference, how
many of the three officers have signed, and when it expires. Each row has
`Approve as Officer 2` (class `approval-approve`) and `Delete` (class
`approval-delete`). An order that has executed leaves the list.

**History.** `#history` lists what the desk has done, newest first, as rows with
the class `history-entry`: time, the action, the case reference where there was
one, the result (`SUCCESS` or the network's code, e.g.
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), and the transaction id linked to HashScan.

**The wallet officer.** The header keeps the scaffold's RainbowKit connect
button. `#wallet-state` says in a sentence what the connected account is to this
desk: not connected, connected but not an officer (it was connected after
setup), or Officer 3. When it is Officer 3, `#approve-as-wallet` appears on each
pending row and the wallet signs the approval itself — one transaction it is
prompted for and pays for, which puts its own key on that order's schedule.

## Behaviour

**The rules are keys, not code.** Setup creates one 2-of-3 threshold key from
the three officer public keys and gives it to the token as its KYC, freeze,
wipe, pause and admin key. Nothing in this app deploys a contract, and nothing
in this app decides whether a transfer is allowed: the network refuses it.

**A holder without KYC cannot receive.** `Send 10` to Holder B before KYC is
granted is refused by the network with `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`,
Holder B's balance stays `0`, and the refusal appears in `#history` and as a
readable message on the page.

**One officer is not enough.** `Propose as Officer 1` creates a *scheduled*
transaction for the order, signed by Officer 1 alone. The order does not take
effect: the holder is not frozen, the token is not paused, and the mirror node
shows the schedule as not executed. The pending row says one of three
signatures is in, or that the count could not be read.

**The second officer's signature carries it out.** `Approve as Officer 2` signs
the same schedule. The network now has two of the three keys and the order goes
through: the holder's `Frozen` state flips, the holding is wiped, or the token
pauses. The row leaves `#pending-approvals` and the action lands in `#history`
with the id of the admin transaction that did it, naming the officer who
approved — which the schedule itself cannot show, for the reason in the
constraints.

**An order that fails on the way through is recorded, not retried.** If the
admin transaction is refused — the token is already paused, say — the order
leaves `#pending-approvals` and `#history` carries the network's code against
it. It is not held open for another attempt: propose it again.

**A frozen holder cannot move the token.** After a freeze executes, `Send 10` to
that holder is refused with `ACCOUNT_FROZEN_FOR_TOKEN`. After an unfreeze —
which also takes two officers — the same send succeeds.

**A wipe removes a holding.** Wiping Holder A's balance sets it to `0` and
lowers `#token-supply` by the amount wiped, both read from the mirror node.

**A pause stops everything.** While the token is paused, `#token-status` reads
`PAUSED` and any transfer is refused with `TOKEN_IS_PAUSED`, including to a
holder with KYC and no freeze. Unpausing restores it.

**An order can be withdrawn.** `Delete` removes a pending schedule, signed by
the officer who proposed it. The order never happened, and the history says it
was withdrawn.

**A pending order expires.** Each proposal carries an expiry a few minutes out.
An order that nobody approves before then is dropped by the network, leaves
`#pending-approvals`, and the history says it expired rather than executed.

**Everything shown is read from the network.** KYC state, frozen state,
balances, the total supply, the token's status and its key structure all come
from the mirror node, and refresh after each action without a page reload.

**A value that could not be read is shown as unknown, never as a number.** When
a read fails, a holder's KYC and frozen state show `Unknown` and its balance
`unavailable`; the supply shows `unavailable`. Never `Not granted`, never
`Frozen`, never `0`: those are claims about the chain that a failed read has not
made. The same holds for the two answers that are easy to guess at: a pending
order whose schedule could not be read keeps its place in the list but says its
signature count is unknown rather than one, and a connected wallet whose role
could not be checked is told exactly that, rather than that it is not an
officer.

**Private keys never reach the browser.** No response the server sends contains
the operator key or an officer's or holder's key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null`, or an empty value while visible; a control that is working shows
it and cannot be pressed twice.

## How this will be checked

1. Open `/` at 1024px or wider. Confirm the title on top, the two columns below,
   and `#setup-desk` visible without scrolling.
2. Press `#setup-desk`. Watch the four steps reach `done`. Confirm `#token-id`
   exists on the mirror node as a token, and that `#token-keys` shows five rows
   each reading `2-of-3 threshold`, matching the key structure the mirror node
   reports for that token.
3. Confirm `#holders` shows Holder A with KYC granted and balance `100`, and
   Holder B without KYC and balance `0`.
4. Press `Send 10` on Holder B. Confirm the refusal
   `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` on the page and in `#history`, and that
   Holder B's balance is still `0`.
5. Choose `Freeze holder` for Holder A with the default reference and press
   `#propose-order`. Confirm a row appears in `#pending-approvals` with a
   schedule id that exists on the mirror node and is **not executed**, and that
   Holder A is **not** frozen. (The schedule carries the record account's memo
   update, not the freeze — see the constraints.)
6. Press `Approve as Officer 2` on that row. Confirm the row leaves
   `#pending-approvals`, the mirror node shows the schedule executed, Holder A
   reads `Frozen`, and `#history` has the action with the case reference.
7. Press `Send 10` on Holder A. Confirm `ACCOUNT_FROZEN_FOR_TOKEN`.
8. Propose and approve `Unfreeze holder` for Holder A, then `Send 10` again and
   confirm it succeeds and the balance rises by 10.
9. Propose and approve `Wipe holding` for Holder A. Confirm its balance is `0`
   and `#token-supply` fell by what was wiped.
10. Propose and approve `Pause token`. Confirm `#token-status` reads `PAUSED`
    and a send is refused with `TOKEN_IS_PAUSED`.
11. Propose any order and press `Delete`. Confirm the row leaves the list, the
    history says it was withdrawn, and nothing about the token changed.
12. Inspect the responses the page received during all of the above for any
    private key.

Connecting a wallet and signing with it is **not** checked: the checker has no
wallet. It is still part of the feature and must be implemented as described.

## Constraints

- Native HTS only. No Solidity package, no contract deployed by this app, and no
  contract call: the SDK talks to the token service and the schedule service
  directly, and the mirror node answers every read. The one exception is the
  wallet officer's own approval, which has no other route — see below.
- The threshold key is built once, at token creation, with
  `new KeyList([officer1, officer2, officer3], 2)` — a threshold of 2 over three
  public keys — and given to the token as `kycKey`, `freezeKey`, `wipeKey`,
  `pauseKey` and `adminKey`. A token's keys cannot be made threshold keys after
  the fact without the admin key, which is the point: the control is designed
  in, not bolted on.
- The second signature is collected with a **real scheduled transaction** — a
  `ScheduleCreateTransaction` signed by Officer 1, approved with a
  `ScheduleSignTransaction`, with a `0.0.<num>` id the mirror node shows as
  unexecuted until the second signature lands. The pending state on chain is
  what the page is showing, so do not fake it by collecting signatures in the
  app and submitting one combined transaction.

  **It cannot be the admin transaction that is scheduled.** Hedera's
  `scheduling.whitelist` does not include `TokenFreezeAccount`,
  `TokenUnfreezeAccount`, `TokenPause`, `TokenUnpause`, `TokenAccountWipe` or
  `TokenGrantKycToAccount`: scheduling any of them fails immediately with
  `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST` and creates no schedule at all. Every
  order this desk carries is one of those, so none of them can be scheduled
  directly.

  `CryptoUpdateTransaction` **is** whitelisted, and an account's own key gates
  it exactly as a token's admin key gates a freeze. So setup creates one extra
  account — the *record account* — whose key is the same 2-of-3 `KeyList` as the
  token's, and an order is proposed by scheduling an update to that account's
  memo. That schedule is the real, inspectable, two-signature artefact. The
  moment it executes, the server builds the actual admin transaction fresh —
  new transaction id, full validity window — signs it with Officer 1 plus the
  officer who approved, and executes it. The record account's memo carries no
  weight of its own; it exists so the pending state is genuine.
- The admin transaction is always signed by Officers 1 and 2, whoever approved,
  because those are the two keys the desk holds. Say who approved in the history
  line, and where their signature is; do not imply the admin transaction carries
  a key the desk cannot produce.
- **An EVM wallet cannot sign a Hedera transaction body.** Hedera validates an
  ECDSA signature as secp256k1 over `keccak256(bodyBytes)`, raw; every signing
  method an EVM wallet exposes frames what it signs, and `eth_sign` is both
  framed and removed from MetaMask — asked for it over WalletConnect, a wallet
  never answers at all, which is a button that spins forever with no prompt.
  So the wallet officer approves the only way an EVM wallet can: HRC-755's
  parameterless `signSchedule()`, sent as an ordinary transaction to the
  schedule's own long-zero address, which makes the network add the sender's key
  to that schedule. That one call to a system contract is the exception to "no
  contract call" above, and it buys a genuine wallet signature: the mirror node
  shows Officer 3's key prefix on the schedule and `#pending-approvals` counts
  it. Putting the wallet's signature on the admin transaction instead would take
  a Hedera-native wallet and HIP-820 `hedera_signTransaction`, which is a second
  connector stack and no use to a MetaMask user.
- A wallet approval is two calls with the wallet prompt between them, so the
  order must survive that gap: its schedule executes as soon as the wallet's
  signature lands, while the admin transaction has not run yet. A poll that sees
  that executed schedule must not retire the order or write `SUCCESS` to
  history — but an approval abandoned at the prompt must not pin the order open
  for ever either.
- **The separation of duties here is organisational, not cryptographic.** The
  network really does require two of the three keys — the token's keys are a
  2-of-3 `KeyList`, and one signature genuinely will not do. But this desk holds
  Officers 1 and 2, so it can produce two signatures whenever it likes. What the
  template demonstrates is the control the network enforces; keeping the keys
  with different people, or in different custody, is what makes it a control in
  production. Say so on the page rather than implying the server is restrained
  by it.
- The wallet is Officer 3 only when it is connected **before** setup, because
  the key list is fixed at token creation. Its public key is read from the
  mirror node for the connected account. With no wallet connected, a third demo
  officer key is created instead, and `#wallet-state` says a wallet connected
  now can watch but not approve.
- Keep the demo cheap: the operator pays every fee, demo accounts are created
  with at most `1` HBAR each, and a pending order expires a few minutes out so
  nothing is left hanging on the network.
- Desk state — the token id, the officer and holder keys, the case references —
  lives in server memory. It does not need to survive a restart. Nothing the
  page shows about the network may be read from it: the mirror node is the
  source for state, and memory only for what the chain does not record, like a
  case reference.
- Every route is unauthenticated, and a route that acts on a holder or a
  schedule must refuse anything this desk did not create. That is the bargain of
  a localhost tutorial, and the reason this app is not meant to be reachable by
  anyone else.
- Hedera testnet, through `@hiero-ledger/sdk` and the public mirror node
  (`https://testnet.mirrornode.hedera.com`).

## Out of scope

- A real identity or KYC provider. KYC here is the token's KYC key being used;
  who deserves it is somebody else's system.
- Transfers between holders by wallet signature. Holders are demo accounts the
  issuer moves tokens to; the wallet's role in this template is the second
  officer, not a holder.
- Publishing the orders to HCS. The audit-trail template is where a tamper-
  evident log belongs, and a later iteration can point this desk at it.
