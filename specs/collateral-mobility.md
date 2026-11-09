# Collateral mobility

Replace the home page at `/` with a repo desk. A short-dated US Treasury bill is
issued through Hedera's **Asset Tokenization Studio** (ATS), a USD stablecoin is
issued through the **Stablecoin Studio**, and a borrower raises cash against the
bill for a fixed term — then repays principal plus interest to get the bill
back, or loses it to the lender if they do not.

The thing worth watching is where the collateral sits. It never moves. The bill
stays in the borrower's own account for the whole life of the loan, encumbered
in place by an **ATS hold** that names the repo contract as escrow and the
lender as the destination. The repo contract takes no custody at any point and
holds no role on the bill — it cannot mint it, freeze it, or send it anywhere
except the one destination the borrower named when they pledged it. That is
what collateral mobility means when it is built rather than described: the
pledge is a right over an asset in place, and it settles in seconds against the
cash leg in the same transaction.

The collateral is valued by a Chainlink-compatible feed this app deploys, which
turns a published discount rate and the days remaining into a price. So the
bill's value **accretes on its own** as it ages toward par, borrowing headroom
grows while nobody touches the page, and a rate shock is a single published
number rather than a button that fakes a move.

Parties:

- **Lender** — the operator account the app runs with. Deploys everything, holds
  the stablecoin, and is the destination of every hold.
- **Borrower** — one demo account the app creates, plus the learner's own
  MetaMask account on Hedera testnet. Holds the bills and signs the pledge.
- **Repo contract** — escrow on every hold. Holds no role on the bill and is not
  on its control list.

## The running example

Every number on the page is this example, and the Foundry tests pin it:

```
bill          $1,000 face, 91 days, zero coupon, discount rate 5.00% (500bp)
price         1000 × (1 − 0.05 × 91/360)      = $987.36 per bill
pledge        10 bills                        = $9,873.61 of collateral
haircut       2% (200bp)                      → capacity $9,676.14
borrow        $9,600                          → LTV 97.23%
threshold     99% LTV                         → liquidation at $969.70 per bill
term          30 days, repo rate 4.80%        → interest $38.40, debt $9,638.40
```

Two consequences of those numbers drive the whole design, and the page says both
out loud:

**Price liquidation on a 13-week bill is nearly unreachable.** The bill's
duration is 91/360 = 0.25 years, so each 100bp of rate costs $2.53 — about
0.26%. Moving the price from $987.36 to the $969.70 trigger needs the discount
rate to go from 5% to roughly 12%: a **700bp** move in three-month bills, which
is not a market move but a change of monetary regime. That is correct finance
and poor demo material, so **failure to repay at term is the primary
liquidation path** — which is also what actually liquidates real bill repo — and
the price shock is kept as the second path with its size labelled as deliberately
beyond anything observed.

**Pull to par is the carry, not decoration.** Over the 30-day term the bill
accretes $41.67 while the loan costs $38.40 in interest: $3.27 of carry earned
on money that was never the borrower's. The page shows both numbers side by
side, because the gap between what collateral earns and what funding costs is
the entire reason this trade exists — and, at the 50× leverage a 2% haircut
permits, the entire reason it is dangerous.

## The demo clock

One compression, applied in one place, and named on the page: **ten seconds of
real time is one day of the bill's life.** The 30-day term runs in five minutes
and the 91-day bill matures in about fifteen.

The term has to be long enough to work a position in and short enough to wait
out, because term default is the primary liquidation path and the only way to
show it is to let the term end. Five minutes is that compromise. The real-second
constants around it — the staleness window, the grace period and the hold's
expiry margin — are scaled to match, so that none of them dwarfs the loan it
governs.

The price feed is constructed with a `maturityTimestamp` and a `secondsPerDay`
that is `10` here and `86400` in production; it computes
`daysRemaining = (maturityTimestamp − now) / secondsPerDay`, and the loan accrues
interest over `elapsedDays = elapsed / secondsPerDay` on the same knob. Nothing
else in the app has a clock of its own.

The ATS bill's own `getMaturityDate()` is set 91 **real** days out, because that
is what the instrument is. The page shows that date beside the demo clock and
states plainly that the two differ by 8,640× and why. Without the compression
the interest on a five-minute loan at 4.8% is less than half a cent and the
page would read `$0.00`.

## What a user sees

**Layout.** The title and a short explanation span the top: what a repo is, that
the pledged bills never leave the borrower's account, and that the price is
computed from a published rate and the days remaining rather than typed in.
Below them, on a window at least 1024px wide, two columns scroll together with
the page: what the learner *does* on the left (setup, the pledge, the loan
ticket, the simulations), what the network *shows* on the right (the bill, the
position, the cash, the encumbrance, the activity log). Before setup the right
column holds a placeholder card saying what will appear there. Narrower windows
stack the columns, controls first. Every card has a title and a one-sentence
caption. Form labels sit above their inputs.

**Setup.** A control `#setup-desk`, labelled `Set up desk`. When the app has no
operator configured, `#setup-desk` is disabled and `#config-error` names the two
variables to set: `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`.

Setup shows its progress as a one-line-per-step checklist, each step an element
carrying its state in `data-status` (`pending`, `active`, `done`, `failed`):

- `#setup-step-version` — resolve the latest version of both the ATS bond
  configuration and the Stablecoin Studio stablecoin configuration
