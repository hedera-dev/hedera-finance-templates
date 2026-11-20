# Regulated token (EVM)

Replace the home page at `/` with a transfer agent's desk for a regulated
token — the same desk as the `regulated-token` template, driven by **contracts
instead of keys**. The token is a security deployed through Hedera's Asset
Tokenization Studio (ATS), and its compliance rules are **roles on the token
itself**, enforced by the contract: a holder without KYC cannot receive it, a
frozen holder cannot move it, and the issuer can redeem a holding away or pause
the whole token. Every one of those admin actions needs **two officers**,
because the roles belong to a 2-of-3 board contract and no officer holds one.

This is the EVM counterpart of a native template, and the pair is the point:
the native one proves Hedera enforces these controls with keys and no
contracts; this one shows the same controls where an Ethereum developer expects
to find them, on a deployed security token.

Three parties:

- **Compliance officers** — three addresses. Officers 1 and 2 are demo keys the
  server holds; the third is the connected wallet when one is connected at
  setup, and another demo key otherwise. Any two of the three can carry an
  action.
- **Holders** — two demo accounts the app creates: one granted KYC, one left
  without it.
- **The court** — the instruction that arrives. The learner plays it: choosing
  an order is what starts the two-officer flow.

## What a user sees

**Two views.** The title and a one-sentence explanation span the top, beside a
`Hedera testnet` badge and a Tour / Sandbox toggle (`#view-tour`,
`#view-sandbox`). `/` is the tour; `/?view=sandbox` is every control on one
page. Both read the same desk.

**The tour** walks the desk one step at a time. `#tour-progress` shows five
steps — `Set up`, `Propose`, `Approve`, `Break it`, `More orders` — with
finished ones ticked and the current one highlighted. The step follows the
desk, not the tab: before setup it is `Set up`; until an order has been
approved it is `Propose`, or `Approve` while one is pending; after that the
reader moves freely between `Break it` and `More orders` from the stepper. Each
step fits a 1440×900 window, with the step's action in a highlighted card and
the exact contract calls in a collapsed "Under the hood" section.

Once the desk exists, `#token-strip` stays above every step: the symbol, the
token's contract id linked to HashScan, whether the four compliance roles are
held by the board and nobody else, `#strip-status` (`ACTIVE` or `PAUSED`),
`#strip-supply`, how many orders wait for a second approval, and a badge per
holder with its balance, KYC and frozen state.

1. **Set up** — the setup checklist below, with a note that a wallet must be
   connected *before* setup to become Officer 3, and what setup costs.
2. **Propose** — the court order is fixed to freezing Holder A. A case
   reference (`#tour-reference`, default `CASE-2026-114`) and `#propose-freeze`,
   labelled `Propose as Officer 1`. Beside it, "Who has approved?" shows the
   three officers and how many have approved, read from the board.
3. **Approve** — the pending order, its proposal id and the transaction that
   created it linked to HashScan, its case reference and expiry, and
   `#approve-order`, labelled `Approve as Officer 2`; `#approve-as-wallet` too
   when the wallet is Officer 3. The result is announced above the next step
   with a HashScan link.
4. **Break it** — four attacks, each a real transaction, in its own card with
   what it tries, the call it makes and its result: `#send-no-kyc` sends 10 to
   Holder B (`#send-no-kyc-result`); `#send-frozen` sends 10 to the frozen
   Holder A (`#send-frozen-result`); `#one-officer` has Officer 1 call
   `setAddressFrozen` on the token directly (`#one-officer-result`);
   `#one-officer-board` has Officer 1 approve an order Officer 1 proposed, to
   reach two approvals alone (`#one-officer-board-result`). A refusal
   shows in red with the error the token returned and a link to the
   transaction; an acceptance shows in amber; an attack that cannot run yet
   (Holder A not frozen, or no order waiting) says so in neutral colours and
   does not count. A count says how many were tried and refused, and
   `#next-orders` moves on.
