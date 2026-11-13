# collateral-mobility

Pledge a tokenised T-bill as collateral **without it ever leaving its owner's wallet**. The bill is issued through Hedera's Asset Tokenization Studio (ATS), and a USD stablecoin through the Stablecoin Studio. A borrower raises cash against the bill for a fixed term, then repays principal plus interest to get it back, or loses it to the lender.

The collateral never moves. An **ATS hold** encumbers the bill in the borrower's own account, naming the repo contract as escrow and the lender as the only destination. The repo contract takes no custody and holds no role on the bill. The bill is valued by a feed that turns a published discount rate and the days remaining into a price, so it accretes toward par on its own and a rate shock is one published number.

Paired with a Hedera docs page under **Solutions → Finance Workflows** (not yet published).

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/collateral-mobility
```

## Run it

You need an ECDSA testnet account with HBAR ([Hedera Portal faucet](https://portal.hedera.com/faucet)). It is the lender: it deploys everything and holds the stablecoin. The key stays on the server.

```bash
yarn install
cp packages/nextjs/.env.example packages/nextjs/.env.local
# set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (ECDSA; ED25519 is refused)
yarn next:dev   # http://localhost:3000
```

Nothing needs deploying first. **Set up** on the page issues the bill and the stablecoin, deploys the price feed and the repo contract, and creates a borrower account. It takes about six minutes on testnet.

## The tour

The home page walks the desk one step at a time; the **Sandbox** tab has every control at once.

1. **Set up** — the bill, the stablecoin, the feed, the repo contract and the borrower.
2. **Pledge** — the borrower puts 10 bills on hold; they stay in the borrower's account.
3. **Borrow** — the lender lends against the pledge after a 2% haircut.
4. **Break it** — move the held bills, take the pledge back early, send the bills somewhere other than the lender, or pledge a hold the lender cannot collect. Each attempt runs against the live contracts and is refused.
5. **Stress it** — publish a rate shock, push the loan past 99% loan-to-value, freeze the bill.
6. **Resolve** — repay and get the bills back, or liquidate at the price trigger or the end of the term.

Two clocks stay in view throughout: the bill's days to maturity (with a reset) and the loan's time left until term liquidation.

**The demo clock:** ten seconds of real time is one day of the bill's life. The 30-day term runs in five minutes; the 91-day bill matures in about fifteen.

## The numbers

```
bill          $1,000 face, 91 days, discount rate 5.00%  → $987.36 per bill
pledge        10 bills                                   = $9,873.61
haircut       2%                                         → capacity $9,676.14
borrow        $9,600                                     → LTV 97.23%
threshold     99% LTV                                    → liquidation at $969.70 per bill
term          30 days at 4.80%                           → debt $9,638.40
```

A price liquidation on a 13-week bill needs a rate move of about 700bp, so failing to repay at term is the main way a loan is liquidated, as in real bill repo. The full design is in [`specs/collateral-mobility.md`](specs/collateral-mobility.md).

## Project layout

- **packages/foundry/contracts** — `BillRepo.sol` (the repo contract) and `BillPriceFeed.sol` (the bill's price feed), with mocks of the bill and the stablecoin
- **packages/foundry/test** — Foundry tests against those mocks, no network: `yarn foundry:test`
- **packages/nextjs/app** — the tour (`_desk/Tour.tsx`), the sandbox, and the `api/desk` routes
- **packages/nextjs/services/repo** — the server side: setup, actions, and the snapshot the page reads

Every API route that writes signs with the operator key, so `middleware.ts` refuses writes that do not come from the app's own pages.

This template is built on Scaffold-HBAR. For CLI flags, npm vs Yarn, deploying and verifying, see the [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index).

## Links

- [Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio)
- [Stablecoin Studio](https://github.com/hashgraph/stablecoin-studio)
- [scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar) — CLI
- [HashScan](https://hashscan.io/)