- `#setup-step-bill` — deploy the bill through the ATS factory
- `#setup-step-stablecoin` — deploy the stablecoin, its token and its reserve
  through the Stablecoin Studio factory
- `#setup-step-feed` — deploy the bill price feed
- `#setup-step-repo` — deploy the repo contract
- `#setup-step-permissions` — allowlist the borrower and the lender on the bill,
  grant the lender the stablecoin's cash-in role, and associate the stablecoin
  to the borrower
- `#setup-step-positions` — issue 10 bills to the borrower and mint the lender's
  stablecoin

A spinner marks the running step, a check and the ids it produced mark finished
ones, a cross marks a failure. No step is left `active` once the run has ended:
a failure anywhere marks the running step `failed`, so a spinner never outlives
the run. A one-line explanation per step sits in a collapsed "What each step
does" section that starts closed. The title, a one-line summary (who pays, what
it roughly costs, that running it again starts a fresh desk) and the button
share the top of the card, so `#setup-desk` is visible without scrolling. When
setup finishes the page scrolls the position into view.

**The bill.** After setup:

- `#bill-address` and `#bill-contract-id`, linked to HashScan
- `#bill-terms` — name, symbol, ISIN, face value per bill and maturity date,
  **read back from the bill contract**, not echoed from setup
- `#bill-days-remaining` — demo days left, counting down once a second
- `#bill-discount-rate` — the rate the feed publishes, in basis points
- `#bill-price` — the price the feed reports, in US dollars per bill
- `#price-updated-at` — when the feed last updated, as a readable local time
- `#feed-address`, linked to HashScan, with a caption saying this app deployed it
  because Hedera carries no Treasury price feed, and that it implements
  Chainlink's `AggregatorV3Interface` so a real one is a drop-in replacement
- `#demo-clock` — reads `10 seconds = 1 day`, beside the bill's real maturity date

**The position.** Also after setup:

- `#collateral-pledged` — bills under hold, from
  `getHeldAmountForByPartition`: digits only, no separators, no symbol
- `#collateral-free` — the borrower's `balanceOf`, with a caption saying ATS
  excludes held units from it, so the two numbers add up to what the borrower
  owns
- `#collateral-value` — the pledge at the feed's price, in US dollars
- `#haircut` — the haircut the repo contract was deployed with, as a percentage
- `#borrowing-capacity` — collateral value after the haircut
- `#principal` — stablecoin borrowed
- `#interest-accrued` — interest so far, on the demo clock
- `#debt` — principal plus interest
- `#ltv` — debt over collateral value, shown with the digits of a number
  followed by `%`
- `#liquidation-threshold` — the LTV at which the lender may seize, as a
  percentage
- `#liquidation-price` — the per-bill price at which the threshold is breached,
  with a caption saying it rises as interest accrues
- `#headroom` — how much more stablecoin the position can still borrow
- `#accretion` — what the bill has gained since the loan opened, beside
  `#interest-accrued`, with the difference labelled as the carry
- `#term-remaining` — demo days left on the loan, counting down
- `#loan-status` — exactly one of `NO LOAN`, `OPEN`, `MARGIN CALL`,
  `LIQUIDATABLE`, `REPAID`, `LIQUIDATED` or `UNKNOWN`

**The cash.** `#stablecoin-proxy`, `#stablecoin-token` and `#stablecoin-id`,
linked to HashScan, with a caption saying the proxy is where management lives and
the token address is where value moves. Then `#lender-cash` and `#borrower-cash`,
read from the token, and `#stablecoin-reserve` with `#reserve-amount` — the
Studio's own proof of reserve on the cash leg, which caps what can ever be
minted.

**The encumbrance.** The card that carries the point of the template:

- `#escrow-address` — the repo contract, linked to HashScan
- `#hold-destination` — the address the pledged bills go to on default, read
  from the hold with `getHoldForByPartition`, not from what the app intended
- `#hold-expiry` — the hold's expiry in real time, with a caption saying it must
  outlast the loan
- `#repo-in-control-list` — whether the repo contract is on the bill's control
  list, read from the bill. It reads `no`
- `#repo-roles` — which roles on the bill the repo contract holds, read from the
  bill. It reads `none`
- a caption stating what those two lines mean together: the escrow is not a
  privilege over the token, the collateral was never transferred to the
  contract, and the destination was fixed by the borrower at pledge time and
  cannot be changed afterwards by anyone

**The pledge and the loan ticket.**

- `#pledge-amount` — bills to pledge, a whole number, defaulting to `10`
- `#pledge-collateral` — labelled `Pledge bills as collateral`
- `#pledge-error` — why the last pledge was refused, decoded to its error name
- `#borrow-amount` — stablecoin to borrow, defaulting to `9600`
- `#borrow-preview` — the pre-flight check for the amount entered, updating as
  it changes: the capacity, what the loan would need, the LTV it would open at
  and whether the contract would allow it
- `#open-loan` — labelled `Borrow against the pledge`
- `#open-error` — why the last loan was refused, decoded to its error name,
  cleared when the next attempt starts
- `#repay-loan` — labelled `Repay and release the collateral`
- `#top-up-amount` and `#top-up` — labelled
  `Repay part of the principal to cure`
- `#liquidate` — labelled `Take the collateral`
- `#liquidate-result` — what the network answered, and which of the two paths it
  took

**The simulations.** A separate card, captioned as simulations of things that
happen to a real desk:

