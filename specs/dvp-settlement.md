# DvP settlement

Replace the home page at `/` with a delivery-versus-payment (DvP) settlement
desk. A seller sells a security token to a buyer for a stablecoin, and both
legs settle in **one** Hedera transaction: either the security and the
stablecoin both change hands, or neither does. There is no escrow contract —
settlement is a native `TransferTransaction` carrying both legs, wrapped in a
scheduled transaction so the seller and the buyer can sign at different times.

Three parties appear on the page:

- **Issuer** — the operator account the app runs with. Creates the tokens,
  grants KYC, and funds the other two.
- **Seller** — holds the security, proposes the trade, signs first.
- **Buyer** — holds the stablecoin, signs second. There are two buyers: one
  KYC-approved on the security, and one that is not.

By default the Seller and both Buyers are demo accounts the app creates and
signs for on the server, so the whole flow runs from one browser tab with no
wallet. A learner can also connect **HashPack** and take the Seller's or the
Buyer's place with their own testnet account, against a demo counterparty.

## What a user sees

**An explanation.** A short paragraph at the top says what DvP is and that both
legs settle together or not at all.

**Setup.** A control `#setup-market`, labelled `Set up market`. When the app has
no operator configured, `#setup-market` is disabled and `#config-error` names
the two environment variables to set: `HEDERA_OPERATOR_ID` and
`HEDERA_OPERATOR_KEY`.

Setup explains itself and shows its progress. Before it runs, the Setup section
says in a short paragraph what setup does, who pays (the operator), roughly what
it costs, and that running it again starts a fresh market. It lists the seven
steps in order, each with a one-line explanation, as elements
`#setup-step-accounts`, `#setup-step-security`, `#setup-step-stablecoin`,
`#setup-step-associate`, `#setup-step-kyc`, `#setup-step-fund` and
`#setup-step-topic` (create the audit topic). While setup
runs, each step shows its state as it happens — a spinner while running, a check
when done (with the ids it created, where it created any), a cross if it failed —
and carries that state in a `data-status` attribute: `pending`, `active`, `done`
or `failed`. The server reports each step as it starts and finishes (for
example by streaming one JSON line per event), so the list reflects real
progress, not a timer.

The Setup section stays short enough that `#setup-market` is visible without
scrolling: the title, a one-line summary and the button share the top of the
card; each step is one line (a number, or its state marker, then its label and
any ids it created); and the per-step explanations sit in a collapsed
"What each step does" section that starts closed. Step labels line up whatever
the marker. When setup finishes, the page scrolls the market into view. Form
labels across the page sit above their inputs, consistently.

After setup completes, the page shows:

- `#security-token-id` — the security token id, e.g. `0.0.1234`
- `#payment-token-id` — the stablecoin token id
- `#seller-account-id`, `#buyer-account-id`, `#unverified-buyer-account-id`
- a balance for each of the three parties in each token, in elements
  `#balance-seller-security`, `#balance-seller-payment`,
  `#balance-buyer-security`, `#balance-buyer-payment`,
  `#balance-unverified-buyer-security`, `#balance-unverified-buyer-payment`.
  Each holds a plain number in whole token units: digits, an optional decimal
  point, no separators, no symbol.

Every token id and account id links to its page on HashScan testnet. Next to
the balances, `#starting-position` states in words what setup gave each party
(e.g. "Seller starts with 200 security"), so a learner never mistakes what is
left after a trade for newly created tokens.

**Layout.** The title and the explanation span the full width at the top. Below
them, on a window at least 1024px wide, the page has two columns that scroll
together with the page — neither column is pinned. The left column holds what
the learner *does*: Signing, Setup and the trade ticket. The right column holds
what the network *shows*: the market and its balances, the trades list and the
audit log. Before setup, the right column holds a placeholder card saying what
will appear there. On narrower windows the columns stack, controls first. Each
card has a title and a one-sentence caption saying what it is for, so a learner
always knows what they are looking at.

**A trade ticket.** After setup:

- `#trade-quantity` — number of security tokens, defaulting to `100`
- `#trade-price` — total stablecoin to pay, defaulting to `10000`
- `#trade-buyer` — choice between the Buyer and the unverified Buyer
- `#settlement-mode` — `On the Buyer's signature` (the default) or
  `At a set time`
