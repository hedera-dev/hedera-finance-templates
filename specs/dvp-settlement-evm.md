# DvP settlement, through contracts

Replace the home page at `/` with a delivery-versus-payment (DvP) settlement
desk whose two legs are **pledged where they sit and released together by a
contract**. A seller sells a security token to a buyer for a stablecoin. Each side pledges
its leg with a *hold* naming one settlement contract as the escrow and the
counterparty as the destination: from then on neither party can spend its own
leg, and neither has received the other's.
Settlement is one call that executes both holds in a single transaction — or
reverts, in which case neither leg has moved and both pledges are still intact.

This is the EVM homologue of the `dvp-settlement` template, which tells the
same story with a native scheduled `TransferTransaction` and no contracts.

Four parties appear on the page:

- **Issuer** — the operator account the app runs with. Deploys the two tokens
  and the settlement contract, grants the roles, and funds the other three.
- **Seller** — holds the security, proposes the trade, pledges the security.
- **Buyer** — holds the stablecoin, pledges the cash. Verified on the security.
- **Unverified Buyer** — holds stablecoin too, and is **not** granted KYC on
  the security, so the security leg cannot land on it.

By default the Seller and both Buyers are demo accounts the app creates and
signs for on the server, so the whole flow runs from one browser tab with no
wallet. A learner who connects an EVM wallet before setup takes the Buyer's
place with their own testnet account: pledging the cash is then an ordinary
transaction their wallet is prompted for and pays for.

Three contracts are involved and only one of them is this template's own:

- the **security**, an equity deployed through the Asset Tokenization Studio
  factory already on testnet;
- the **cash**, a stablecoin deployed through the Stablecoin Studio factory
  already on testnet;
- **`DvpSettlement`**, in `packages/foundry/contracts`, which holds no tokens,
  no roles and no custody. It is only ever an escrow.

## What a user sees

**Two views.** The title and a one-sentence explanation span the top, beside a
`Hedera testnet` badge and a Tour / Sandbox toggle (`#view-tour`,
`#view-sandbox`). `/` is the tour; `/?view=sandbox` is every control on one
page. Both read the same market.

**The tour** walks the desk one step at a time. `#tour-progress` shows six
steps — `Set up`, `Propose`, `Lock`, `Settle`, `Break it`, `More trades` — with
finished ones ticked and the current one highlighted. The step follows the
market, not the tab: before setup it is `Set up`; then `Propose` until a trade
exists, `Lock` while a trade is waiting for one or both pledges, `Settle` once
both legs are pledged; after a trade has settled the reader moves freely
between `Break it` and `More trades` from the stepper. Each step fits a
1440×900 window, with the step's action in a highlighted card and the exact
calls it makes in a collapsed "Under the hood" section.

Once the market exists, `#market-strip` stays above every step: the security
and cash token ids and the settlement contract id, each linked to HashScan, and
for each party both balances, each as **free and held** — the number that can
still move, and the number pledged. The Unverified Buyer is marked `no KYC`.

1. **Set up** — the Setup section below, with who is who and what setup costs.
2. **Propose** — the terms are fixed: `100` security for `10000` cash to the
   Buyer, settling as soon as both legs are pledged. `#tour-propose`, labelled
   `Propose as Seller`. Beside it, "What is pledged?" shows both legs and
   which one is still missing.
3. **Lock** — two controls, `#tour-lock-security` (`Pledge the security as
   Seller`) and `#tour-lock-cash` (`Pledge the cash as Buyer`), each disabled
   once its leg is pledged. After each, the market strip shows that party's
   free balance fall and its held balance rise by the same amount: committed,
   and not delivered. The step says where the units are in each case — the
   security in the Seller's own account, the cash in the stablecoin's custody,
   because HTS cannot encumber in place.
4. **Settle** — `#tour-settle`, labelled `Settle both legs`. The settlement is
   announced above the next step with a link to the transaction on HashScan,
   and the strip shows both legs delivered at once.
5. **Break it** — four attacks, each a real transaction, in its own card with
   what it tries, the call it makes and its result: `#settle-one-leg` settles a
   trade whose cash leg is not pledged (`#settle-one-leg-result`);
   `#settle-no-kyc` settles a fully pledged trade to the Unverified Buyer
   (`#settle-no-kyc-result`); `#seller-reclaims` has the Seller try to take the
   pledged security back mid-trade (`#seller-reclaims-result`);
   `#settle-twice` settles a trade that has already settled
   (`#settle-twice-result`). A refusal shows in red with the error the contract
   returned and a link to the transaction; an acceptance shows in amber; an
   attack that cannot run yet says why in neutral colours and does not count. A
   count says how many were tried and refused, and `#next-trades` moves on.
