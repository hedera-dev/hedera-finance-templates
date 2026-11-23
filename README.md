# regulated-token

Issue a regulated token on Hedera whose compliance rules are keys the network enforces — KYC, freeze, wipe and pause — and run a court-order freeze that takes two officers, because every admin key is a 2-of-3 threshold key. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Regulated Token**. That page also covers [regulated-token-evm](https://github.com/hedera-dev/hedera-finance-templates/tree/templates/regulated-token-evm), which puts the same compliance powers in a 2-of-3 `OfficerBoard` contract holding the roles on an ATS security, instead of threshold keys on an HTS token. Read them side by side.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/regulated-token
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```

The page opens on a guided tour: **Set up** the token and its officers, have Officer 1 **Propose** a court order to freeze Holder A, **Approve** it as Officer 2, **Break it** with three attempts the network refuses (each with a HashScan link), and carry out **More orders**. The **Sandbox** tab (`/?view=sandbox`) has every control on one page. Setup costs about 27 testnet HBAR, 20 of it the fee for creating a token.
