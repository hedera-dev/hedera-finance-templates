# hedera-finance-templates

scaffold-hbar templates for the Hedera docs **Solutions → Finance Workflows** pages. Each docs page is paired with one template that runs on Hedera testnet.

## Install a template

Each template lives on its own `templates/<name>` branch, because `create-scaffold-hbar` only accepts `owner/repo#ref` and cannot install from a subdirectory:

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/<name>
```

## The templates

| Branch | What it builds | Hedera services |
| --- | --- | --- |
| `templates/dvp-settlement` | Settle a trade delivery-versus-payment: the security leg and the stablecoin leg move in one scheduled native `TransferTransaction`, or neither moves. No smart contracts. | HTS, Schedule Service |
| `templates/ats-bond` | Issue a tokenised bond through the Asset Tokenization Studio testnet factory, approve the investors allowed to hold it, and distribute to them. ATS deploys the bond from contracts already on testnet. | ATS, HTS |
| `templates/bond-coupons` | A bond contract that pays its own coupons: each payment schedules the next one (HIP-1215), coupons settle in an HTS stablecoin, and the last payment repays principal. No keepers or off-chain automation. | Schedule Service (HIP-1215), HTS |
| `templates/permissioned-security` | Issue a permissioned security token whose compliance rules are keys the network enforces — KYC, freeze, wipe, pause — and run a court-order freeze that takes two officers, since every admin key is 2-of-3. No smart contracts. | HTS |
| `templates/hcs-audit-trail` | Publish a tamper-evident audit trail of security-token actions to an HCS topic only authorised publishers can write to, and give a regulator a live feed that verifies itself from the public mirror node. No smart contracts. | HCS |

Every branch is a scaffold-hbar app (Next.js + TypeScript) with its own README covering setup and the testnet credentials it needs. All five are works in progress.

## This branch

`main` holds this index only. Template code never lands on `main`.
