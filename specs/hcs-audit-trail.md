# HCS audit trail

Replace the home page at `/` with an issuer's compliance desk, and add a
regulator's feed at `/regulator`. Every compliance-relevant action on a security
token — issuance, KYC, transfers, freezes — is logged as an entry on a Hedera
Consensus Service (HCS) topic that only authorised publishers can write to. The
regulator's feed reads the topic straight from the public mirror node and
verifies the trail itself: nothing can be rewritten, reordered or silently
skipped. No smart contracts.

Three parties:

- **Issuer** — the operator account the app runs with. Creates the audit topic
  and a security token, performs token actions on a holder account, and
  publishes an audit entry for each action.
- **Compliance officer** (optional) — a HashPack account the Issuer authorises
  as a publisher. Once authorised, it signs and submits the audit entries
  instead of the Issuer.
- **Regulator** — reads the trail at `/regulator`. Holds no keys and needs no
  account.

## What a user sees

**An explanation.** A short paragraph at the top of `/` says what the audit
trail is, why an HCS topic with a submit key makes it tamper-evident, and that
the regulator's feed needs nothing but the public mirror node.

**Setup.** A control `#setup-audit`, labelled `Set up audit trail`. When the app
has no operator configured, `#setup-audit` is disabled and `#config-error` names
the two environment variables to set: `HEDERA_OPERATOR_ID` and
`HEDERA_OPERATOR_KEY`.

Setup explains itself and shows its progress, exactly like a checklist: four
steps in order, as elements `#setup-step-topic` (create the audit topic),
`#setup-step-token` (create the security token), `#setup-step-holder` (create a
holder account) and `#setup-step-associate` (associate the holder with the
token). Each step is one line — a number, or its state marker, then its label
and any id it created — and carries its state in a `data-status` attribute:
`pending`, `active`, `done` or `failed`. While setup runs each step shows a
spinner, then a check (or a cross on failure), driven by the server reporting
each step as it starts and finishes (for example one JSON line per event), not
a timer. A one-line explanation per step sits in a collapsed "What each step
does" section that starts closed. The title, a one-line summary (who pays, what
it roughly costs, that running it again starts a fresh trail) and the button
share the top of the card, so `#setup-audit` is visible without scrolling. When
setup finishes, the page scrolls the trail into view.

After setup completes, the page shows:

- `#topic-id` — the audit topic id
- `#token-id` — the security token id
- `#holder-account-id` — the holder account the actions apply to
- `#regulator-link` — a link to `/regulator?topic=<topic id>`, labelled
  `Open regulator feed`

Every id links to its page on HashScan testnet.

**Actions.** After setup, a target account field `#action-account`, pre-filled
with the demo holder (and reset to the new holder after a fresh setup), with a
`Use demo holder` shortcut when it holds anything else and a short note that any
testnet account works once it has associated the token. Then one control per
token action, each performing a real Hedera transaction on the target account
and then publishing its audit entry:

- `#action-grant-kyc` — `Grant KYC`
- `#action-freeze` — `Freeze`
- `#action-unfreeze` — `Unfreeze`
- `#action-transfer` — `Transfer`, sending the amount in `#transfer-amount`
  (whole number, default `100`) from the Issuer to the target

