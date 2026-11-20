# dvp-settlement-evm

Settle a trade delivery-versus-payment on Hedera through contracts: the security leg and the cash leg are each encumbered where they already sit, and one settlement contract executes both in a single transaction, or neither moves.

The EVM homologue of the **dvp-settlement** template, which does the same thing with a native scheduled `TransferTransaction` and no contracts at all. Read them side by side.

Paired with the Hedera docs page **Solutions → Finance Workflows → Settle a trade delivery-versus-payment in one atomic transfer**.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/dvp-settlement-evm
```

```bash
yarn install
yarn foundry:compile   # the desk deploys the settlement contract from this artifact
yarn next:dev          # http://localhost:3000
```

Set `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY` in `packages/nextjs/.env.local` (see `.env.example`). The operator pays for setup and needs at least 100 testnet HBAR.

The page opens on a guided tour: **Set up** the market, have the Seller **Propose** a trade, **Lock** both legs as pledges that move nothing, **Settle** them in one transaction, **Break it** with four attacks the contracts refuse (each with a HashScan link to the failed transaction), and make **More trades**, including ones that settle at a set time and ones that are cancelled. The **Sandbox** tab (`/?view=sandbox`) has every control on one page, including pledging the cash from your own wallet.

Setup costs about **76 testnet HBAR**, of which 30 is float dealt to the three demo accounts and stays there — about 46 is actually spent, most of it the two tokens.

## What the desk is made of

| | |
| --- | --- |
| Security | An ATS equity, deployed through the Asset Tokenization Studio factory already on testnet |
| Cash | An HTS stablecoin, deployed through the Stablecoin Studio factory already on testnet |
| Settlement | `DvpSettlement.sol`, the only contract this repo owns — no custody, no roles, no balances |

A pledge is a **hold**: the token itself records that only the settlement contract may move those units, and only to the counterparty the owner named. The two tokens hold units differently, and the page says which:

- The **security** is encumbered in place. The units stay in the Seller's own account, excluded from `balanceOf` and reported by `getHeldAmountForByPartition`.
- HTS has no in-place encumbrance, so the **cash** hold moves the units into the stablecoin's own custody and records them against the holder. The Buyer's free balance falls by the price, and `getHeldAmountFor` reports the difference.

Either way nothing has been delivered: the only call that can move a pledged leg is `settle`, and it moves both or reverts.

## Layout

- `packages/foundry/contracts/DvpSettlement.sol` — the settlement contract, and the two token interfaces it calls
- `packages/foundry/test/DvpSettlement.t.sol` — 21 tests against mocks, no network: `yarn foundry:test`
- `packages/nextjs/services/dvp/` — server-only: the operator key never reaches the browser
- `packages/nextjs/app/_components/dvp/` — the tour and the sandbox