6. **More trades** — the trade ticket and the trades list with their own
   controls, the parties' balances, and the history, collapsed.

**The sandbox** keeps the original layout: on a window at least 1024px wide,
two columns scroll together with the page: what the learner *does* on the left
(setup, the trade ticket, the wallet), what the **chain shows** on the right
(the market, the trades list, the history). Before setup the right column holds
a placeholder card saying what will appear there. Narrower windows stack the
columns, controls first. Every card has a title and a one-sentence caption.
Form labels sit above their inputs.

**Setup.** A control `#setup-market`, labelled `Set up market`, with its
progress as a one-line-per-step checklist, each step an element carrying its
state in `data-status` (`pending`, `active`, `done`, `failed`):

- `#setup-step-accounts` — create and fund the three demo parties
- `#setup-step-security` — deploy the security through the ATS factory
- `#setup-step-cash` — deploy the stablecoin through the Stablecoin Studio
  factory
- `#setup-step-contract` — deploy `DvpSettlement`, naming the two tokens
- `#setup-step-permissions` — admit the parties to the security's control list,
  grant KYC to everyone but the Unverified Buyer, associate the cash to each
  party, and grant both Buyers the stablecoin's hold-creator role
- `#setup-step-fund` — issue the security to the Seller and mint cash to both
  Buyers

When the app has no operator configured, `#setup-market` is disabled and
`#config-error` names the two environment variables to set:
`HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`. Setup is refused before
anything is deployed when the operator holds less than the HBAR it needs, and
says how much that is.

After setup the page shows:

- `#security-id` and `#security-address` — the security's contract id and EVM
  address, the id linked to HashScan
- `#cash-id` — the stablecoin's token id, linked to HashScan
- `#contract-id` — the settlement contract's id, linked to HashScan
- `#parties` — one row per party with the class `party-row` carrying
  `data-party`: its label, its account id linked to HashScan, whether it is
  granted KYC on the security, and four numbers — security free, security
  held, cash free, cash held — each a plain number in whole token units.
- `#starting-position` — what setup gave each party, in words.

**The trade ticket.** `#ticket` holds:

- `#trade-quantity` — security units, a whole number, defaulting to `100`
- `#trade-price` — total cash to pay, defaulting to `10000`
- `#trade-buyer` — the Buyer or the Unverified Buyer
- `#settlement-mode` — `As soon as both legs are pledged` (the default) or
  `Not before a set time`
- `#settlement-delay` — shown only for the set time: minutes from now, a whole
  number from `1` to `60`, defaulting to `2`. A caption explains that this
  stands in for a settlement date such as T+1, shortened so it can be watched
- `#propose-trade` — labelled `Propose as Seller`

**The trades list.** `#trades` lists every trade of the current market, newest
first, as rows with the class `trade-row` carrying `data-trade` (the contract's
trade id) and `data-status`. Each row shows the trade id, the buyer, the
quantity and price, when it may settle, which legs are pledged, its status, and
what it changed for each party once it has settled. Each row has its own
controls, each enabled only when the contract would accept it:

- `Pledge security` (class `trade-lock-security`)
- `Pledge cash` (class `trade-lock-cash`)
- `Settle` (class `trade-settle`)
- `Cancel` (class `trade-cancel`)

Status is exactly one of `AWAITING PLEDGES`, `WAITING FOR THE TIME`, `READY`,
`SETTLED`, `CANCELLED` or `EXPIRED`, read from the contract and the two tokens:
`WAITING FOR THE TIME` once both legs are pledged but a trade's settlement time
has not arrived, `READY` once both legs are pledged and it has, and `EXPIRED`
when a pledge has outlived its hold.

**The wallet.** `#wallet-state` says in a sentence what the connected wallet is
to this desk: not connected, the Buyer for this market, or connected but not a
party. A wallet connected **before** setup becomes the Buyer; the demo Buyer is
then not created. A wallet Buyer pledges its own cash: `#pledge-as-wallet`
prompts it for one ordinary transaction to the stablecoin, which it pays for.

## Behaviour

**The market starts in a known state.** Right after setup the Seller holds
`200` security and no cash; the Buyer holds `20000` cash and no security; the
Unverified Buyer holds `10000` cash and no security. Nothing is pledged. The
security has internal KYC switched on and a whitelist control list; the Seller
and the Buyer are on it and granted KYC, and the Unverified Buyer is on it but
**not** granted KYC. The cash has 2 decimals; both Buyers hold the
stablecoin's hold-creator role, and the Seller does not need it.

**Proposing moves nothing.** `#propose-trade` records the terms on the
settlement contract and nothing else: the trade appears in `#trades` as
`AWAITING PLEDGES` with neither leg pledged, and every balance, free and held,
is exactly what it was.