- `#shock-rate` and `#apply-shock`, labelled `Shock the discount rate`, which
  publishes a new discount rate in basis points. A caption says the 700bp move
  needed to liquidate this bill is far beyond anything observed in three-month
  bills and is shown only so the mechanism is visible
- `#freeze-feed`, labelled `Stop the price feed`, which pins the feed's
  `updatedAt` to a time outside the staleness window
- `#resume-feed`, labelled `Restart the price feed`
- `#transfer-pledged`, labelled `Try to transfer the pledged bills`, which has
  the borrower attempt to send more bills than their free balance
- `#transfer-result` — what the network answered
- `#reclaim-pledge`, labelled `Try to reclaim the pledge`, which has the
  borrower call `reclaimHoldByPartition` while the loan is open
- `#reclaim-result` — what the network answered, and a sentence saying the
  borrower's own way out opens only once the hold expires, which is why the
  expiry must outlast the loan
- `#pledge-wrong-escrow`, labelled `Pledge with the wrong escrow`, which has the
  borrower create a hold naming the **lender** as escrow instead of the repo
  contract — a pledge that looks right on the page and is worthless
- `#redirect-pledge`, labelled `Try to send the pledge elsewhere`, which has the
  repo contract attempt to execute the hold to an address other than the
  destination recorded on it
- `#redirect-result` — what the network answered

**The activity log.** `#activity` lists every action the desk performed, newest
first, as rows with the class `activity-entry`: the time, what was done, the
result (`SUCCESS`, or the refusal decoded to its error name) and the transaction
hash linked to HashScan where one was sent.

**The wallet borrower.** The header keeps the scaffold's RainbowKit connect
button, offering MetaMask; the burner wallet is removed. Once a wallet is
connected, `#add-wallet-borrower`, labelled `Add my wallet as the borrower`,
allowlists its address on the bill and issues it 10 bills. The learner then
signs their own pledge in MetaMask, which is the one transaction in this
template that genuinely belongs to them: encumbering their own asset without
handing it over. `#wallet-state` says in a sentence what to do next: connect,
switch MetaMask to Hedera testnet, add the wallet, or pledge.

**Every page refreshes** the price, the days remaining, the accrued interest,
the LTV and the balances on its own every second, so the position moves as the
clock runs, without a reload.

**While a read is in flight, the last good value stays on screen.** A refresh
that has not landed yet never blanks an element that already had a number.
Before the first read of a desk lands, every value in the position, bill and
cash cards reads `—`: one em dash, never an empty element, and never a `0` that
would be mistaken for a position.

## Behaviour

**The pledge encumbers in place.** `#pledge-collateral` has the borrower create
an ATS hold over their own bills, naming the repo contract as escrow and the
lender as destination. The bills stay in the borrower's account:
`#collateral-pledged` rises by the amount, `#collateral-free` falls by it, and
the two still sum to what the borrower owns. No transfer of the bill appears on
the mirror node, because none happened.

**The destination is fixed at pledge time.** The hold's `to` is set by the
borrower when they pledge and cannot be changed afterwards. The page reads it
back from the chain into `#hold-destination`, and `#redirect-pledge` proves it:
the escrow itself — the only account ATS lets near the hold — asks to execute
it to a different address and ATS refuses, with `#redirect-result` naming the
error and `#collateral-pledged` unchanged. The borrower therefore commits to
one destination at pledge time and the lender cannot widen it later.

**Cash moves only against a verified hold.** `#open-loan` is one transaction. In
it the repo contract reads the hold with `getHoldForByPartition` and refuses
unless the escrow is itself, the destination is the lender, the amount is at
least the collateral the loan claims, and the expiry outlasts the term plus its
grace period. Only then does it pull the lender's stablecoin and push it to the
borrower. There is no window in which the loan exists unsecured, and no step at
which the app's claim about the pledge is taken on trust.

**And that verification is demonstrable, not asserted.**
`#pledge-wrong-escrow` stages a hold that names the lender as escrow rather
than the repo contract. The page shows the pledge, `#collateral-pledged` rises,
and `#collateral-free` falls — from the outside it is indistinguishable from a
good pledge. `#open-loan` is then refused and `#open-error` names the escrow
mismatch, with no cash moved. That refusal is the only evidence from outside
the code that the contract reads the hold rather than trusting the page, which
is why the control ships rather than living in a test.

**The haircut caps the loan.** A loan is refused when the principal exceeds
`collateral value × (1 − haircut)`. `#borrow-preview` says so before the button
is pressed; `#open-error` names the refusal after it. Nothing is borrowed and
the hold is left untouched, so the borrower can pledge again or release.

**Borrowing within capacity succeeds.** With an amount inside
`#borrowing-capacity`, `#open-loan` moves the cash: `#borrower-cash` rises by
the principal, `#lender-cash` falls by it, `#principal` and `#ltv` are set,
`#loan-status` becomes `OPEN`, and the activity log records a success with the
transaction hash.

**The pledged bills cannot be moved.** `#transfer-pledged` has the borrower try
to send more bills than their free balance. ATS refuses it, because held units
are not in `balanceOf`. `#transfer-result` shows the error name and
`#collateral-pledged` is unchanged.

**The borrower cannot take the pledge back early.** `#reclaim-pledge` has the
borrower call `reclaimHoldByPartition` while the loan is open. ATS refuses it,
because reclaim opens only after the hold has expired. `#reclaim-result` shows
the error name.