- `#settlement-delay` — shown only for `At a set time`: minutes from now until
  settlement, a whole number from `1` to `60`, defaulting to `2`. A caption
  explains that this stands in for a settlement date such as T+1, shortened so
  it can be watched
- `#propose-trade` — labelled `Propose trade (Seller signs)`

**The trades list.** `#trades` lists every trade of the current market, newest
first, as rows with the class `trade-row`, each carrying `data-schedule-id` and
`data-status`. Each row shows the schedule id (linked to HashScan), the buyer,
the quantity and price, when it settles (`on signature`, or the set time) and
when it expires, its status, the network's result code once known, and what it
changed for each party (e.g. `Seller −100 security, +10000 stablecoin`, or that
nothing moved). Each row has its own controls:

- `Sign as Buyer` (class `trade-sign`) — enabled only while that trade waits
  for the Buyer's signature
- `Cancel` (class `trade-cancel`) — enabled only while that trade has not
  executed, expired or been cancelled

Status is exactly one of:

- `PENDING` — proposed and signed by the Seller, waiting for the Buyer
- `SCHEDULED` — signed by both, waiting for its set time
- `SETTLED` — executed with `SUCCESS`
- `REJECTED` — executed and refused by the network, e.g.
  `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`
- `CANCELLED` — deleted by the Seller before executing
- `EXPIRED` — reached its expiration without every signature

The newest trade is also summarised for quick reading: `#schedule-id`,
`#trade-status`, `#settlement-result` and `#trade-changes` always describe the
most recently proposed trade.

**The audit log.** `#audit-log` lists the market's audit entries read from the
mirror node, newest first, as rows with the class `audit-entry`: sequence
number, readable consensus time, event, schedule id, result, and the referenced
transaction (shortened, linked to HashScan). `#audit-topic-id` shows the audit
topic id, linked to HashScan. A caption says that anyone can read and verify this
log from the public mirror node.

**It's your turn.** Whenever a trade waits for a signature the current browser
can give — the demo Buyer in demo mode, or the connected wallet's role in
HashPack mode — `#your-turn` says so in a sentence naming the trade, next to
that trade's `Sign as Buyer` control.

**Signing with HashPack.** A signing-mode switch `#signing-mode` offers
`Demo accounts` (the default) and `HashPack`. In HashPack mode the page shows:

- `#connect-hashpack` — labelled `Connect HashPack`; once connected it offers
  disconnecting instead
- `#wallet-account-id` — the connected account id, linked to HashScan
- `#wallet-role` — choice between `Seller` and `Buyer`
- `#onboard-wallet` — labelled `Onboard wallet`, which prepares the connected
  account for its role in the current market
- `#wallet-state` — a sentence saying what the learner has to do next: connect,
  onboard, propose, or sign

**One wallet, not two.** The scaffold's RainbowKit connect button and its
burner wallet are removed from the header and from the app's providers: this app
has no EVM signing, and a second "Connect Wallet" next to `Connect HashPack`
suggests the demo parties are browser wallets. The header keeps its navigation.

## Behaviour

**The market starts in a known state.** Right after setup: the Seller holds
`200` security and `0` stablecoin; the Buyer holds `0` security and `20000`
stablecoin; the unverified Buyer holds `0` security and `10000` stablecoin. The
security token has a KYC key and a freeze key. The Seller and the Buyer are
granted KYC on the security; the unverified Buyer is associated with both tokens
but is **not** granted KYC. The stablecoin has 6 decimals and no KYC key; the
security has 0 decimals.

**Nothing moves on one signature.** After `#propose-trade`, `#trade-status` is
`PENDING`, the schedule exists on the network unexecuted, and every balance is
exactly what it was before.

**Both legs settle together.** With the Buyer selected, the trade's `Sign as Buyer` makes the
schedule execute. `#trade-status` becomes `SETTLED`, `#settlement-result` is
`SUCCESS`, and with the default ticket the Seller ends with `100` security and
`10000` stablecoin while the Buyer ends with `100` security and `10000` stablecoin.
On the mirror node, the settlement is a single transaction whose token
transfers include both the security leg and the stablecoin leg.

**A failed leg fails both.** With the unverified Buyer selected, after both
signatures `#trade-status` is `REJECTED`, `#settlement-result` is
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, and **no** balance has changed — the
unverified Buyer still holds all of its stablecoin even though only the
security leg failed the KYC check.

