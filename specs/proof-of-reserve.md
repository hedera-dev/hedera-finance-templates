# Proof of reserve

Replace the home page at `/` with an issuer's reserve desk. The issuer issues a
tokenised asset through Hedera's **Asset Tokenization Studio** (ATS), and the
asset **cannot be issued beyond its collateral**: every issuance passes through
a gate contract that reads the reserve before it mints, and the network refuses
the issuance if the reserve does not cover it.

The reserve is not a number anybody types in. It is the balance of a second ATS
token held in a reserve address, read from the chain, and valued with the
**live Chainlink BTC/USD feed on Hedera testnet**. So coverage moves on its own
as the market moves, and under-collateralisation is something the page can show
happening rather than something a button pretends to stage.

Parties:

- **Issuer** — the operator account the app runs with. Deploys both ATS tokens
  and the gate, holds the admin and control-list roles, funds the reserve, and
  asks the gate to issue.
- **Reserve** — an address holding the collateral token. Its balance *is* the
  reserve.
- **Investors** — one demo investor the app creates, plus the learner's own
  MetaMask account on Hedera testnet.

## What a user sees

**Layout.** The title and a short explanation span the top: what proof of
reserve is, that the gate holds the issuer role so issuance has to pass through
it, and that the collateral balance and its price are both read from the chain.
Below them, on a window at least 1024px wide, two columns scroll together with
the page: what the learner *does* on the left (setup, the issue ticket, the
simulations), what the network *shows* on the right (the reserve, the asset, the
roles, the activity log). Before setup the right column holds a placeholder card
saying what will appear there. Narrower windows stack the columns, controls
first. Every card has a title and a one-sentence caption. Form labels sit above
their inputs.

**Setup.** A control `#setup-desk`, labelled `Set up desk`. When the app has no
operator configured, `#setup-desk` is disabled and `#config-error` names the two
variables to set: `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`.

Setup shows its progress as a one-line-per-step checklist, each step an element
carrying its state in `data-status` (`pending`, `active`, `done`, `failed`):

- `#setup-step-version` — resolve the ATS bond configuration's latest version
- `#setup-step-collateral` — deploy the collateral token through the ATS factory
- `#setup-step-asset` — deploy the asset token through the ATS factory
- `#setup-step-gate` — deploy the reserve feed and the gate
- `#setup-step-roles` — grant the gate the issuer role, and allowlist the
  reserve address and the demo investor
- `#setup-step-reserve` — issue collateral into the reserve address

A spinner marks the running step, a check and the ids it produced mark finished
ones, a cross marks a failure. No step is left `active` once the run has ended:
a failure anywhere marks the running step `failed`, so a spinner never outlives
the run. A one-line explanation per step sits in a collapsed "What each step
does" section that starts closed. The title, a one-line summary (who pays, what
it roughly costs, that running it again starts a fresh desk) and the button
share the top of the card, so `#setup-desk` is visible without scrolling. When
setup finishes the page scrolls the reserve into view.

**The reserve.** After setup:

- `#reserve-account` — the reserve address, linked to HashScan
- `#collateral-address` and `#collateral-contract-id` — the collateral token,
  linked to HashScan
- `#reserve-quantity` — the collateral balance held there, a plain whole number
  of collateral units: digits only, no separators, no symbol
- `#reserve-price` — the BTC/USD price the feed reports, in US dollars
- `#price-updated-at` — when that price was last updated, as a readable local
  time
- `#reserve-value` — the reserve's value in US dollars
- `#price-feed-address` and `#reserve-feed-address`, each linked to HashScan.
  A caption says which one is Chainlink's and which one this app deployed

**The asset.** Also after setup:

- `#asset-address` and `#asset-contract-id`, linked to HashScan
- `#gate-address` — the gate contract that holds the issuer role, linked to
  HashScan
- `#asset-terms` — name, symbol, ISIN, currency, face value per unit and
  maximum supply, **read back from the asset contract**, not echoed from setup
- `#asset-supply` — units issued so far, read from the contract
- `#asset-liability` — what that supply is worth at face value, in US dollars
- `#coverage-ratio` — the reserve's value as a percentage of the liability,
  shown with the digits of a number followed by `%`
- `#headroom` — how many more units the reserve currently covers
- `#reserve-status` — exactly one of `BACKED`, `AT CAPACITY`, `UNDER-RESERVED`
  or `UNKNOWN`

