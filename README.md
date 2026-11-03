# proof-of-reserve

Issue a tokenised asset through Hedera's Asset Tokenization Studio that **cannot be issued beyond its collateral**: a gate contract holds the asset's issuer role and reads the reserve before it mints, so the network refuses an issuance the reserve does not cover.

The reserve is not a number anybody types in. It is the on-chain balance of a second ATS token held in a reserve address, valued with the live Chainlink BTC/USD feed on Hedera testnet, so coverage moves as the market moves.

Paired with a Hedera docs page under **Solutions → Finance Workflows** (not yet published).

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/proof-of-reserve
```

> Work in progress: this branch is the starter the reserve desk is being built on. `specs/proof-of-reserve.md` is what it is being built from.

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
