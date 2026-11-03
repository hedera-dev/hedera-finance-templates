# dvp-settlement

Settle a trade delivery-versus-payment on Hedera: the security leg and the stablecoin leg move in one scheduled native `TransferTransaction`, or neither moves. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Settle a trade delivery-versus-payment in one atomic transfer**.

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/dvp-settlement
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