5. **More orders** — the court order form and pending approvals below, the
   holders with their `Send 10` buttons, and the history, collapsed.

**The sandbox** keeps the original layout: on a window at least 1024px wide,
two columns scroll together with the page: what the learner *does* on the left
(setup, the holders, the court order), what the **chain shows** on the right
(the token, its roles, pending approvals, history). Before setup the right
column holds a placeholder card saying what will appear there. Narrower windows
stack the columns, controls first. Every card has a title and a one-sentence
caption. Form labels sit above their inputs.

**Setup.** A control `#setup-desk`, labelled `Set up desk`, with its progress as
a one-line-per-step checklist, each step an element carrying its state in
`data-status` (`pending`, `active`, `done`, `failed`):

- `#setup-step-officers` — create the officer keys and deploy the 2-of-3
  `OfficerBoard`
- `#setup-step-token` — deploy the security through the ATS factory, with the
  board as the only holder of its KYC, freeze, controller and pause roles
- `#setup-step-holders` — create and fund two demo holders
- `#setup-step-distribute` — admit the issuer and Holder A (control list and
  KYC, each KYC grant carried by the board), issue the supply and transfer
  `100` to Holder A

A spinner marks the running step, a check and the addresses it produced mark
finished ones, a cross marks a failure. No step is left `active` once the run
has ended. When the app has no operator configured, `#setup-desk` is disabled
and `#config-error` names the variables to set: `HEDERA_OPERATOR_ID` and
`HEDERA_OPERATOR_KEY`.

**The token.** Once set up:

- `#token-id` — the token's contract id (`0.0.<num>`), linked to HashScan, and
  `#token-symbol`; `#token-address` carries its EVM address
- `#token-status` — `ACTIVE` or `PAUSED`, read from the token's `paused()`
- `#token-supply` — `totalSupply()`, read from the token
- `#token-roles` — one row per compliance role with the class `token-role`: the
  role's name (`KYC`, `Freeze`, `Controller`, `Pause`), the words `2-of-3
  board`, and the board's address — established by reading `hasRole` for the
  board **and** for each officer on that role, so the claim that no officer
  holds it is read from the chain rather than assumed
- `#board-id` — the board's contract id, linked to HashScan, and its three
  officers, each labelled and linked

**The holders.** `#holders` lists each holder as a row with the class
`holder-row` carrying `data-account`: its label (`Holder A`, `Holder B`), its
account id and EVM address linked to HashScan, whether KYC is granted, whether
it is frozen, and its balance — each read from the token. Each row has
`Send 10` (class `holder-send`), which transfers 10 units to that holder from
the issuer and shows what the token answered.

**The court order.** `#order-panel` holds:

- `#order-action` — which order to carry out: `Freeze holder`, `Unfreeze
  holder`, `Redeem holding`, `Revoke KYC`, `Pause token`, `Unpause token`
- `#order-holder` — which holder it applies to, where the action needs one
- `#order-reference` — a free-text case reference, default `CASE-2026-114`
- `#propose-order`, labelled `Propose as Officer 1` — proposes the order and
  nothing more

**Pending approvals.** `#pending-approvals` lists every proposal the board has
not executed, as rows with the class `approval-row` carrying `data-proposal`:
the proposal id, what it will do, the case reference, how many of the three
officers have approved, and when it expires. Each row has `Approve as Officer 2`
(class `approval-approve`) and `Cancel` (class `approval-cancel`). A proposal
that has executed leaves the list.

**History.** `#history` lists what the desk has done, newest first, as rows with
the class `history-entry`: time, the action, the case reference where there was
one, the result (`SUCCESS` or the error the contract returned, e.g.
`KycIsNotGranted`), and the transaction hash linked to HashScan.