**A pledge commits a leg without delivering it.** Pledging the security creates
a hold on the security for the trade's quantity, naming the settlement contract
as escrow and the **buyer** as destination, and then records it against the
trade. Pledging the cash does the same on the stablecoin, with the **seller**
as destination. In both cases the page shows that party's free balance fall and
its held balance rise by the same amount, and the counterparty has received
nothing.

**The two tokens hold units differently, and the page says which.** The ATS
security encumbers them in place: the units stay in the Seller's account,
excluded from `balanceOf` and reported by `getHeldAmountForByPartition`. HTS has
no in-place encumbrance, so the stablecoin's hold moves the units into the
stablecoin's own custody and records them against the holder, where
`getHeldAmountFor` reports them; the buyer's HTS balance falls by the price.
Either way the hold is what governs them: only the escrow can move them, only
to the destination the holder named, and the holder takes them back when the
hold expires.

**A pledge is proof, not a claim.** Recording a pledge against a trade reads
the hold back from the token and refuses it unless it names the settlement
contract as escrow, names the trade's counterparty as destination, covers the
trade's amount, and expires late enough to outlast the trade's settlement time
by the contract's grace period. It also refuses a hold already recorded against
another trade. Because every one of those facts is read from the token, anyone
may submit a pledge — the party whose units they are has already committed them
by creating the hold.

**Both legs move in one transaction, or neither does.** `Settle` executes the
security hold to the buyer and the cash hold to the seller in the same call.
With the default ticket the Seller ends with `100` security and `10000` cash,
and the Buyer with `100` security and `10000` cash. On the mirror node this is
one transaction carrying both transfers.

**A failed leg fails both.** A trade to the Unverified Buyer can be proposed
and both legs pledged, but settling it reverts with the security token's own
error — the destination has no KYC — and **nothing is delivered**: the Seller
still holds its security, the Unverified Buyer's cash is still its own, held
against a trade that has not paid for anything, and both pledges survive the
refusal, so the trade can still be cancelled or settled later. This is the point of the template: on this desk a cash leg
cannot complete while its security leg fails.

**Neither party can take its pledge back while the trade is live.** Only the
escrow — the settlement contract — can release a hold, and the holder's own way
out is refused until the hold expires. The Seller calling the security's
`reclaimHoldByPartition` mid-trade is refused by the token.

**Cancelling releases both pledges.** Either party may cancel a trade that has
not settled. The contract releases whichever legs are pledged, each back to the
party that pledged it, in that one call: free balances return to what they
were, the trade becomes `CANCELLED`, and it can no longer be settled.

**Nobody is locked in by a desk that stops running.** Each hold carries its own
expiry, two hours out. If a trade is never settled or cancelled, each party
reclaims its own units from the token once its hold expires — `reclaimHold` on
the stablecoin, `reclaimHoldByPartition` on the security — without the
settlement contract and without this app.

**Settling at a set time.** A trade with a set time is pledged like any other,
but settling before that time is refused by the contract. The page shows the
trade `AWAITING PLEDGES` until both legs are in and then counts down to the
time, after which it is `READY` and the `Settle` control is enabled.

**The desk can trade again.** New trades can be proposed at any time, while
others are open, without setting up a new market. Each gets its own trade id
from the contract, and each pledge is a separate hold: a hold already recorded
against one trade is refused by another.

**Everything shown is read from the chain.** Balances, held amounts, KYC state,
the legs pledged and each trade's state come from the two tokens and the
settlement contract on every read, never from the desk's own memory. Desk
memory holds only what the chain does not: which demo account is which party,
and the key for each demo account. When a read fails, the affected value shows
`Unknown` rather than a stale or invented number.

**Private keys never reach the browser.** No response the server sends to the
page contains the operator key or any demo account's private key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null`, or an empty value while visible; a control that is working shows
it and cannot be pressed twice.

## How this will be checked

Steps 1–10 use the Sandbox, `/?view=sandbox`; step 11 walks the tour.

1. Open `/?view=sandbox` at 1024px or wider. Confirm the title on top, the two
   columns below, and `#setup-market` visible without scrolling.
2. Press `#setup-market`. Watch the six steps reach `done`. Confirm on the
   mirror node that `#security-id`, `#cash-id` and `#contract-id` all exist,
   and that the settlement contract reports the security and cash addresses it
   was deployed with.
3. Confirm `#parties` shows the Seller with `200` security free and `0` held,
   the Buyer with `20000` cash free and `0` held, the Unverified Buyer with
   `10000` cash and no KYC, and that the security's `getKycStatusFor` agrees
   for all three.
