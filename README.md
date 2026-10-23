# permissioned-security

Issue a permissioned security token on Hedera whose compliance rules are keys the network enforces — KYC, freeze, wipe and pause — and run a court-order freeze that takes two officers, because every admin key is a 2-of-3 threshold key. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Issue a permissioned security token and run a court-order freeze**.

```bash
npx create-scaffold-hbar@latest --template web3buidlerz/hedera-finance-templates#templates/permissioned-security
```

> Work in progress: this branch is the Next.js starter the permissioned security app is being built on.

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