**The wallet officer.** The header keeps the scaffold's RainbowKit connect
button. `#wallet-state` says in a sentence what the connected account is to this
desk: not connected, connected but not an officer (it was connected after
setup), or Officer 3. When it is Officer 3, `#approve-as-wallet` appears on each
pending row and the wallet signs the approval itself — one ordinary transaction
to the board, which it is prompted for and pays for.

## Behaviour

**The rules are the token's own code.** Setup deploys a security through the ATS
factory with internal KYC on, a whitelist control list, and the four compliance
roles granted to the board address alone. Nothing in this app decides whether a
transfer is allowed: the token reverts.

**No officer can act alone, by construction.** `ROLE_KYC`,
`ROLE_FREEZE_MANAGER`, `ROLE_CONTROLLER` and `ROLE_PAUSER` are granted at
deployment to the board contract and to no other address. An officer calling the
token directly is refused by the token's own access control; the only route to a
compliance action is a proposal two officers approve.

**A holder without KYC cannot receive.** `Send 10` to Holder B before KYC is
granted reverts, Holder B's balance stays `0`, and the refusal appears in
`#history` and as a readable message on the page, carrying the error name the
token returned.

**One officer is not enough.** `Propose as Officer 1` records the call on the
board with one approval. The order does not take effect: the holder is not
frozen, the token is not paused, and the board reports the proposal as pending
with one of three approvals in.

**The second officer's approval carries it out.** `Approve as Officer 2` is the
second approval, and the board makes the call in that same transaction: the
holder's frozen state flips, the holding is redeemed, or the token pauses. The
row leaves `#pending-approvals` and the action lands in `#history` with the hash
of the transaction that did it, naming the officer who approved.

**An order that the token refuses is recorded, not retried.** When the board's
call would revert — the token is already unpaused, say — the desk names the
token's own error (`IsUnpaused`) beside the control that was pressed and in
`#history`, and the officer is not charged for a transaction that cannot
succeed. Nothing changes on the token, and the proposal stays pending with its
one approval, to be approved again once the obstacle is gone, or cancelled. An
approval that the board itself refuses — the proposer approving their own order
— is sent, so that refusal is on the ledger.

**A frozen holder cannot move the token.** After a freeze executes, `Send 10` to
that holder reverts. After an unfreeze — which also takes two officers — the
same send succeeds. ATS carries an address freeze on the control list: on a
whitelisted token `setAddressFrozen(holder, true)` takes the holder off the
list, so a holder is frozen exactly when the token's `isInControlList` answers
false for it. (`isFrozen` reports the separate partial freeze of a balance,
which this desk does not use.)

**A redemption removes a holding.** Redeeming Holder A's balance through the
controller role sets it to `0` and lowers `#token-supply` by the amount
redeemed, both read from the token.

**A pause stops everything.** While the token is paused, `#token-status` reads
`PAUSED` and any transfer reverts, including to a holder with KYC and no freeze.
Unpausing restores it.

**An order can be withdrawn.** `Cancel` removes a pending proposal, and only
the officer who proposed it can. The order never happened, and the history says
it was withdrawn.

**A pending order expires.** Each proposal carries an expiry a few minutes out.
A proposal nobody approves before then can no longer be approved, leaves
`#pending-approvals`, and the history says it expired rather than executed.

**Everything shown is read from the chain.** KYC state, frozen state, balances,
the total supply, the paused flag, who holds which role and every proposal's
approval count are read from the token and the board, and refresh after each
action without a page reload.

**A value that could not be read is shown as unknown, never as a number.** When
a read fails, a holder's KYC and frozen state show `Unknown` and its balance
`unavailable`; the supply shows `unavailable`. Never `Not granted`, never
`Frozen`, never `0`: those are claims about the chain that a failed read has not
made. The same holds for the two answers that are easy to guess at: a proposal
whose board state could not be read keeps its place in the list but says its
approval count is unknown rather than one, and a connected wallet whose role
could not be checked is told exactly that, rather than that it is not an
officer.

