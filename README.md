# bond-coupons

A bond contract that pays its own coupons. Each payment schedules the next one through the Hedera Schedule Service (HIP-1215), coupons are paid in an HTS stablecoin, and the last payment repays principal. No keepers, bots or off-chain automation.

Paired with the Hedera docs page **Solutions → Finance Workflows → Pay bond coupons automatically with the Hedera Schedule Service**.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/bond-coupons
```

```bash
yarn install
yarn coupons:deploy   # once: deploys the coupon bond factory to Hedera testnet
yarn next:dev         # http://localhost:3000
```

`/` is a guided tour: set up the desk, issue a bond, fund it, start it and watch it pay itself to maturity, try three calls the bond must revert, then miss a coupon and watch the retry pay it in full. It costs about 60 testnet HBAR, most of it creating the stablecoin and the HBAR each bond keeps to pay for its own schedules. `/?view=sandbox` has every control on one page, including your own wallet as an investor.