**The roles.** `#roles` lists, as rows with the class `role-row` carrying
`data-role`, every role that can affect issuance — the admin role, the issuer
role, the agent role and the control-list role — each with the name of the role
and who holds it, read from the asset contract with `getRoleMembers`, not from
what setup intended. A row shows the holder's address linked to HashScan, and says
`nobody` where no account holds it. A caption says that the gate holding the
issuer role is what makes the reserve check unavoidable.

**The issue ticket.**

- `#mint-amount` — units to issue, a whole number, defaulting to `1`
- `#mint-holder` — choice between the demo investor and, once a wallet is
  added, the learner's wallet
- `#mint-preview` — the pre-flight reserve check for the amount entered,
  updating as the amount changes: what the reserve covers, what the issuance
  would need, and whether the gate would allow it
- `#mint-submit` — labelled `Issue through the gate`
- `#mint-error` — the reason the last issuance was refused, decoded to its
  error name, cleared when the next issuance starts

**The simulations.** A separate card, captioned as simulations of things that
happen to a real issuer:

- `#withdraw-amount` and `#withdraw-collateral`, labelled
  `Move collateral out of the reserve`, which transfers that many collateral
  units out of the reserve address
- `#direct-issue`, labelled `Try issuing without the gate`, which has the
  operator call the asset's own `issue` directly
- `#direct-issue-result` — what the network answered
- `#bypass-gate`, labelled `Grant the admin the issuer role and issue unbacked`
- `#bypass-result` — what the network answered, and a sentence saying the gate
  binds the issuer role and never the admin role

**Holders.** `#holders` lists each holder as a row with the class `holder-row`
carrying `data-address`: its label, its address linked to HashScan, whether it
is allowlisted, and its asset balance read from the contract.

**The activity log.** `#activity` lists every action the desk performed, newest
first, as rows with the class `activity-entry`: the time, what was done, the
result (`SUCCESS`, or the refusal decoded to its error name) and the
transaction hash linked to HashScan where one was sent.

**The wallet holder.** The header keeps the scaffold's RainbowKit connect
button, offering MetaMask; the burner wallet is removed. Once a wallet is
connected, `#add-wallet-holder`, labelled `Add my wallet as a holder`, adds a
row for its address and allowlists it. `#wallet-state` says in a sentence what
to do next: connect, switch MetaMask to Hedera testnet, add the wallet, or wait
to be issued to.

**Every page refreshes** the reserve, the price, the coverage and the balances
on its own every few seconds, so coverage moves as the feed moves, without a
reload.

## Behaviour

**The gate is the only issuer.** Setup grants the asset's issuer role to the
gate contract and to nothing else, grants the agent role to nobody, and keeps
the admin and control-list roles with the operator. `#roles` shows exactly
that, read from the contract.

**The gate decides twice, on two different questions.** An issuance is refused
unless **both** hold: the caller is on the gate's own list of accounts allowed
to ask, and the reserve covers the asset's supply after the issuance. The
reserve check is not an authorisation check — it caps how much, never who — so
an account that is not on the gate's list is refused however well collateralised
the asset is.

**Issuing within the reserve succeeds.** With `BACKED` status and an amount
inside `#headroom`, `#mint-submit` issues: the holder's balance and
`#asset-supply` rise by that amount, `#coverage-ratio` falls, and the activity
log records a success with the transaction hash.

**Issuing beyond the reserve is refused, and nothing is issued.** With an amount
greater than `#headroom`, the gate refuses before the asset is touched:
`#asset-supply` is unchanged, the holder's balance is unchanged, `#mint-error`
names the refusal, and the activity log records it. `#mint-preview` says the
same thing before the button is pressed.

**Issuing without the gate is refused by ATS.** `#direct-issue` has the
operator call the asset's `issue` directly. The network refuses it because the
operator does not hold the issuer role, `#direct-issue-result` shows the error
name, and `#asset-supply` is unchanged.

**Coverage falls when collateral leaves, for real.** `#withdraw-collateral`
moves collateral out of the reserve address. `#reserve-quantity` and
`#reserve-value` fall by exactly that much, `#coverage-ratio` falls with them,
and when the reserve no longer covers the supply `#reserve-status` becomes
`UNDER-RESERVED` and issuance is refused. Nothing is unwound: the asset already
issued stays issued, which is the position a real issuer is in.

**Coverage also moves on its own.** `#reserve-price` and `#coverage-ratio` are
computed from the live Chainlink feed, so they change as the feed updates,
without anyone touching the page.

