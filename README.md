# ats-bond

Issue a tokenised bond through Hedera's Asset Tokenization Studio (ATS) testnet factory, approve the investors allowed to hold it, and distribute it to them. ATS deploys the bond from contracts already on testnet: you deploy nothing.

Paired with the Hedera docs page **Solutions → Finance Workflows → Issue a tokenised bond with Asset Tokenization Studio**.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/ats-bond
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```

The page opens on a guided tour: **Issue** the bond, **Approve** Investor A, **Distribute** 100 bonds, **Break it** with three attacks the bond refuses on-chain (each with a HashScan link), and **Manage the list**. The **Sandbox** tab (`/?view=sandbox`) has every control on one page. Issuing costs about 12 testnet HBAR.
