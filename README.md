# ats-bond

Issue a tokenised bond through Hedera's Asset Tokenization Studio (ATS) testnet factory, approve the investors allowed to hold it, and distribute it to them. ATS deploys the bond from contracts already on testnet: you deploy nothing.

Paired with the Hedera docs page **Solutions → Finance Workflows → Issue a tokenised bond with Asset Tokenization Studio**.

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/ats-bond
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