4. With the Buyer and the default ticket, press `#propose-trade`. Confirm a
   `AWAITING PLEDGES` row in `#trades` whose trade the contract reports with
   neither leg pledged, and that every balance is unchanged.
5. Press that row's `Pledge security`. Confirm the Seller's free security falls
   to `100` and its held rises to `100` on the token itself, that the units are
   still in the Seller's account (`getHeldAmountForByPartition` reports them),
   that nothing has reached the Buyer, and that the hold the token reports names
   the settlement contract as escrow and the Buyer as destination.
6. Press `Pledge cash`. Confirm the Buyer's free cash falls to `10000` and the
   stablecoin reports `10000` held for it, that the hold it reports names the
   settlement contract as escrow and the Seller as destination, that the Seller
   has received nothing, and that the row becomes `READY`.
7. Press `Settle`. Confirm the row becomes `SETTLED`, the Seller holds `100`
   security and `10000` cash, the Buyer holds `100` security and `10000` cash,
   nothing is held any more, and that on the mirror node one transaction carries
   both legs: the security's `Transfer` and the stablecoin's in the same
   transaction's logs.
8. Propose `10` for `1000` to the **Unverified Buyer**, pledge both legs, and
   press `Settle`. Confirm it is refused with the security's KYC error, that
   the page says so, that both pledges are still in place on the tokens, and
   that nothing was delivered: the Seller received no cash and the Unverified
   Buyer no security.
9. Cancel that trade. Confirm both pledges are released — each party's free
   balance back where it was and nothing held — the row reads `CANCELLED`, and
   its `Settle` control is disabled.
10. Propose a trade with `Not before a set time` and `1` minute, pledge both
    legs, and confirm the row reads `WAITING FOR THE TIME`, that `Settle` is
    refused before the time with the contract's own `TooEarly`, and that it is
    accepted after.
    Inspect the responses the page received during all of the above for any
    private key.
11. Set up a fresh market, open `/` and walk the tour: `#tour-propose`,
    `#tour-lock-security`, `#tour-lock-cash`, `#tour-settle`. Then run the four
    attacks and confirm each reads refused, with the error the contract or
    token returned and a HashScan link to a transaction the mirror node reports
    as failed. Each attack pledges before it tries to settle, so a payer's own
    free balance does fall; what must not change is anything **received**: the
    Seller's cash, the Buyer's security and the Unverified Buyer's security are
    all exactly where step 7 left them.

## Constraints

- Hedera testnet only, over the JSON-RPC relay with viem, with the mirror node
  for what the relay cannot answer (contract ids, account ids for EVM
  addresses). `HEDERA_RPC_URL` overrides the public relay.
- The operator comes from the server-side environment variables
  `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`, an ECDSA key. Every signature
  by the operator or a demo party happens in server routes under
  `packages/nextjs/app/api/`. The only signing in the browser is the connected
  wallet's own.
- The security is deployed through the ATS factory `0.0.9213391` with the
  business-logic resolver `0.0.9212226`, equity configuration
  `0x…01`. The cash is deployed through the Stablecoin Studio factory
  `0.0.6349500` with resolver `0.0.6349477`, stablecoin configuration `0x…02`.
  Interface shapes come from the `v.8.0.0-ats` tag, never from `main`.
- `DvpSettlement` is the only contract this repo owns. It holds no token, no
  role and no custody: it can only execute a hold to the destination the
  pledging party fixed, or release it back to them.
- The two holds speak different types for the same idea: ATS amounts are
  `uint256`, Stablecoin Studio amounts are `int64`. Every crossing between them
  is a checked conversion that reverts rather than wrapping.
- Hedera charges the greater of gas used and 80% of the gas limit, so gas
  limits sit close to the measured need. Calls that are expected to revert are
  sent with a fixed limit, because a reverting call cannot be estimated.
- Keeping which demo account is which party, and their keys, in server memory
  is fine; it does not need to survive a server restart.
- `yarn foundry:test` covers the settlement contract against mocks of both
  tokens, with no network: the happy path, one leg missing, a hold naming the
  wrong escrow, a hold naming the wrong destination, a hold that is too small,
  a hold that expires too soon, a hold already used by another trade, settling
  twice, settling before the set time, and cancelling from each state.

## Out of scope

- Mainnet.
- Partial fills, order books, and netting several trades into one settlement.
- Real USDC; the stablecoin is one the app deploys.
- An HCS audit topic: here the settlement contract's own events are the record,
  and the HCS audit-trail template covers topics.
- Persisting the market across server restarts.
- A wallet taking the Seller's side: the Seller's pledge and the proposal are
  two transactions on this desk, and the Buyer's single pledge is the shorter
  path into a wallet's hands.