**Value accretes without anyone acting.** `#bill-price`, `#collateral-value`,
`#borrowing-capacity` and `#headroom` are computed from the days remaining, so
they rise on their own as the clock runs, with no transaction. `#accretion`
shows the gain since the loan opened and `#interest-accrued` the cost over the
same period; the page labels the difference as the carry, and names which of the
two is larger.

**Repaying releases the collateral, in one transaction.**
`#repay-loan` pulls principal plus interest from the borrower, pushes it to the
lender, and calls `releaseHoldByPartition` so the bills are unencumbered —
`#collateral-pledged` returns to `0`, `#collateral-free` returns to what the
borrower started with, `#loan-status` becomes `REPAID`. Either both legs happen
or neither does. A repayment the borrower cannot fund is refused and the hold
stays in place.

**A margin call is a state, not an event.** When the LTV rises above the
threshold, `#loan-status` becomes `MARGIN CALL` and then `LIQUIDATABLE`, and the
page says what will cure it. Nothing is seized automatically.

**Repaying part of the principal cures it.** `#top-up` repays part of the
principal, which lowers the debt and the LTV. Once the LTV is back under the
threshold `#loan-status` returns to `OPEN` and `#liquidate` is refused.

**Failure to repay at term is the primary liquidation path.** Once
`#term-remaining` reaches zero with the loan unrepaid, `#liquidate` calls
`executeHoldByPartition` and the bills move from the borrower to the lender —
the only transfer of the bill in the whole template, to the one destination the
borrower named at pledge time. `#loan-status` becomes `LIQUIDATED` and
`#liquidate-result` says the trigger was the term, not the price. **This path
reads no price at all**, so it works whatever the feed is doing.

**Price liquidation is the second path, and it needs a price it can trust.**
Before the term, `#liquidate` succeeds only when the LTV is at or above the
threshold on a positive, non-stale price. `#apply-shock` with a large enough
rate — around 1200bp against the 500bp the bill was issued at — moves the price
below `#liquidation-price` and makes it succeed.

**A stale or impossible price blocks borrowing and does not permit seizure.**
When the feed's answer is zero or negative, or its last update is older than the
staleness window the repo contract was deployed with, `#open-loan` and `#top-up`
are refused and `#loan-status` is `UNKNOWN` rather than a number nobody can
stand behind. Price-based liquidation is refused too. Term-based liquidation is
**not** refused: the term has passed whatever the oracle thinks. That asymmetry
is deliberate and the page states it — blocking new credit on data you cannot
trust is prudent, seizing someone's collateral on it is not.

**A value that could not be read is shown as unknown, never as a number.** When
a read fails, `#bill-price`, `#collateral-value`, `#borrowing-capacity`, `#ltv`
and `#headroom` say `unavailable` and `#loan-status` is `UNKNOWN`. Never `0`,
and never `LIQUIDATABLE`: on a repo desk those are claims about the chain, and a
failed read has made none. `#open-loan` is refused while the status is
`UNKNOWN`.

**The bill's terms come from the chain.** `#bill-terms` is read back from the
bill contract, so what the page claims about face value and maturity is what the
contract was created with.

**Private keys never reach the browser.** No response the server sends contains
the operator key or the demo borrower's key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null` or an empty value while visible; a control that is working shows
it and cannot be pressed twice.

## How this will be checked

Two readers check this spec, and they can check different things.

The derived checklist is written from this file before anything is built, by a
reader with no access to the code, and each of its checks reads one value once on
a page it did not set up. So a check can only come from a claim that is true
whenever the app is up: not one that holds only after a button is pressed, not
one naming an address this run creates, and not one about whether a control is
disabled. The bullets under **Always true** are phrased to be liftable that way,
one claim each.

Everything else is judgement, and the walkthrough is what the judge runs. Those
steps are not the weaker half — they are the ones that actually exercise the
hold — but none of them is a single read, so writing them as if they were only
loses them.

### Always true

On a freshly loaded `/`, with no desk set up and no wallet connected. The
controls render from the start and are merely disabled until there is a desk, so
their labels are present on the first paint.

- `/` returns HTTP 200.
- `#setup-desk` reads `Set up desk`.
- `#pledge-amount` holds `10`.
- `#borrow-amount` holds `9600`.
- `#pledge-collateral` reads `Pledge bills as collateral`.
- `#open-loan` reads `Borrow against the pledge`.
- `#repay-loan` reads `Repay and release the collateral`.
- `#top-up` reads `Repay part of the principal to cure`.
- `#liquidate` reads `Take the collateral`.
- `#apply-shock` reads `Shock the discount rate`.
- `#freeze-feed` reads `Stop the price feed`.
- `#transfer-pledged` reads `Try to transfer the pledged bills`.
- `#reclaim-pledge` reads `Try to reclaim the pledge`.
- `#pledge-wrong-escrow` reads `Pledge with the wrong escrow`.
- `#redirect-pledge` reads `Try to send the pledge elsewhere`.
- `#demo-clock` reads `10 seconds = 1 day`.
- `#wallet-state` reads `Connect MetaMask to borrow.`
- The ATS factory `0.0.9213391` is a contract on testnet whose EVM address is
  forty hex digits.
- The ATS business logic resolver `0.0.9212226` is a contract on testnet whose
  EVM address is forty hex digits.
- The Stablecoin Studio factory `0.0.6349500` is a contract on testnet whose EVM
  address is forty hex digits.