**A relay failure is not a refusal.** The public JSON-RPC relay has bad minutes,
and its 503s arrive looking like 400s. A read or a simulation that fails for
that reason is retried and, if it keeps failing, reported as the relay being
unreachable — never as the token having refused something.

**Private keys never reach the browser.** No response the server sends contains
the operator key or an officer's or holder's key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null`, or an empty value while visible; a control that is working shows
it and cannot be pressed twice.

## How this will be checked

1. Open `/?view=sandbox` at 1024px or wider. Confirm the title on top, the two
   columns below, and `#setup-desk` visible without scrolling.
2. Press `#setup-desk`. Watch the four steps reach `done`. Confirm `#token-id`
   exists on the mirror node as a contract, and that `#token-roles` shows four
   rows naming the board — and that for each of those four roles the token's
   `hasRole` answers true for the board and false for all three officers.
3. Confirm `#holders` shows Holder A with KYC granted and balance `100`, and
   Holder B without KYC and balance `0`.
4. Press `Send 10` on Holder B. Confirm the refusal on the page and in
   `#history` with the error name the token returned, a HashScan link to a
   transaction the mirror node reports as failed, and that Holder B's balance is
   still `0`.
5. Choose `Freeze holder` for Holder A with the default reference and press
   `#propose-order`. Confirm a row appears in `#pending-approvals` whose
   proposal the board reports as pending with one approval, and that Holder A is
   **not** frozen on the token.
6. Press `Approve as Officer 2` on that row. Confirm the row leaves
   `#pending-approvals`, the token's `isInControlList` for Holder A is false, and
   `#history` has the action with the case reference and the transaction hash.
7. Press `Send 10` on Holder A. Confirm it is refused and the balance does not
   move.
8. Propose and approve `Unfreeze holder` for Holder A, then `Send 10` again and
   confirm it succeeds and the balance rises by 10.
9. Propose and approve `Redeem holding` for Holder A. Confirm its balance is `0`
   and `#token-supply` fell by what was redeemed.
10. Propose and approve `Pause token`. Confirm `#token-status` reads `PAUSED`
    and a send is refused.
11. Propose any order and press `Cancel`. Confirm the row leaves the list, the
    history says it was withdrawn, and nothing about the token changed.
12. Inspect the responses the page received during all of the above for any
    private key.
13. On a fresh desk, open `/` and walk the tour: `#propose-freeze`, then
    `#approve-order`. Confirm Holder A reads frozen in `#token-strip`. Run the
    three attacks and confirm each result reads refused, with the error the
    contract returned and a HashScan link to a transaction the mirror node
    reports as failed, and that Holder A is still frozen.
14. `yarn foundry:test` passes, and its cases include: two officers execute, one
    officer cannot, the same officer cannot approve twice, a non-officer cannot
    propose or approve, only the proposer can cancel, an expired proposal cannot
    be approved, and a reverting target reverts the approval.

Connecting a wallet and signing with it is **not** checked: the checker has no
wallet. It is still part of the feature and must be implemented as described.

## Constraints

- **Hedera testnet, through the JSON-RPC relay and viem.** Reads and writes go
  through the relay (`https://testnet.hashio.io/api` by default, overridable
  with `HEDERA_RPC_URL`); contract ids and EVM addresses are reconciled through
  the public mirror node. The operator is an **ECDSA** account — an ED25519 key
  has no EVM address and must be refused with a clear message.
- **The token is deployed by the ATS factory already on testnet, not by this
  app.** Factory `0.0.9213391`, business-logic resolver `0.0.9212226`, the equity
  configuration `0x..01` at the version the resolver reports. Verified against
  that deployment: the equity configuration resolves `grantKyc`, `revokeKyc`,
  `setAddressFrozen`, `freezePartialTokens`, `pause`,
  `controllerRedeemByPartition` and the access-control reads this desk needs,
  and `deployEquity` simulates to a predicted address. Read the latest version
  from the resolver rather than hardcoding it, and refuse to deploy on version
  zero.
