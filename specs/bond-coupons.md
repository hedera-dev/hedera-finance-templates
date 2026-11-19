# Bond coupons

Replace the home page at `/` with a coupon bond desk. The issuer issues a bond
whose **contract pays its own coupons**: at each coupon date the Hedera Schedule
Service (HIP-1215) calls the bond, which pays every holder in an HTS stablecoin
and schedules its next coupon itself. The last payment adds the principal, and
nothing is scheduled after it. No keeper, bot, cron job or off-chain automation
is involved — after `Start`, nobody presses anything.

Parties:

- **Issuer** — the operator account. Deploys the factory once, creates the
  stablecoin, issues bonds, allocates positions, funds bonds, starts and stops
  their schedules.
- **Investors** — two demo investors the app creates (`Investor A`,
  `Investor B`). They sign nothing; coupons simply arrive.
- **Wallet investor** (optional) — the learner's MetaMask account on Hedera
  testnet, which can be given a position and receive coupons.

## What a user sees

**Layout.** The title and a short explanation span the top: what a coupon is,
how they are usually paid (a paying agent, or a keeper network such as
Chainlink Automation on other chains), and that here the bond schedules its own
payments through the Hedera Schedule Service. Below, on a window at least
1024px wide, two columns scroll together with the page: what the learner
*does* on the left (setup, the issue form, positions and funding, schedule
controls), what the network *shows* on the right (the bond, its schedule, the
coupon history, investor balances). Before a bond exists the right column holds
a placeholder card saying what will appear there. Narrower windows stack the
columns, controls first. Every card has a title and a one-sentence caption.
Form labels sit above their inputs.

**Setup.** `#setup-desk`, labelled `Set up desk`, creates the stablecoin and the
two demo investors, showing its progress as a one-line-per-step checklist with
`data-status` (`pending`, `active`, `done`, `failed`): `#setup-step-stablecoin`
(create the stablecoin), `#setup-step-investors` (create the demo investors).
A spinner marks the running step and a check with the ids it produced marks
finished ones. When no factory is deployed, `#factory-missing` says to run
`yarn coupons:deploy` and the issue form is disabled. When the operator is not
configured, `#config-error` names `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`.
`#factory-address` shows the factory's address, linked to HashScan.

**The issue form**, after setup, each input pre-filled with a value that works:

- `#bond-name` — default `Acme Coupon Bond`
- `#bond-face-value` — face value per unit in stablecoin, whole number,
  default `1000`
- `#bond-coupon-rate` — coupon per period, in percent of face value, default
  `1` (between `0.01` and `20`)
- `#bond-period-minutes` — minutes between coupons, whole number `1`–`60`,
  default `2`. A caption explains this stands in for a coupon period such as
  six months, shortened so it can be watched
- `#bond-coupon-count` — number of coupons, whole number `1`–`12`, default `3`

and `#issue-bond`, labelled `Issue bond`, which creates the bond through the
factory.

**The bond**, once issued: `#bond-address` and `#bond-contract-id` (linked to
HashScan), its terms read back from the contract, `#bond-status` — exactly one
of `CREATED`, `RUNNING`, `MATURED`, `STOPPED` — and, while running,
`#next-coupon` with the next coupon's number and due time, and
`#schedule-address` with the current schedule's address linked to HashScan.

**Positions and funding.** `#investors` lists investors as rows with the class
`investor-row` and `data-address`: label, Hedera account id, EVM address,
allocated units, and stablecoin balance read from the mirror node. While the
bond is `CREATED`, each row has a units input (class `investor-units`, whole
number, defaults `10` for Investor A, `5` for Investor B) and `Allocate` (class
`investor-allocate`). `#funding` shows what the bond needs — total stablecoin
for every coupon plus the principal, and the HBAR it needs to pay for its own
schedules — next to what it holds, with `#fund-amount` (stablecoin, defaulting
to what is still missing) and `#fund-bond`, labelled `Fund bond`, which sends
that stablecoin and the HBAR still missing.

**Schedule controls.** `#start-schedule`, labelled `Start coupons`, enabled once
positions are allocated and the bond holds HBAR for its schedules. `#stop-schedule`,
labelled `Stop schedule`, enabled while `RUNNING`.

**Coupon history.** `#coupons` lists, newest first, rows with the class
`coupon-entry`: coupon number, consensus time, outcome (`PAID`, `MISSED` — not
enough stablecoin — or `PRINCIPAL REPAID` on the last), total paid, and the
transaction linked to HashScan. It is read from the bond's events on the mirror
node, so it shows payments nobody on the page triggered.