- The Stablecoin Studio business logic resolver `0.0.6349477` is a contract on
  testnet whose EVM address is forty hex digits.

The last four are the template's premise rather than its behaviour: if either
Studio moves, nothing here can work, and that is worth finding out in fifteen
seconds instead of twenty minutes.

Nothing from the right-hand column belongs in that list. `#bill-price`,
`#bill-days-remaining`, `#bill-terms`, `#bill-address`, `#collateral-pledged`,
`#collateral-free`, `#collateral-value`, `#borrowing-capacity`, `#principal`,
`#interest-accrued`, `#debt`, `#ltv`, `#liquidation-price`, `#headroom`,
`#accretion`, `#term-remaining`, `#loan-status`, `#lender-cash`,
`#borrower-cash`, `#escrow-address`, `#hold-destination`, `#hold-expiry`,
`#repo-in-control-list`, `#repo-roles`, `#redirect-result` and `#activity` do
not exist until a desk
is set up — the column renders a placeholder in their place — so a check reading
any of them on a fresh page fails an app that is behaving exactly as asked.

`#haircut` and `#liquidation-threshold` are also excluded, even though they are
constants: they live inside the position card, which does not render before
setup.

### The walkthrough

1. Open `/` at 1024px or wider. Confirm the title spans the top, the two columns
   sit below it, and `#setup-desk` is visible without scrolling. Confirm the
   right-hand column shows its placeholder and states that nothing appears until
   the desk is set up.
2. Press `#setup-desk`. Watch all seven steps reach `done`. Confirm on the mirror
   node that `#bill-contract-id` and `#stablecoin-id` exist as contracts, and
   that `#bill-terms` matches what the bill contract reports.
3. Read `#bill-discount-rate`, `#bill-days-remaining` and `#bill-price`. Confirm
   the price equals `face × (1 − rate × days/360)` for those three numbers.
4. Confirm `#repo-in-control-list` reads `no` and `#repo-roles` reads `none`, and
   confirm both against the bill contract with `isInControlList` and
   `getRoleMembers`.
5. Enter `10` in `#pledge-amount` and press `#pledge-collateral`. Confirm
   `#collateral-pledged` is `10` and matches `getHeldAmountForByPartition` on the
   bill, `#collateral-free` fell by `10` and matches `balanceOf`, and the mirror
   node shows **no transfer** of the bill in that transaction.
6. Read `#hold-destination` and `#hold-expiry`. Confirm against
   `getHoldForByPartition` on the bill that the escrow is `#escrow-address`, the
   destination is the lender, and the expiry is later than the loan term plus its
   grace period.
7. Enter an amount above `#borrowing-capacity`. Confirm `#borrow-preview` says it
   would be refused, press `#open-loan`, and confirm `#open-error` names the
   refusal, `#principal` is still `0`, and `#borrower-cash` is unchanged.
8. Enter `9600` and press `#open-loan`. Confirm in one transaction that
   `#borrower-cash` rose by the principal, `#lender-cash` fell by it,
   `#loan-status` is `OPEN`, `#ltv` is the debt over the collateral value, and
   `#activity` records it with a hash that succeeded on the mirror node.
9. Press `#transfer-pledged`. Confirm `#transfer-result` names the ATS refusal
   and `#collateral-pledged` is unchanged.
10. Press `#reclaim-pledge`. Confirm `#reclaim-result` names the ATS refusal and
    `#collateral-pledged` is unchanged.
11. Press `#redirect-pledge`. Confirm `#redirect-result` names the ATS refusal,
    `#collateral-pledged` is unchanged, and the mirror node shows no transfer of
    the bill in that transaction.
12. Wait several seconds without touching the page. Confirm
    `#bill-days-remaining` fell, `#bill-price`, `#collateral-value` and
    `#borrowing-capacity` rose, `#interest-accrued` rose, and `#accretion` and
    `#interest-accrued` are both non-zero with the page naming which is larger.
13. Press `#freeze-feed`. Confirm `#loan-status` becomes `UNKNOWN`, that
    `#open-loan` and `#top-up` are refused with the staleness error, and that
    `#liquidate` is also refused while the term has not passed. Press
    `#resume-feed` and confirm the status recovers.
14. Enter `1200` in `#shock-rate` and press `#apply-shock`. Confirm `#bill-price`
    fell below `#liquidation-price`, `#ltv` rose above
    `#liquidation-threshold`, and `#loan-status` is `LIQUIDATABLE`.
15. Press `#top-up` with enough to bring the LTV back under the threshold.
    Confirm `#principal` and `#debt` fell, `#ltv` fell, `#loan-status` returned
    to `OPEN`, and `#liquidate` is now refused.
16. Press `#apply-shock` again to breach the threshold, then press `#liquidate`.
    Confirm the bills moved from the borrower to the lender on the mirror node,
    that the destination is the one `#hold-destination` showed in step 6,
    `#loan-status` is `LIQUIDATED`, and `#liquidate-result` names the price as
    the trigger.
17. Set up a fresh desk. Press `#pledge-wrong-escrow`, and confirm
    `#collateral-pledged` rose and `#collateral-free` fell exactly as a good
    pledge would — the page cannot tell the difference. Confirm with
    `getHoldForByPartition` on the bill that the escrow is **not**
    `#escrow-address`. Then press `#open-loan` and confirm it is refused,
    `#open-error` names the escrow mismatch, `#borrower-cash` is unchanged and
    `#lender-cash` is unchanged.