**The desk can trade again — including the same trade.** New trades can be
proposed at any time, while others are pending or scheduled, without setting up
a new market. Proposing a trade **identical** to an earlier one (same buyer,
quantity, price and settlement mode) creates a new schedule with a new
schedule id.
Hedera refuses a schedule whose body matches an existing one
(`IDENTICAL_SCHEDULE_ALREADY_CREATED`), and executed schedules stay on the
network until they expire, so every schedule must be made unique — for example
a per-trade reference in its memo. Setting up a new market creates
new tokens and accounts and resets the page to them.

**Every trade has a deadline.** A trade settling on the Buyer's signature
expires 30 minutes after it is proposed; a trade settling at a set time expires
at that time. Every schedule is created with that expiration time, and with
`waitForExpiry` set for set-time trades. An unsigned trade past its expiration
becomes `EXPIRED` and nothing moves.

**Settling at a set time.** For an `At a set time` trade, the Buyer's signature
does not move anything: the trade becomes `SCHEDULED` and every balance stays
put. At the set time the network executes it by itself — no one presses
anything — and the page shows it `SETTLED` (or `REJECTED`) with the new
balances within about ten seconds of the mirror node recording the execution.
If the Buyer has not signed by the set time, the trade becomes `EXPIRED`.

**The Seller can cancel.** Every schedule's admin key is the proposing Seller's
key, so only the Seller can cancel. `Cancel` deletes the schedule on the
network; the trade becomes `CANCELLED`, it can no longer be signed, and nothing
moves. A trade that has executed or expired cannot be cancelled. In HashPack
mode, a wallet Seller's cancellation is signed by HashPack.

**Two people can trade.** The market lives on the server, so two browsers
opened on the same app see the same market: one HashPack wallet onboarded as
Seller and another, in a different browser, onboarded as Buyer can trade with
each other — the Buyer selected in the ticket is then the wallet Buyer. Every
page refreshes the market, the trades list and the audit log on its own every
few seconds, so each party sees the other's actions — a new proposal, a
signature, a cancellation, a settlement — within about five seconds, without
reloading.