**A stale or impossible price is refused, not used.** The gate refuses to issue
when the price feed's answer is zero or negative, or when its last update is
older than the staleness threshold the gate was deployed with. The page says
which of the two it was, and `#reserve-status` is `UNKNOWN` rather than a
number nobody can stand behind.

**A value that could not be read is shown as unknown, never as a number.** When
a read fails, `#reserve-quantity`, `#reserve-value`, `#coverage-ratio` and
`#headroom` say `unavailable` and `#reserve-status` is `UNKNOWN`. Never `0`, and
never `UNDER-RESERVED`: on a reserve desk those are claims about the chain, and
a failed read has made none. `#mint-submit` is refused while the status is
`UNKNOWN`, because the gate cannot be known to allow it.

**The admin role can bypass the gate, and the page shows it.** `#bypass-gate`
has the operator grant itself the issuer role and issue beyond the reserve. It
**succeeds**: supply rises past what the reserve covers and `#reserve-status`
becomes `UNDER-RESERVED`. `#bypass-result` says plainly that the gate binds the
issuer role and cannot bind the admin role above it, and links the
`RoleGranted` event the grant emitted — the point being that unbacked issuance
cannot happen quietly: it leaves an indexed event anyone watching the token can
filter for. It points at holding the admin role as a threshold key, renouncing
it after setup, and alerting on that event. Setting up a fresh desk restores the
gate-only arrangement.

**The asset's terms come from the chain.** `#asset-terms` is read back from the
asset contract, so what the page claims about face value and maximum supply is
what the contract was created with.

**Private keys never reach the browser.** No response the server sends contains
the operator key or the reserve address's key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null` or an empty value while visible; a control that is working shows
it and cannot be pressed twice.

## How this will be checked

1. Open `/` at 1024px or wider. Confirm the title spans the top, the two
   columns below it, and `#setup-desk` visible without scrolling.
2. Confirm `#price-feed-address` shows the Chainlink BTC/USD feed
   `0x058fE79CB5775d4b167920Ca6036B824805A9ABd`, and that reading
   `latestRoundData` from it returns a positive answer.
3. Press `#setup-desk`. Watch all six steps reach `done`. Confirm on the mirror
   node that `#asset-contract-id` exists as a contract, and that `#asset-terms`
   matches what the contract reports.
4. In `#roles`, confirm the issuer role is held by the address in
   `#gate-address`, the agent role is held by `nobody`, and the admin role is
   held by the operator. Confirm the same from the asset contract.
5. Read `#reserve-quantity`, `#reserve-price`, `#reserve-value`,
   `#asset-supply`, `#asset-liability`, `#coverage-ratio` and `#headroom`.
   Confirm the reserve quantity equals the collateral contract's balance for
   `#reserve-account`, and that the coverage ratio is the reserve value over the
   liability.
6. Enter an amount inside `#headroom` and confirm `#mint-preview` says the gate
   would allow it. Press `#mint-submit`. Confirm the holder's balance and
   `#asset-supply` rose by that amount, the transaction succeeded on the mirror
   node, and `#activity` records it.
7. Enter an amount greater than `#headroom`. Confirm `#mint-preview` says it
   would be refused, then press `#mint-submit` and confirm `#mint-error` names
   the refusal, `#asset-supply` is unchanged, and the activity log records the
   refusal.
8. Press `#direct-issue`. Confirm `#direct-issue-result` names the role error
   and `#asset-supply` is unchanged.
9. Enter enough in `#withdraw-amount` to take the reserve below the liability
   and press `#withdraw-collateral`. Confirm `#reserve-quantity` fell by that
   amount, that the collateral contract agrees, that `#reserve-status` is
   `UNDER-RESERVED`, and that a further issuance of `1` is refused.
10. Press `#bypass-gate`. Confirm it succeeds, `#asset-supply` rose beyond what
    the reserve covers, and `#bypass-result` explains that the gate binds the
    issuer role and not the admin role. Confirm on the mirror node that the
    asset emitted a `RoleGranted` event for the issuer role, and that `#roles`
    now shows the operator holding it alongside the gate.
11. Inspect the responses the page received during all of the above for any
    private key.
12. Without a wallet connected, confirm `#wallet-state` says to connect and
    `#add-wallet-holder` is not offered.

Connecting MetaMask and signing with it is **not** checked: the checker has no
MetaMask wallet. It is still part of the feature and must be implemented as
described.

## Constraints

- The asset and the collateral are both deployed by the **ATS factory**; this
  app deploys no security token of its own. Only the gate and the reserve feed
  are this app's contracts, in `packages/foundry/contracts/`.