18. Set up a fresh desk, pledge, borrow, and let `#term-remaining` reach zero
    without repaying. Press `#freeze-feed`, then `#liquidate`. Confirm it
    **succeeds** despite the stale feed and that `#liquidate-result` names the
    term as the trigger.
19. Set up a fresh desk, pledge, borrow, and press `#repay-loan`. Confirm in one
    transaction that `#lender-cash` rose by principal plus interest,
    `#collateral-pledged` returned to `0`, `#collateral-free` returned to its
    starting value, and `#loan-status` is `REPAID`.
20. Inspect the responses the page received during all of the above for any
    private key.
21. With no wallet connected, confirm `#add-wallet-borrower` is not offered.

Connecting MetaMask and signing with it is **not** checked: the checker has no
MetaMask wallet. It is still part of the feature and must be implemented as
described.

## Constraints

### The two Studios

- The bill is deployed by the **ATS factory** and the stablecoin by the
  **Stablecoin Studio factory**; this app deploys no token of its own. Only the
  repo contract and the price feed are this app's contracts, in
  `packages/foundry/contracts/`.
- ATS on Hedera testnet, version 8: factory `0.0.9213391`
  (`0xd1f118a40f3b02883d35909ef2517e7edd78379d`), Business Logic Resolver
  `0.0.9212226` (`0xba2d5fc2083a0b8f164c50e65d782087fba18e0a`), bond
  configuration id
  `0x0000000000000000000000000000000000000000000000000000000000000002`, default
  partition `0x…01`.
- Stablecoin Studio on Hedera testnet: factory `0.0.6349500`
  (`0x36f7a4a253c02bd6dd5e2e303a88f57aab42ff64`), Business Logic Resolver
  `0.0.6349477` (`0x0e31edaaf2157e0b0557a4fe631808f88aa061b7`), stablecoin
  configuration id `0x…02`. The Studio uses the same resolver-and-diamond
  architecture as ATS; configuration `1` is the factory, `2` the stablecoin and
  `3` the reserve. Probing configuration `1` for stablecoin functions returns
  "not registered" for every one of them, which is correct and misleading at
  once — resolve the configuration first.
- Each configuration's version must be resolved with
  `getLatestVersionByConfiguration(bytes32)` before anything else: version `0`
  reverts with `VersionZero(bytes32)`.
- Deployed addresses are taken from the deployment receipt's events — ATS's
  `BondDeployed`, and the Studio's `deployStableCoin` return of
  `{stableCoinProxy, tokenAddress, reserveProxy}` — never from simulating the
  deployment. Both factories are shared, so a simulated address is only valid
  against the state at that moment: anyone else deploying in between changes it,
  which once turned a successful deployment into a failed run and abandoned a
  token that had just been paid for. The simulation is still run first — it is
  how a refusal is decoded before a transaction is sent.
- Deploy the stablecoin with `createReserve: true`, which gives it a demo
  reserve the admin can move by hand. Nothing in this template depends on that
  reserve; it is shown because proof of reserve on the cash leg is what stops
  the stablecoin being over-minted, and `proof-of-reserve` is the template that
  covers it.

### Signatures verified against the live resolvers

The deployed versions have drifted from both projects' published source. These
were read from the resolvers, with controls — a plausible-looking function and a
nonsense one — probed alongside to prove an absence is real:

- **ATS holds take `uint256`. Studio holds take `int64`.** The same concept, two
  numeric domains, meeting inside one contract. Every crossing is a checked
  conversion; an unchecked cast between them is the mistake this constraint
  exists to prevent. `packages/foundry/contracts/interfaces/IAtsHold.sol` and
  `IStablecoinHold.sol` carry the verified signatures.
- `getHoldForByPartition((bytes32,address,uint256))` is registered on the bond
  configuration and returns **seven** values, not the five of the hold struct:
  `(uint256 amount_, uint256 expirationTimestamp_, address escrow_, address
  destination_, bytes data_, bytes operatorData_, ThirdPartyType
  thirdPartyType_)`. This is what makes the open-loan leg trustworthy, so it is
  not optional.
- `transfer(address,int64)` is **not** registered on the stablecoin proxy. The
  proxy is management; value moves through the HTS token address from
  `getTokenAddress()` using its ERC-20 facade.
- `getUpdatedAtThreshold()` and `updateUpdatedAtThreshold(uint256)` are **not**
  registered on the deployed stablecoin, although they exist in the Studio's
  source. The cash leg therefore enforces no staleness of its own, and refusing a
  stale answer is this template's own job.
- Creating a hold on the stablecoin is gated by `_HOLD_CREATOR_ROLE`
  (`0xa0edc074322e33cf8b82b4182ff2827f0fef9412190f0e8417c2669a1e8747e4`). On the
  ATS bill a holder encumbers their own units freely, needing no role at all.
  This template holds only the bill, so that role is never granted — but the
  asymmetry is worth one line on the page.
- `mint(address,int64)` resolves to the Studio's cash-in facet and requires the
  cash-in role, which setup grants to the lender.

### What the spike proved about holds

All of the following were run against testnet before this spec was written, and
the Foundry tests must keep them true:

- A **contract can be a hold escrow**, and it needs **no entry on the bill's
  control list**. The repo contract was never allowlisted and
  `isInControlList(repo)` stayed `false` through release and execute.
- The hold **destination does** need a control-list entry, because execute
  delivers units to it. Setup allowlists the lender for exactly this reason.