**Every trade is logged.** Setup creates an HCS audit topic whose submit key is
the operator's. The server publishes one entry for each event in a trade's life:
`proposed`, `signed` (the Buyer signed), `settled`, `rejected`, `cancelled` and
`expired`. An entry is a JSON object with exactly the fields `v` (`1`), `event`,
`schedule` (the schedule id), `quantity`, `price`, `seller`, `buyer`, `tx` (the
id of the transaction the event is about, or `null` for `expired`), `result`
(that transaction's result code, or `null`) and `prev` — the lowercase hex
SHA-256 of the exact bytes of the previous entry's message, or 64 zeros for the
first. Events the server learns of by observing the network (a set-time
settlement, an expiry) are logged when it observes them. The chain never breaks:
each entry's `prev` is the hash of the entry before it on the topic.

**HashPack takes one side of the trade.** In HashPack mode the connected
account replaces the demo party of the chosen role:

- *Onboarding* has the wallet sign a token association for both tokens; the
  server then grants the wallet KYC on the security and funds it like the demo
  party it replaces — `200` security as Seller, `20000` stablecoin as Buyer.
  Its balances appear on the page alongside the others. Setup hands the whole
  initial supply of both tokens to the demo parties, so onboarding **mints**
  the wallet's share before transferring it — otherwise the treasury has
  nothing left to fund it with. A wallet may hold both roles: onboarding in the
  second role funds it for that role and does not ask HashPack to associate the
  tokens again (that would fail with `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`).
  Onboarding the same account in the same role again is refused, so tokens
  cannot be minted repeatedly.
- *Demo accounts cannot be onboarded.* Onboarding a demo party's account id is
  refused; otherwise anyone could, for example, grant KYC to the unverified
  Buyer and break the rejection demo. Nothing can be onboarded while a trade is pending or
  scheduled.
- *HashPack must be on the onboarded account.* Wallet transactions are built
  with the onboarded account as payer. If HashPack is switched to another
  account, the wallet's trade controls are disabled and `#wallet-state` names
  the account to switch back to.
- *The operator account cannot be onboarded.* The operator issues both tokens
  and holds their treasury, so funding it would be a transfer to itself that
  moves nothing. Onboarding the operator's account id is refused before
  anything is signed, and `#wallet-state` says to connect a different HashPack
  account.
- *As Seller*, `#propose-trade` builds the same two-leg scheduled transfer
  against the selected demo Buyer and asks HashPack to sign and submit the
  schedule creation. The trade's `Sign as Buyer` then signs as the demo Buyer on the server.
- *As Buyer*, `#propose-trade` has the demo Seller create and sign the schedule
  on the server, and the trade's `Sign as Buyer` asks HashPack to sign it.

Settlement, status, result codes and balances behave exactly as with demo
accounts. Wallet signatures go through WalletConnect to HashPack — the app never
holds the wallet's key.

**HashPack mode is safe before a wallet is connected.** With no wallet
connected, `#onboard-wallet`, `#propose-trade` and the trade's `Sign as Buyer` are disabled
and `#wallet-state` says to connect HashPack. When the WalletConnect project id
is not configured, `#wallet-config-error` names the variable to set,
`NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`, and the demo-account flow keeps
working unaffected. Switching back to `Demo accounts` restores the demo flow.

**Trade terms are validated before anything is signed.** The quantity must be a
whole number of at least 1 (the security has 0 decimals) and the price positive
with at most 6 decimals; anything else is refused with a readable message rather
than silently rounded into a different trade than the one shown.

**Balances are read from the network.** Displayed balances agree with the mirror
node for the same accounts once the mirror node has caught up, and refresh after
each step without a page reload.

**Private keys never reach the browser.** No response the server sends to the
page contains the operator key or any demo account's private key.

**Nothing half-rendered is ever shown.** At no point does any element above
display `undefined`, `NaN`, `null`, or an empty value while visible. While a
step is in progress its control shows that it is working and cannot be pressed
twice.

## How this will be checked

1. Open `/` on a window at least 1024px wide. Confirm the title and explanation
   span the top, and below them the two columns: Signing, Setup and the ticket
   on the left; the placeholder (later the market, trades list and audit log) on
   the right. Scrolling the page moves both columns together. Confirm `#setup-market` is visible without scrolling.
2. Press `#setup-market`. Read every id and balance, then confirm on the mirror
   node: both tokens exist, the security has a KYC key and a freeze key, the
   balances match, the unverified Buyer has no KYC on the security, and the
   audit topic in `#audit-topic-id` has a submit key.
3. With the Buyer selected and the default ticket (`On the Buyer's
   signature`), press `#propose-trade`. Confirm a `PENDING` row in `#trades`,
   the schedule on the mirror node unexecuted with an expiration time, balances
   unchanged, and a `proposed` entry in `#audit-log`.
4. Press that row's `Sign as Buyer`. Confirm `SETTLED` and `SUCCESS`, the new
   balances on the page and on the mirror node, that the executed transaction
   carries both legs, the row's changes (Seller −100 security / +10000
   stablecoin, Buyer +100 security / −10000 stablecoin), and `signed` and
   `settled` entries in the audit log. For two consecutive entries, recompute
   the SHA-256 of the earlier message's bytes from the mirror node and compare it
   with the later entry's `prev`.
5. Select the unverified Buyer, propose `10` security at `1000` stablecoin, and
   sign it. Confirm `REJECTED`, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, no balance
   change, and a `rejected` entry.
6. Select the Buyer, choose `At a set time` with a delay of `1` minute, propose
   `10` security at `1000` stablecoin, and sign it. Confirm `SCHEDULED`, no
   balance change, and on the mirror node a schedule with `wait_for_expiry` true
   and no execution. Without touching the page, wait up to three minutes and
   confirm the row turns `SETTLED`, the balances move by exactly that trade, and
   a `settled` entry appears.
7. Propose the same `10` at `1000` trade (on signature) and press its `Cancel`.
   Confirm `CANCELLED`, the schedule deleted on the mirror node, its
   `Sign as Buyer` disabled, no balance change, and a `cancelled` entry.
8. Propose the same trade again with `At a set time`, `1` minute, and do not
   sign it. Wait up to three minutes and confirm `EXPIRED`, no balance change,
   and an `expired` entry. Confirm the three identical proposals from steps 6–8
   each got a different schedule id.
9. Open a second tab on `/`. In the first tab propose a trade; confirm it
   appears in the second tab's `#trades` as `PENDING` within about five seconds,
   without a reload, and that `#your-turn` names it. Sign it in the second tab
   and confirm the first tab shows it `SETTLED` without a reload.
