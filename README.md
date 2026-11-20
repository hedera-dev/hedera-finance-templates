# hedera-finance-templates

scaffold-hbar templates for the Hedera docs **Solutions → Finance Workflows** pages. Each docs page is paired with a template that runs on Hedera testnet.

## Install a template

Each template lives on its own `templates/<name>` branch, because `scaffold-hbar` only accepts `owner/repo#ref` and cannot install from a subdirectory:

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/<name>
```

## The templates

| Branch | What it builds | Approach |
| --- | --- | --- |
| `templates/dvp-settlement` | Settle a trade delivery-versus-payment: the security leg and the stablecoin leg move in one scheduled native `TransferTransaction`, or neither moves. | HTS, Schedule Service. No contracts |
| `templates/dvp-settlement-evm` | The same trade, settled by a contract: each leg is encumbered where it already sits by an ATS or Stablecoin Studio hold, and one settlement contract executes both together or neither. | ATS, Stablecoin Studio, one own contract |
| `templates/regulated-token` | Issue a regulated token whose compliance rules are keys the network enforces — KYC, freeze, wipe, pause — and run a court-order freeze that takes two officers, since every admin key is 2-of-3. | HTS threshold keys. No contracts |
| `templates/regulated-token-evm` | The same register, run by a contract: the security's KYC, freeze, controller and pause roles belong to a 2-of-3 `OfficerBoard`, so a court order still takes two officers and no officer holds a role alone. | ATS, one own contract |
| `templates/ats-bond` | Issue a tokenised bond through the Asset Tokenization Studio testnet factory, approve the investors allowed to hold it, and distribute to them. ATS deploys the bond from contracts already on testnet. | ATS, HTS |
| `templates/bond-coupons` | A bond contract that pays its own coupons: each payment schedules the next one (HIP-1215), coupons settle in an HTS stablecoin, and the last payment repays principal. No keepers or off-chain automation. | Schedule Service (HIP-1215), HTS |
| `templates/collateral-mobility` | Pledge a tokenised T-bill as collateral without it leaving its owner's account: an ATS hold encumbers it in place, and the repo contract takes no custody and holds no role on the bill. | ATS, Stablecoin Studio, one own contract |
| `templates/hcs-audit-trail` | Publish a tamper-evident audit trail of security-token actions to an HCS topic only authorised publishers can write to, and give a regulator a live feed that verifies itself from the public mirror node. | HCS. No contracts |

Four of these are two stories told twice. `dvp-settlement` and `regulated-token` do it with Hedera's native services and no contracts at all; `dvp-settlement-evm` and `regulated-token-evm` do the same thing through the Asset Tokenization Studio and a contract of their own. Each pair shares a docs page, so the two can be read side by side.

Every branch is a scaffold-hbar app (Next.js + TypeScript) carrying the finished app, verified against Hedera testnet. The `-evm` branches add a Foundry package for the one contract they own. Each app needs a funded testnet account in `packages/nextjs/.env.local` as `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`; its docs page covers the rest.

## This branch

`main` holds this index only. Template code never lands on `main`.
