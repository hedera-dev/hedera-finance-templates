# bond-coupons

A bond contract that pays its own coupons. Each payment schedules the next one through the Hedera Schedule Service (HIP-1215), coupons are paid in an HTS stablecoin, and the last payment repays principal. No keepers, bots or off-chain automation.

Paired with the Hedera docs page **Solutions → Finance Workflows → Pay bond coupons automatically with the Hedera Schedule Service**.

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/bond-coupons
```

```bash
yarn install
yarn coupons:deploy   # once: deploys the coupon bond factory to Hedera testnet
yarn next:dev         # http://localhost:3000
```