10. Inspect the responses the page received during all of the above for any
    private key.
11. Switch `#signing-mode` to `HashPack` without connecting a wallet. Confirm
    `#connect-hashpack`, `#wallet-role` and `#wallet-state` are present, that
    the trade and onboarding controls are disabled, and that `#wallet-state`
    says to connect. If no WalletConnect project id is configured, confirm
    `#wallet-config-error` names `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Switch
    back to `Demo accounts` and confirm the demo trade controls are usable
    again.

Completing a HashPack connection or a HashPack signature is **not** checked:
the checker has no HashPack wallet. It is still part of the feature and must be
implemented as described.

## Constraints

- Hedera native services only, through `@hiero-ledger/sdk`, which the project
  already depends on. No Solidity, no smart contracts, no escrow.
- The operator comes from the server-side environment variables
  `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`. The key is an ECDSA private
  key in hex and may carry a `0x` prefix.
- Every signature made with the operator key or a demo account's key happens
  in server routes under `packages/nextjs/app/api/`, following the existing
  pattern in `packages/nextjs/app/api/hedera/`. The only signing in the browser
  is HashPack's, through WalletConnect.
- Keeping the market — token ids, account ids and demo keys — in server memory
  is fine; it does not need to survive a server restart.
- The operator pays every transaction fee, including for transactions the demo
  accounts co-sign. Demo accounts are created with at most `1` HBAR each: a
  previous build gave each one 15 HBAR, so every `Set up market` cost the
  operator about 47 HBAR and repeated setups drained a 660 HBAR account.
- The server never trusts trade terms or roles sent back by the browser after a
  wallet signs: it records the terms it prepared itself, checks that a wallet
  transaction was submitted by the onboarded account, checks the wallet's own
  transaction succeeded, and only lets a wallet sign a trade whose buyer is that
  wallet.
- Waiting for the mirror node after settlement must use the scheduled
  transaction's id with `?scheduled=true`: the SDK prints scheduled ids with a
  bare `?scheduled` suffix, which the mirror node rejects with a 400.
- `HEDERA_OPERATOR_KEY` accepts a raw ECDSA hex key (with or without `0x`) or a
  DER-encoded ECDSA or ED25519 key.
- Every scheduled transaction's expiration time is set explicitly; the
  schedule's admin key is the proposing Seller's key (for a wallet Seller, its
  public key as read from the mirror node).
- The server learns of executions, deletions and expiries by reading the
  schedule from the mirror node (`executed_timestamp`, `deleted`,
  `expiration_time`); a set-time trade settles without any request from the
  page, so nothing may depend on a user pressing a button at the set time.
- Testnet only.
- The only new dependencies allowed are those HashPack signing needs:
  `@hashgraph/hedera-wallet-connect` with Reown AppKit (`@reown/appkit` and its
  peers), configured from `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Wallet
  transactions are built with `@hiero-ledger/sdk` and sent to HashPack with
  `hedera_signAndExecuteTransaction`. Add the variable, empty, to
  `packages/nextjs/.env.example`.
- HashPack wiring, exactly as `@hashgraph/hedera-wallet-connect` expects —
  each point here is a bug a previous build shipped:
  - create the provider with `HederaProvider.init({ projectId, metadata })` and
    pass that instance to `createAppKit` as `universalProvider`, alongside a
    `HederaAdapter` for the Hedera native namespace;
  - sign by calling `hedera_signAndExecuteTransaction` **on that
    `HederaProvider` instance** — not on the object `appKit.getProvider()`
    returns, which has no `hedera_*` methods;
  - its parameter is `{ signerAccountId: "hedera:testnet:<accountId>",
    transactionList: <base64 string> }` — `transactionList` is one base64
    string, not an array named `transaction`;
  - use the library's exported types; do not cast the provider to a
    hand-written type, which hides exactly these mistakes from the compiler.
- MetaMask and EVM wallets are not used for signing: scheduled transactions are
  native Hedera transactions.

## Out of scope

- Wallets other than HashPack.
- Partial fills, order books, and netting several trades into one transfer.
- Real USDC; the stablecoin is a token the app creates.
- A regulator page for the audit log; the HCS audit-trail template covers that.
- Persisting the market across server restarts.