- ATS on Hedera testnet, version 8: factory `0.0.9213391`, Business Logic
  Resolver `0.0.9212226`, bond configuration id
  `0x0000000000000000000000000000000000000000000000000000000000000002`. Their
  EVM addresses are read from the mirror node (`/api/v1/contracts/<id>` →
  `evm_address`). The configuration's version must be resolved first with
  `getLatestVersionByConfiguration(bytes32)`: version `0` reverts with
  `VersionZero(bytes32)`.
- The deployed token's address is taken from the factory's `BondDeployed` event
  in the deployment receipt, not from simulating `deployBond`. The factory is
  shared, so a simulated address is only valid against the state at that
  moment: anyone else deploying in between changes it, which once turned a
  successful deployment into a failed run and abandoned a token that had just
  been paid for. The simulation is still run first — it is how a refusal is
  decoded before a transaction is sent.
- **ATS roles, exactly.** `DEFAULT_ADMIN_ROLE` is `0x00`; the issuer role is
  `0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f`; the
  agent role is
  `0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b`; the
  control-list role is
  `0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d`. ATS
  gates `issue` on **issuer or agent**, so granting the agent role to any
  account would open a second door straight past the gate: it is granted to
  nobody. ATS reverts with its own `AccountHasNoRole`, not OpenZeppelin's
  `AccessControlUnauthorizedAccount`, despite `DEFAULT_ADMIN_ROLE` keeping the
  OpenZeppelin value.
- **The gate must carry its own access control.** ATS checks `msg.sender`, which
  inside the asset is the gate, whoever called the gate — the original caller's
  address never reaches ATS. A gate whose issue entry point is unpermissioned is
  therefore an open faucet capped only by the collateral. The gate keeps its own
  list of accounts allowed to ask, set by its owner, and checks it before it
  reads the reserve. Authorisation is never inferred from `tx.origin`.
- Do not try to make the admin role multi-party by scheduling the gate call.
  Hedera's `scheduling.whitelist` is `ConsensusSubmitMessage`, `CryptoTransfer`,
  `TokenMint`, `TokenBurn`, `CryptoApproveAllowance`, `CryptoUpdate` and the
  `RegisteredNode*` types — `ContractCall` is **not** on it, so scheduling one
  fails with `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST` and creates no schedule.
  The one-key admin role is deliberate, and the page says so.
- **What the gate guarantees, stated exactly:** given an honestly-held admin
  role, no issuance exceeds the reserve. It cannot bind the role above it —
  `grantRole` needs only the admin of the role being granted
  (`DEFAULT_ADMIN_ROLE` by default), and ATS grants that through the `rbacs`
  array at deployment, so this template's operator holds it by choice, not by
  any rule of the factory. The gate's value is that unbacked issuance requires
  an explicit `RoleGranted` event rather than happening silently. The page says
  this; it does not imply the server is restrained by the gate. The production
  answer named on the page is the admin role on a threshold key or multisig at
  deployment, `renounceRole` by the operator afterwards, and monitoring
  `RoleGranted` for the issuer role.
- `grantRole` also requires the token to be unpaused, so a paused token cannot
  have roles granted at all. Worth knowing as a circuit breaker; this template
  does not pause.
- Never call the asset's `disableIssuance` or `finalizeIssuance`. Both are
  one-way switches held by the admin role, and either one ends the demo
  permanently for that token.
- The reserve feed this app deploys implements Chainlink's
  `AggregatorV3Interface` and reports the **live balance** of the collateral
  token held by the reserve address, scaled to `8` decimals, with `updatedAt`
  set to the current block time. It stores no reserve amount of its own: there
  is no setter, because a reserve a desk can type in proves nothing. A real
  Chainlink proof-of-reserve feed is a drop-in replacement for it, which is the
  reason for the interface.
- Prices come from the Chainlink **BTC/USD** feed on Hedera testnet,
  `0x058fE79CB5775d4b167920Ca6036B824805A9ABd`, through `latestRoundData`, with
  `decimals()` read from the feed rather than assumed. There is no
  proof-of-reserve feed on Hedera on either network — only price feeds — which
  is why the reserve quantity comes from a token balance.
- The gate refuses to issue when the price answer is not greater than zero, or
  when `block.timestamp - updatedAt` exceeds the staleness threshold it was
  deployed with. The threshold is a constructor argument so the template can
  show a refusal, and the page names it.
