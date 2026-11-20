# regulated-token-evm

Issue a regulated security on Hedera through the Asset Tokenization Studio factory, and run a court-order freeze that takes two officers — because the token's KYC, freeze, controller and pause roles belong to a 2-of-3 `OfficerBoard` contract, and to no officer. The EVM homologue of [regulated-token](https://github.com/hedera-dev/hedera-finance-templates/tree/templates/regulated-token), which tells the same story with Hedera-native threshold keys and no contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Regulated Token**, under *The same rules, enforced by a contract* — the section that covers this template. The rest of that page is the native one.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/regulated-token-evm
```

```bash
yarn install
yarn foundry:compile   # the desk deploys the board from this artifact
yarn next:dev          # http://localhost:3000
```

Put a funded ECDSA testnet operator in `packages/nextjs/.env.local` (`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`) before you open the page.

The page opens on a guided tour: **Set up** the board, the security and its holders, have Officer 1 **Propose** a court order to freeze Holder A, **Approve** it as Officer 2 — or with your own wallet, if it was connected before setup and so became Officer 3 — **Break it** with four attempts the contracts refuse (each with a HashScan link), and carry out **More orders**: unfreeze, redeem, revoke KYC, pause. The **Sandbox** tab (`/?view=sandbox`) has every control on one page.

Setup costs about 31 testnet HBAR, 10 of which is not spent but moved into the demo officer and holder accounts as a float for their own transactions. Each order afterwards costs about 1.2 HBAR across its propose and approve.

Only one contract here is this template's own: `packages/foundry/contracts/OfficerBoard.sol`, 160 lines, with `yarn foundry:test` for its refusals. The security itself is deployed by the ATS factory already on testnet.