An empty target falls back to the demo holder. A target that is not an account
id (`0.0.1234`) is refused with a readable message before anything is signed,
and so is the Issuer itself, which cannot be the target of its own token
actions. An account that has not associated the token is a valid target: the
network refuses the action (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`) and that refusal
is logged like any other result.

Every action can be pressed at any time; an action the network refuses (for
example a transfer before KYC is granted, or while the holder is frozen) is
still logged, with the network's result code. While an action runs its control
shows that it is working and cannot be pressed twice.

**An action that happened is always logged.** The entry cannot be written first:
it carries the action's transaction id and result, and neither exists until the
action has run. So the entry is queued the moment the action returns, and the
queue is what guarantees it lands — a failed submission, a declined signature or
an unreachable mirror node are all retried until the entry is on the topic.
Nothing discards a queued entry. Entries publish oldest-first, one at a time,
and `prev` is read at the moment of publishing, so two entries can never be
built on the same `prev` however many actions are in flight.

**The trail.** `#trail` lists every entry on the topic, newest first, as rows
with the class `trail-entry`. Each row shows the sequence number, the consensus
timestamp as a readable local date and time (the raw timestamp on hover), the
event, the target account, the result, the referenced transaction id (linked to
HashScan, shortened with the full id on hover) and the publishing account. Every
column is visible without horizontal scrolling on a 1100px-wide window.

**A forgery attempt.** `#forge-entry`, labelled `Try to forge an entry`, has an
account that is not an authorised publisher submit an entry to the topic.
`#forge-result` then shows the network's answer, which is
`INVALID_SIGNATURE`, and states that nothing was added to the trail.

**Signing with HashPack.** A signing-mode switch `#signing-mode` offers
`Issuer` (the default) and `HashPack`. In HashPack mode the page shows:

- `#connect-hashpack` — labelled `Connect HashPack`; once connected it offers
  disconnecting instead
- `#wallet-account-id` — the connected account id, linked to HashScan
- `#authorize-publisher` — labelled `Authorise as publisher`
- `#publishers` — the accounts currently allowed to publish to the topic. It
  matches the topic's submit key exactly: authorising a second wallet adds it to
  the key rather than replacing the first, so no account is listed that the
  network would refuse, and none can publish that is not listed
- `#wallet-state` — a sentence saying what to do next: connect, authorise, or
  perform an action

**The regulator feed.** `/regulator` has a topic input `#regulator-topic`,
pre-filled from the `topic` query parameter. Below it:

- `#feed-status` — exactly one of `VERIFIED`, `BROKEN` or `EMPTY`, and when
  `BROKEN`, the first entry that failed and why
- `#feed-count` — the number of entries read
- `#feed` — every entry, oldest first, as rows with the class `feed-entry`, each
  showing the sequence number, the readable consensus time, the event with its
  result beneath it (success and failure coloured differently), the target
  account, the referenced transaction (shortened, full id on hover), the
  publishing account, and one mark per check — sequence, chain, transaction —
  in a single column, each mark explained on hover. Every column is visible
  without horizontal scrolling on a 1100px-wide window.

Form labels across both pages sit above their inputs, consistently.

## Behaviour

**Setup creates a known starting point.** The topic has an admin key and a
submit key, both the Issuer's. The security token has 0 decimals, an initial
supply of `1000` held by the Issuer, and a KYC key and a freeze key held by the
Issuer. The holder account is associated with the token and has no KYC. Setup
publishes the first entry, `issue`, referencing the token-creation transaction.

**Every entry has the same shape.** An entry is one HCS message whose content is
a JSON object with exactly these fields:

- `v` — `1`
- `event` — one of `issue`, `grant_kyc`, `transfer`, `freeze`, `unfreeze`
- `token` — the security token id
- `account` — the target account id, or `null` for `issue`
- `amount` — the whole-token amount for `transfer`, otherwise `null`
- `tx` — the id of the Hedera transaction the entry records, in SDK form
  (`0.0.1234@1700000000.123456789`)
- `result` — that transaction's result code, e.g. `SUCCESS` or
  `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`
- `prev` — the lowercase hex SHA-256 of the exact bytes of the previous entry's
  message, or 64 zeros for the first entry

**The chain never breaks.** Each entry's `prev` is the hash of the entry before
it on the topic. If publishing an entry fails or a HashPack signature is
cancelled, the next entry still chains to the last entry that actually landed on
the topic.

**Actions do what they say.** After `Grant KYC` the mirror node shows the holder
KYC-granted on the token; after a successful `Transfer` the holder's balance
rises by the amount; after `Freeze holder` a transfer is refused with
`ACCOUNT_FROZEN_FOR_TOKEN` and that refusal is itself logged; after
`Unfreeze holder` transfers work again.

**Only authorised publishers can write.** The forgery attempt is rejected by the
network with `INVALID_SIGNATURE`, and the topic's message count does not change.

**The regulator verifies, not trusts.** `/regulator` reads the topic only from
the public mirror node — no server route of this app is involved, and no key or
account. It decodes each message and checks:

- sequence numbers run 1, 2, 3… with no gap
- each entry's `prev` equals the SHA-256 of the previous message's exact bytes
  (64 zeros for sequence 1)
- each entry's `tx` exists on the mirror node with the same result as the
  entry's `result`
- that transaction is the kind the entry's event implies, against the entry's
  own token and account: `issue` a `TOKENCREATION` of that token, `grant_kyc` a
  `TOKENGRANTKYC`, `freeze` a `TOKENFREEZE`, `unfreeze` a `TOKENUNFREEZE`, and a
  successful `transfer` a `CRYPTOTRANSFER` whose legs credit the entry's
  `amount` of that token to that account. Without this an authorised publisher
  could log `freeze` / `SUCCESS` against any successful transaction on the
  network and the feed would still call the trail verified

`#feed-status` is `VERIFIED` when every entry passes every check, `BROKEN` at
the first failure — including a message that is not a valid entry — and
`EMPTY` for a topic with no messages. The feed picks up new entries without a
page reload, within about five seconds of them reaching the mirror node.

**HashPack signs entries as a compliance officer.** In HashPack mode:

- *Authorising* changes the topic's submit key to a key list that accepts
  either the Issuer's key or the wallet's public key (threshold 1), signed with
  the topic's admin key on the server. The wallet's public key is read from the
  mirror node for the connected account. `#publishers` then lists both.
- *Once authorised*, each action is still performed by the Issuer on the server,
  and its audit entry is built on the server — with the correct `prev` — and
  handed to HashPack, which signs and submits the topic message as the payer.
  The trail and the feed show the wallet as the publisher of those entries.
- *A wallet that does not publish the entry does not stop it being published.*
  Declining the signature, a submission the network refuses, or a mirror node
  that never shows the transaction all end the same way: the entry is still
  queued, and the Issuer publishes it instead. The page says so rather than
  reporting only an error.
- *The operator account and the demo holder cannot be authorised*: authorising
  either is refused with a readable message, because the operator already
  publishes and the holder is the account being audited.
- *HashPack mode is safe before a wallet is connected.* With no wallet
  connected, `#authorize-publisher` and the actions in HashPack mode are
  disabled and `#wallet-state` says to connect HashPack. When the WalletConnect
  project id is not configured, `#wallet-config-error` names the variable to
  set, `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`, and Issuer mode keeps working
  unaffected.

**Private keys never reach the browser.** No response the server sends to the
page contains the operator key or any demo account's private key.

**Nothing half-rendered is ever shown.** At no point does any element above
display `undefined`, `NaN`, `null`, or an empty value while visible.

## How this will be checked

1. Open `/`. Read the explanation and confirm `#setup-audit` is visible without
   scrolling and the "What each step does" section is closed.
2. Press `#setup-audit`. Watch the four steps reach `done`. Read `#topic-id`,
   `#token-id` and `#holder-account-id`, and confirm on the mirror node: the
   topic has a submit key; the token has a KYC key and a freeze key; the holder
   is associated with no KYC. Confirm the trail holds one `issue` entry whose
   `tx` is the token creation, with `prev` of 64 zeros.
3. Press `#action-transfer` with the default amount before granting KYC. Confirm
   a new entry with result `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` and that the
   holder's balance did not change.
4. Press `#action-grant-kyc`, then `#action-transfer`. Confirm two entries with
   `SUCCESS`, the holder's KYC on the mirror node, and a balance of `100`.
   Then set `#action-account` to an account that has not associated the token
   and press `#action-grant-kyc`: confirm an entry for that account with
   `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. Set it to the Issuer's account and confirm
   the action is refused before anything is signed. Press `Use demo holder`.
5. Press `#action-freeze`, then `#action-transfer`: confirm the transfer entry
   carries `ACCOUNT_FROZEN_FOR_TOKEN`. Press `#action-unfreeze`.
6. Press `#forge-entry`. Confirm `#forge-result` shows `INVALID_SIGNATURE` and
   that the topic's message count on the mirror node did not change.
7. Follow `#regulator-link`. Confirm `#feed-status` is `VERIFIED`, `#feed-count`
   equals the topic's message count on the mirror node, and every row passes
   all three checks. For two entries, recompute the SHA-256 of the previous
   message's bytes from the mirror node and compare it with `prev`.
8. With `/regulator` open, perform one more action on `/` and confirm the new
   entry appears on `/regulator` without a reload.
9. Inspect the responses `/` received during all of the above for any private
   key.
10. Switch `#signing-mode` to `HashPack` without connecting a wallet. Confirm
    `#connect-hashpack` and `#wallet-state` are present, that
    `#authorize-publisher` and the actions are disabled, and that
    `#wallet-state` says to connect. If no WalletConnect project id is
    configured, confirm `#wallet-config-error` names
    `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Switch back and confirm Issuer-mode
    actions work again.

Completing a HashPack connection or signature is **not** checked: the checker
has no HashPack wallet. It is still part of the feature and must be implemented
as described.

## Constraints

- Hedera native services only, through `@hiero-ledger/sdk`, which the project
  already depends on. No Solidity, no smart contracts.
- The operator comes from the server-side environment variables
  `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`. The key may be a raw ECDSA
  hex key (with or without `0x`) or a DER-encoded ECDSA or ED25519 key.
- Every signature made with the operator key or a demo account's key happens in
  server routes under `packages/nextjs/app/api/`, following the existing
  pattern in `packages/nextjs/app/api/hedera/`. The only signing in the browser
  is HashPack's, through WalletConnect.
- The operator pays every fee except HashPack's own submissions. Demo accounts
  (the holder, and the outsider used for the forgery attempt) are created with
  at most `1` HBAR each: a previous template gave each demo account 15 HBAR and
  repeated setups drained a 660 HBAR operator.
- The server never trusts what the browser sends back after a wallet signs. The
  entry it prepared is bound to the exact transaction id frozen into the
  transaction the wallet was given, and only that id can confirm it. Before the
  chain advances the server checks, from the mirror node: that the transaction
  was a message submit to this topic, paid by the authorised wallet, and
  succeeded, **and** that the bytes now on the topic are the bytes it prepared.
  A successful transaction from that account is not enough on its own — an older
  or different message from the same wallet would otherwise advance the chain to
  a hash of bytes that are not on the topic, breaking every entry after it.
- A submission keeps one transaction id across retries, so a response lost after
  the network accepted it cannot publish the same entry twice: the retry is
  refused as a duplicate, and the server asks the network what happened instead.
- The queue lives in server memory with the rest of the desk, so a restart with
  entries still queued loses them; the chain on the topic stays intact, and
  `/regulator` still verifies what did land.
- Every route is unauthenticated: anyone who can reach the server can spend the
  operator account. That is the bargain of a localhost tutorial, and the reason
  this app is not meant to be exposed.
- `/regulator` fetches the mirror node directly from the browser; it must work
  with this app's server stopped, given a topic id.
- Keeping the trail's state — topic and token ids, demo keys, the last entry's
  hash — in server memory is fine; it does not need to survive a server
  restart. `/regulator` never depends on it.
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
  - after a page reload, rebuild the provider's namespaces from its restored
    session before signing, or signing fails with
    "nativeProvider not initialized";
  - a failed provider start-up must not be cached: the next attempt retries;
  - use the library's exported types; do not cast the provider to a
    hand-written type, which hides exactly these mistakes from the compiler.
- The only new dependencies allowed are those HashPack signing needs:
  `@hashgraph/hedera-wallet-connect` with Reown AppKit (`@reown/appkit` and its
  peers), configured from `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Add the
  variable, empty, to `packages/nextjs/.env.example`. MetaMask and EVM wallets
  are not used.
- The scaffold's RainbowKit connect button and burner wallet are removed from
  the header and the providers: HashPack is the only wallet.
- Testnet only.

## Out of scope

- Encrypted or private entries; the topic is public by design.
- Logging from other templates; this template is the pattern they would follow.
- A gRPC subscription; the feed polls the mirror node REST API.
- Wallets other than HashPack.
- Persisting the desk's state across server restarts.