- **ATS interface shapes come from the `v.8.0.0-ats` tag, never from the
  repository's `main`.** `main` has drifted from the deployed factory: it
  renamed `resolverProxyConfiguration` and added a field to the equity details.
  Hand-written ABI fragments only — the published package ships no factory ABI —
  and every struct cross-checked against what the deployed factory accepts.
- **The only contract this app deploys is the board.** `OfficerBoard` is a
  2-of-3 approval gate and nothing else: no timelock, no upgradeability, no role
  library. It holds the token's compliance roles, exposes `propose(target,
  data)`, `approve(id)` and `cancel(id)`, executes on the second distinct
  officer's approval, and bubbles the target's revert reason so the token's own
  error is what the page shows. It is deployed from its Foundry artifact at
  setup, so `yarn foundry:compile` must run before the Next build.
- **The board's generality is deliberate and bounded.** It forwards an arbitrary
  call to an arbitrary target, which is what makes one contract cover freeze,
  unfreeze, redeem, revoke and pause. The desk only ever proposes calls to the
  token it deployed, and a route must refuse a target this desk did not create.
- **Two officers is a contract rule here, not a key rule.** The native template
  gets the same control from a 2-of-3 threshold key the network checks; this one
  gets it from a contract that counts approvals. Say which is which on the page:
  a reader comparing the two templates should come away knowing Hedera offers
  both, and that the contract route is the one that ports from Ethereum.
- **The separation of duties is organisational, not cryptographic.** The board
  really does require two distinct officer addresses. But this desk holds
  Officers 1 and 2, so it can produce two approvals whenever it likes. What the
  template demonstrates is the control the contract enforces; keeping the keys
  with different people is what makes it a control in production. Say so on the
  page rather than implying the server is restrained by it.
- **An EVM wallet is a first-class officer here**, unlike in the native
  template: approving is an ordinary transaction to the board, so a MetaMask
  user signs it with no Hedera-native signing path and no HRC-755 call. The
  wallet is Officer 3 only when it is connected **before** setup, because the
  board's officers are fixed at deployment. With no wallet connected, a third
  demo officer key is created instead, and `#wallet-state` says a wallet
  connected now can watch but not approve.
- **Gas limits are deliberate, not padded.** Hedera charges the greater of gas
  used and 80% of the limit, so each call carries a limit close to its measured
  need, and a reverting call — every attack — carries a fixed limit because it
  cannot be estimated.
- Keep the demo cheap: the operator pays every fee, demo accounts are funded
  with at most `1` HBAR each, and a pending order expires a few minutes out.
  Setup's real cost is measured during the build and stated in the README and on
  the setup card.
- Desk state — the token and board addresses, the officer and holder keys, the
  case references — lives in server memory. It does not need to survive a
  restart. Nothing the page shows about the chain may be read from it: the token
  and the board are the source for state, and memory only for what the chain
  does not record, like a case reference.
- Every route is unauthenticated, and a route that acts on a holder or a
  proposal must refuse anything this desk did not create. That is the bargain of
  a localhost tutorial, and the reason this app is not meant to be reachable by
  anyone else.

## Out of scope

- A real identity or KYC provider. KYC here is the token's KYC role being used;
  who deserves it is somebody else's system. ATS's `identityRegistry` and
  `compliance` hooks are left unset.
- ATS's external control lists, external pause contracts and external KYC lists.
  The token consults them on every transfer and they are a good story — a shared
  sanctions list across several tokens — but they duplicate the freeze this
  template already shows, and belong in their own template.
- Transfers between holders by wallet signature. Holders are demo accounts the
  issuer moves tokens to; the wallet's role in this template is the third
  officer, not a holder.
- Clearing and holds. This token leaves `clearingActive` off; two-leg settlement
  is the DvP template's subject.
- Publishing the orders to HCS. The audit-trail template is where a tamper-
  evident log belongs.