- **Only the escrow** may execute or release. The token holder, the admin and
  the issuer all got `IsNotEscrow()` (`0xf86f2a37`).
- The **destination cannot be redirected**. The escrow attempting to execute to
  any other address got `InvalidDestinationAddress(expected, given)`
  (`0xdb0a3012`).
- **`balanceOf` excludes held units.** 100 issued with 40 held reported `60`.
  Any coverage or capacity figure that reads `balanceOf` sees none of the
  pledged collateral, which is why this app reads
  `getHeldAmountForByPartition` for the pledge and `balanceOf` only for the free
  balance.
- Partial release and partial execute both work, so a cure that restores part of
  the collateral is possible. This template does not use it; see out of scope.
- HTS allows an EOA to `approve` and a contract to `transferFrom`, with the
  allowance zeroed after use. Both legs of repayment use that path.
- A contract can associate an HTS token with HRC-719 `associate()`; the return
  code must be checked, as `CouponBond.sol` on `templates/bond-coupons` does.

### The hold expiry is the sharp edge

`reclaimHoldByPartition` is the **holder's** way out and opens the moment the
hold expires — no escrow involved. A hold that expires while the loan is open
lets the borrower take the collateral back and keep the cash. So:

- The hold's `expirationTimestamp` is in **real** seconds, not demo seconds. It
  is set to the loan term plus a grace period, converted to real time.
- `openLoan` refuses any hold whose expiry does not outlast the term plus grace,
  and the figure it requires is a constructor argument so the margin is visible.
- `#hold-expiry` shows it, and the Foundry tests cover a hold that expires
  mid-term being refused at open.

### The contracts this app deploys

- **`BillPriceFeed.sol`** implements Chainlink's `AggregatorV3Interface` and
  computes `price = face × (1 − rate × daysRemaining / 360)` with `8` decimals.
  Constructor: the bill's face value, `maturityTimestamp`, `secondsPerDay` and
  the initial discount rate. `latestRoundData` reports `updatedAt` as the
  current block time, so the feed is never accidentally stale; `pinUpdatedAt`
  freezes it to a chosen past time for the staleness simulation and `0` unpins
  it. `setDiscountRate` publishes a new rate. `daysRemaining` floors at `0`, so
  a matured bill prices at par rather than above it.
  There is no setter for the price itself: a price a desk can type in proves
  nothing, and the accretion has to be arithmetic or the pull-to-par scenario is
  theatre. A real Treasury price feed is a drop-in replacement, which is the
  reason for the interface. Hedera carries no such feed on either network, and
  `proof-of-reserve` already uses the one real Chainlink feed that exists there.
- **`BillRepo.sol`** holds the loans, keyed by an incrementing loan id, each
  recording borrower, lender, collateral amount, hold id, principal, repo rate,
  open time, term and state. Constructor: the bill, the stablecoin proxy, the
  stablecoin token, the feed, the haircut in basis points, the liquidation
  threshold in basis points, the staleness window, the grace period and
  `secondsPerDay`. Its functions are `openLoan`, `repay`, `topUp` and
  `liquidate`.
- `openLoan` is callable by the **lender** only — it is their cash that moves.
  `liquidate` is **permissionless**: both of its triggers are objective and
  on-chain, and a liquidation anyone can call is harder to sit on than one only
  the lender can. `repay` and `topUp` are callable by the loan's borrower only.
- The repo contract must carry its own access control and never infer
  authorisation from `tx.origin`. The lesson from `proof-of-reserve` applies
  unchanged: ATS and the Studio both see `msg.sender` as the contract, whoever
  called it, so an unpermissioned entry point is an open door capped only by an
  allowance.

### Units, in one stated scale

A decimals mistake here silently lends orders of magnitude more than the
collateral covers, so this is explicit and tested at the boundary:

- The bill has `0` decimals — whole bills. Its ATS nominal value is stored with
  `2` decimals, so a $1,000 face is `100000`.
- The stablecoin has `2` decimals, so $9,600 is `960000` and fits `int64` with
  room to spare.
- The feed reports with `8` decimals, and `decimals()` is read from it rather
  than assumed.
- All comparisons happen in **8-decimal US dollars**: `price × quantity` is
  already there, and the stablecoin debt is scaled up by `1e6`.
- The haircut, the liquidation threshold, the discount rate and the repo rate
  are all in basis points.
- Day counts use `360`, the bank-discount convention the bill is quoted on.
- The Foundry tests cover capacity exactly met, one unit over and one unit
  under; the LTV exactly at the threshold, one basis point either side; and the
  liquidation price the page shows agreeing with the LTV the contract computes.

### Four meanings of "discount"

The word means four different things inside this one template, and every reader
will trip on it once, so the page spends a paragraph on it:

1. **The issue discount** — the bill sells below face and pays no coupon; the
   discount *is* the return.
2. **The discount rate the feed publishes** — annualised, so a 5% rate on a
   91-day bill is a 1.264% price discount, not a 5% one. The factor is `91/360`.
3. **The haircut**, also called a discount, and unrelated to either.
4. **The discount rate of present value** — the time value of money, which is
   what makes the first one worth anything.

### Operations