- **Units are explicit and tested.** Both tokens have `0` decimals, the face
  value is stored by ATS with `2` decimals, and both feeds report with `8`. The
  gate compares the reserve's value against the liability in a single stated
  scale, and the Foundry tests cover the arithmetic at the boundary — exactly
  covered, one unit over, and one unit under — because a decimals mistake here
  silently permits orders of magnitude more issuance than the reserve covers.
- The collateral token stands for custodied BTC one unit to one BTC. That
  mapping is the template's one unverifiable assumption, and the page says so:
  the balance is real and the price is real, but what each unit represents is a
  custodian's claim — which is precisely what a real proof-of-reserve feed
  attests and why it exists.
- Both ATS tokens' control lists are allowlists, so the reserve address and
  every holder must be added to the asset's or the collateral's control list
  before it can hold either. An unlisted address is refused with
  `AccountIsBlocked`.
- Issuer transactions are signed on the server with the operator key over
  `https://testnet.hashio.io/api` using `viem`, which the project already
  depends on. `HEDERA_OPERATOR_KEY` must be ECDSA — raw hex with or without
  `0x`, or DER-encoded ECDSA — because JSON-RPC transactions are ECDSA-signed;
  an ED25519 key is refused at start with a readable `#config-error`.
- Hedera charges for at least 80% of a transaction's gas limit, so set limits
  close to need: an ATS deployment uses about 7.2M gas (limit `8000000`), the
  gate and feed far less. Expect about 16 HBAR for a full setup, which deploys
  two ATS tokens.
- A transient relay failure arrives as an HTTP 400 carrying a `-32000` body, so
  the status alone cannot tell it apart from a revert. Classify it, retry only
  reads and simulations, and never retry by re-sending a transaction. An error
  shown to the user or written to a log never includes the request body, which
  carries the signed transaction.
- Every server route acts with the operator's key, so a route must refuse any
  address this desk did not create. The desk records the tokens, the gate and
  the reserve it made; that record is the allowlist. Withdrawals and issuances
  also carry an upper bound, so a mistyped amount cannot move the desk's whole
  position.
- **No login, but not therefore open.** There is no authentication: the operator
  key sits in `packages/nextjs/.env.local` on the same machine, so a password
  would be guarded by a secret an attacker with local access already holds, and
  a user store teaches nothing about Hedera. One cheap measure stands in for it,
  because "it is only localhost" is not true on its own:
  - every route that signs anything refuses a request whose `Sec-Fetch-Site` is
    not `same-origin` (falling back to an `Origin` that is not the app's own).
    A page the learner visits in any other tab can otherwise POST to these
    routes: the same-origin policy stops it reading the reply, not the route
    from running, and these routes spend the operator account and issue a real
    security. A shared helper does this once; routes do not each re-implement
    it.

  The dev server is left on Next's own default interface, so a desk running in
  a container stays reachable. Pinning it to loopback was tried and reverted:
  it broke that for no gain the guard above does not already give.

  What remains accepted: anyone able to run code on this machine can spend the
  operator account. Adding a wallet as a holder is likewise taken on trust, as
  no signature proves the address belongs to whoever asked. Say both on the
  page rather than implying the desk is protected.
- Server routes live under `packages/nextjs/app/api/`, following the pattern in
  `packages/nextjs/app/api/hedera/`. The browser signs nothing except, where the
  wallet holder is involved, its own transactions through wagmi.
- A single shared client is created per process and never closed by a route: a
  closed client fails every later call with an error that reads like a bug in
  the transaction.
- Every value the page shows about the chain is read from the chain or the
  mirror node. Server memory holds only what the chain does not record, such as
  the activity log's own ordering, and may be lost on a restart.
- Foundry tests in `packages/foundry/test/` cover the gate against a mock
  aggregator and a mock collateral token: the two independent refusals, the
  boundary arithmetic, a stale price, a zero price, and that a refusal issues
  nothing. `yarn foundry:test` runs them, with no network.
- No new dependencies. Testnet only.

## Out of scope

- A real Chainlink proof-of-reserve feed; none exists on Hedera, and the
  interface is there so one could replace the app's feed.
- Making the admin role multi-party; `permissioned-security` covers the keys
  that need more than one holder.
- Redemption, burning the asset to release collateral, and over-collateralisation
  ratios other than full cover.
- Coupons, maturity and other corporate actions; `ats-bond` and `bond-coupons`
  cover those.
- Equity and the other ATS token types.
- HashPack and other non-EVM wallets.
- Persisting the desk's state across server restarts.