**The wallet investor.** The header keeps the scaffold's RainbowKit connect
button, offering MetaMask (and WalletConnect); the burner wallet is removed.
Once a wallet is connected, `#add-wallet-investor` (`Add my wallet as an
investor`) adds a `Your wallet` row. If the wallet's account is not associated
with the stablecoin, `#associate-stablecoin` (`Associate the stablecoin`) has
MetaMask call the token's HIP-719 `associate()`. `#wallet-state` says what to do
next: connect, switch to Hedera testnet, add the wallet, associate, or wait for
coupons.

**Every page refreshes** the bond's status, the coupon history and the balances
on its own every few seconds, so coupons appear as they are paid, without a
reload.

## Behaviour

**The contract pays and reschedules itself.** `Start coupons` has the issuer
call the bond's `start()`, which schedules coupon 1 for one period from now
through the schedule service. At the due time the network calls the bond's
`payCoupon()`. It pays each holder `units × faceValue × rate` in the stablecoin,
emits an event, and schedules the next coupon one period later. Coupon
`couponCount` also pays each holder `units × faceValue` principal, sets the
status to `MATURED`, and schedules nothing. Each investor's stablecoin balance
rises by exactly its coupon at each date and by its principal at maturity.

**Early calls do nothing harmful.** `payCoupon()` may be called by anyone, but
reverts unless the current coupon is due (block time at or after its due time)
and the bond is `RUNNING`; a coupon is never paid twice.

**A coupon the bond cannot afford is missed, not partly paid.** If the bond holds
less stablecoin than a coupon needs, it pays nothing, emits a missed-coupon
event, and schedules a retry of the same coupon one period later. Funding the
bond before the retry makes the retry pay in full. One period later means one
period after the coupon was *due*: a retry measured from the attempt would push
every later coupon out by however late the attempt was.

**A holder who cannot be paid does not stop the bond.** A holder who has not
associated the stablecoin cannot be sent it, and that transfer fails. Every
other holder is still paid, the coupon still advances, the next one is still
scheduled, and what could not be delivered is recorded against that holder and
kept by the bond. Their row shows `Owed <amount>` with a control that pays it,
and the coupon history shows an `UNPAID` entry naming the coupon. Nothing is
lost and nothing is stuck: a failed transfer must never revert the whole
coupon, because that consumes the schedule without replacing it and the bond
never pays anyone again.

**A value that could not be read is not shown as a number.** The bond's HBAR
balance is read from the chain; until that read lands it is unknown, not zero.
The funding line says so, and `#start-schedule` stays disabled while it is
unknown rather than claiming the bond is unfunded.

**Scheduling can fail without stalling the bond.** Before scheduling, the bond
checks `hasScheduleCapacity` and tries the following seconds if a second is
full. If scheduling still fails, it emits an event saying so, the coupon stays
due, and `#pay-now` (`Pay due coupon`) lets anyone trigger it.

**Stopping cancels the pending schedule.** `Stop schedule` has the issuer call
`stop()`, which deletes the pending schedule through the schedule service and
sets the status to `STOPPED`; no further coupon is paid.

**The bond pays for its own schedules.** With `scheduleCall`, the calling
contract is the payer of the scheduled execution, so the bond needs HBAR. The
desk shows how much and `Fund bond` sends it. How much is each remaining
coupon's gas limit at the network's current gas price, not a fixed amount, so
the figure stays right when fees change.

**A coupon gets the gas it costs.** Each scheduled `payCoupon()` is given
enough gas to pay every holder and schedule the next coupon. Too little, and
the reschedule at the end runs out of gas, the whole coupon reverts, and the
consumed schedule is never replaced.

**Private keys never reach the browser.** No response the server sends contains
the operator key or a demo investor's key.

**Nothing half-rendered is ever shown.** No element above displays `undefined`,
`NaN`, `null` or an empty value while visible; a working control shows it and
cannot be pressed twice.

## How this will be checked

1. Open `/` at 1024px or wider. Confirm the title on top, the two columns, and
   `#factory-address` showing a factory that exists on the mirror node as a
   contract.
2. Press `#setup-desk`; watch both steps reach `done`. Confirm the stablecoin
   exists on the mirror node and both investors exist as accounts.
3. Issue a bond with period `1` minute and `2` coupons (rate `1`, face value
   `1000`). Confirm `#bond-contract-id` exists on the mirror node, the terms
   read back match, and `#bond-status` is `CREATED`.
4. Allocate `10` to Investor A and `5` to Investor B. Press `#fund-bond` with
   the default amount. Confirm on the mirror node that the bond holds the
   stablecoin for both coupons and the principal (`15 × 1000 × 0.01 × 2 +
   15 × 1000 = 15300`) and holds HBAR.
5. Press `#start-schedule`. Confirm `RUNNING`, a `#schedule-address`, and the
   next coupon due about one minute out. Without touching the page, wait up to
   four minutes: confirm coupon 1 `PAID` and coupon 2 `PRINCIPAL REPAID` in
   `#coupons`, status `MATURED`, and on the mirror node Investor A up by
   `100 + 100 + 10000` and Investor B by `50 + 50 + 5000`.