- Issuer and lender transactions are signed on the server with the operator key
  over `https://testnet.hashio.io/api` using `viem`, which the project already
  depends on. The demo borrower's key is generated at setup and kept server-side.
  `HEDERA_OPERATOR_KEY` must be ECDSA — raw hex with or without `0x`, or
  DER-encoded ECDSA — because JSON-RPC transactions are ECDSA-signed; an ED25519
  key is refused at start with a readable `#config-error`.
- Hedera charges for at least 80% of a transaction's gas limit, so set limits
  close to the measured need. Measured on testnet: ATS `deployBond` 7,172,609
  (limit `8000000`); `issue` 450,916; `addToControlList` 110–127k;
  `createHoldByPartition` 397–414k; `releaseHoldByPartition` 179,236;
  `executeHoldByPartition` 459,645; HRC-719 `associate()` 726,488; HTS
  `approve` 727,008; HTS `transferFrom` 45,140. A full setup deploys one ATS
  bond and one Studio stablecoin; budget about 25 HBAR.
- A transient relay failure arrives as an HTTP 400 carrying a `-32000` body, so
  the status alone cannot tell it apart from a revert. Classify it, retry only
  reads and simulations, and never retry by re-sending a transaction. An error
  shown to the user or written to a log never includes the request body, which
  carries the signed transaction.
- Every server route acts with a key, so a route must refuse any address this
  desk did not create. The desk records the bill, the stablecoin, the feed and
  the repo contract it made; that record is the allowlist. Pledges, loans and
  repayments also carry an upper bound, so a mistyped amount cannot move the
  desk's whole position.
- **No login, but not therefore open.** There is no authentication: the operator
  key sits in `packages/nextjs/.env.local` on the same machine, so a password
  would be guarded by a secret an attacker with local access already holds. One
  cheap measure stands in for it, because "it is only localhost" is not true on
  its own: every route that signs anything refuses a request whose
  `Sec-Fetch-Site` is not `same-origin` (falling back to an `Origin` that is not
  the app's own). A page the learner visits in any other tab can otherwise POST
  to these routes: the same-origin policy stops it reading the reply, not the
  route from running, and these routes spend the operator account and move a
  real security. A shared helper does this once; routes do not each
  re-implement it. The dev server is left on Next's own default interface, so a
  desk running in a container stays reachable.

  What remains accepted: anyone able to run code on this machine can spend the
  operator account. Adding a wallet as the borrower is likewise taken on trust,
  as no signature proves the address belongs to whoever asked. Say both on the
  page rather than implying the desk is protected.
- Server routes live under `packages/nextjs/app/api/`, following the pattern in
  `packages/nextjs/app/api/hedera/`. The browser signs nothing except, where the
  wallet borrower is involved, its own transactions through wagmi.
- A single shared client is created per process and never closed by a route: a
  closed client fails every later call with an error that reads like a bug in
  the transaction.
- Every value the page shows about the chain is read from the chain or the mirror
  node. Server memory holds only what the chain does not record, such as the
  activity log's own ordering, and may be lost on a restart.
- Foundry tests in `packages/foundry/test/` cover the repo contract against a
  mock bill, a mock stablecoin and `MockAggregator`: the capacity boundary, the
  LTV boundary, both liquidation paths, term liquidation succeeding on a stale
  price while price liquidation is refused on one, a zero price, a hold whose
  escrow is not the repo contract, a hold whose destination is not the lender,
  a hold expiring mid-term, repayment releasing
  the hold, and that every refusal moves no cash and leaves the hold untouched.
  `yarn foundry:test` runs them, with no network.
- Do not try to make the lender multi-party by scheduling the repo call.
  Hedera's `scheduling.whitelist` is `ConsensusSubmitMessage`, `CryptoTransfer`,
  `TokenMint`, `TokenBurn`, `CryptoApproveAllowance`, `CryptoUpdate` and the
  `RegisteredNode*` types — `ContractCall` is **not** on it, so scheduling one
  fails with `SCHEDULED_TRANSACTION_NOT_IN_WHITELIST` and creates no schedule.
- Never call the bill's `disableIssuance` or `finalizeIssuance`. Both are one-way
  switches held by the admin role, and either one ends the demo permanently for
  that token.
- No new dependencies. Testnet only.

## Out of scope

- **Posting more collateral to cure a margin call.** The cure here is a partial
  repayment, which restores the ratio with one leg instead of two. Adding
  collateral means a second hold per loan and a list to track; `releaseHoldByPartition`
  and `executeHoldByPartition` both work partially, so a fork can add it.
- **Rehypothecation** — the lender reusing the pledged bill in their own trade.
  It is the next thing a real desk does and the reason collateral mobility is
  worth anything, but it needs a second repo contract as the onward escrow and
  doubles the template.
- Derivatives margin and cross-venue collateral reuse, both named out of scope
  in the ticket this template came from.
- A real Treasury price feed; none exists on Hedera, and the interface is there
  so one could replace the app's feed.
- Title transfer. A real repo transfers ownership and this template does not —
  the hold is a pledge, which is the weaker of the two legal forms. What the
  page claims is collateral mobility and atomic settlement, not legal
  equivalence to a repurchase agreement, and it says so in one sentence.
- Multiple simultaneous loans in the UI. The contract keys loans by id so a fork
  can run many; the page drives one.
- Coupons, maturity handling and other corporate actions; `ats-bond` and
  `bond-coupons` cover those.
- Attesting what the stablecoin's reserve actually holds; `proof-of-reserve`
  covers that.
- HashPack and other non-EVM wallets.
- Persisting the desk's state across server restarts.