6. Issue a second bond (1 minute, 2 coupons), allocate `10` to Investor A, fund
   only `100` (one coupon), and start. Confirm coupon 1 `PAID` and coupon 2
   `MISSED`. Fund the rest; within about two minutes confirm coupon 2
   `PRINCIPAL REPAID` and `MATURED`.
7. Issue a third bond (2 minutes, 3 coupons), allocate, fund, start, then press
   `#stop-schedule` before the first coupon. Confirm `STOPPED`, and after the
   due time has passed, no coupon in `#coupons` and no balance change.
8. Inspect the responses the page received for any private key.
9. Without a wallet connected, confirm `#wallet-state` says to connect.

Connecting MetaMask and signing with it is **not** checked: the checker has no
MetaMask wallet. It is still part of the feature and must be implemented as
described.

## Constraints

- Every bond route takes its address from the URL, and acts on it with the
  issuer's key. It must refuse any address this desk did not issue: `fund` sends
  stablecoin and HBAR to that address, and sizes the HBAR from the address's own
  `couponCount`, so an unchecked address is an invitation to name a price. The
  desk already records the bonds it created; that list is the allowlist. A
  funding call also has an upper bound, so a mistyped amount cannot move the
  desk's whole balance.
- Every route is unauthenticated: anyone who can reach the server can spend the
  operator account and move the desk's stablecoin. That is the bargain of a
  localhost tutorial, and the reason this app is not meant to be reachable by
  anyone else.

- Contracts in `packages/foundry/contracts/`: `CouponBond` and
  `CouponBondFactory`. The factory's `createBond(...)` deploys a `CouponBond`
  owned by the caller, forwards any HBAR sent with it, and emits an event with
  the issuer and the bond address. The deploy script is
  `packages/foundry/script/DeployCouponFactory.s.sol`, deploying only the
  factory; `yarn coupons:deploy` (already in the root `package.json`) runs it
  non-interactively with the operator key and regenerates
  `packages/nextjs/contracts/deployedContracts.ts`. Commit the regenerated file
  so the template ships with a working testnet factory.
- Schedule through the Hedera Schedule Service system contract at `0x16b`,
  using `contracts/interfaces/IHederaScheduleService.sol` (already present):
  `scheduleCall(address to, uint256 expirySecond, uint256 gasLimit,
  uint64 value, bytes callData) returns (int64 responseCode, address
  scheduleAddress)`, `hasScheduleCapacity(uint256, uint256)`,
  `deleteSchedule(address)`. Success is response code `22`
  (`HederaResponseCodes.SUCCESS` from `hedera-forking`).
- The calling contract pays for `scheduleCall` executions: the bond must hold
  HBAR (accept it with `receive()`). Hedera charges for at least 80% of a
  scheduled call's gas limit, so keep the limit close to need and cap holders at
  `10` per bond so a coupon fits one call.
- Coupons are paid in an HTS fungible token the server creates with
  `@hiero-ledger/sdk` (6 decimals, treasury the operator). The bond holds and
  sends it through the token's ERC-20 interface at the token's EVM address
  (`IERC20.transfer`). The bond associates itself with the token in its
  constructor by calling the token's HIP-719 `associate()`
  (`IHRC719(token).associate()`); check the response.
- Demo investors are Hedera accounts with ECDSA keys, an EVM address set from
  the public key, and unlimited automatic token associations, so they can
  receive the stablecoin without signing; at most `1` HBAR each.
- Tests in `packages/foundry/test/` with
  `test/mocks/MockHederaScheduleService.sol` (already present) etched at
  `0x16b`, and a mock stablecoin, cover: paying and rescheduling, the due-time
  guard, a missed coupon and its retry, maturity with principal and no further
  schedule, stopping, and the capacity fallback. `yarn foundry:test` runs them.
- Issuer calls are signed on the server with the operator key over
  `https://testnet.hashio.io/api` using `viem` (already a dependency).
  `HEDERA_OPERATOR_KEY` must be ECDSA (raw hex with or without `0x`, or
  DER-encoded ECDSA); an ED25519 key is refused at start with `#config-error`.
- Coupon history and balances come from the mirror node (contract logs,
  account token balances), not from server memory.
- Server routes under `packages/nextjs/app/api/`, following the pattern in
  `packages/nextjs/app/api/hedera/`. The browser signs only the wallet
  investor's own association, through wagmi.
- Desk state (stablecoin id, demo investors, current bond) may live in server
  memory.
- No new dependencies. Testnet only.

## Out of scope

- Day-count conventions, accrued interest, record dates, secondary trading of
  positions, investors paying for their positions.
- Coupons on an ATS bond.
- More than 10 holders per bond; pull-based claiming.
