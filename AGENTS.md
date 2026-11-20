# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a Scaffold-HBAR dApp with a **Foundry package**: Next.js App Router, wallet connect, and Hedera networks (testnet, mainnet). The security is deployed through the Asset Tokenization Studio (ATS) factory and the cash through the Stablecoin Studio factory, both already on testnet, and both are reached over the JSON-RPC relay with viem; the only contract this repo owns is `DvpSettlement`, which escrows a hold on each token and executes the two together. The mirror node answers reads the relay cannot.

Use the package manager this project was created with (`packageManager` in the root `package.json`, or the lockfile). Examples use `yarn`; if the app was created with npm, swap `yarn <script>` for `npm run <script>`.

## Commands

```bash
yarn next:dev         # http://localhost:3000
yarn next:build
yarn next:check-types
yarn foundry:compile  # the desk deploys the settlement contract from this artifact, so run it before the build
yarn foundry:test
yarn lint
yarn format
```

## Layout

- `packages/nextjs` is the app (App Router, RainbowKit, Wagmi, Viem, DaisyUI)
- `packages/foundry` holds `DvpSettlement.sol`, the two token interfaces, the mocks and the tests
- Pages: `packages/nextjs/app/`
- Server-only Hedera code (operator key): API routes under `packages/nextjs/app/api/`; never import the operator key into client components
- ATS and Stablecoin Studio interface shapes come from the `v.8.0.0-ats` tag of `hashgraph/asset-tokenization-studio` and from `hashgraph/stablecoin-studio`, never from a guess: ATS's `main` has drifted from the factory deployed on testnet

### UI

Use `@scaffold-hbar-ui/components` for web3 UI: `Address`, `AddressInput`, `Balance`, `EtherInput`, `IntegerInput`.

Use DaisyUI classes, not raw Tailwind when a DaisyUI component exists:

```tsx
<button className="btn btn-primary">Connect</button>
```

### Networks

- Next.js: `packages/nextjs/scaffold.config.ts` (target networks, polling, RPC overrides, WalletConnect)

## Style

| Style | Use |
| --- | --- |
| `UpperCamelCase` | types, components |
| `lowerCamelCase` | variables, functions |
| `CONSTANT_CASE` | constants |

Next.js imports use the `~~` alias:

```tsx
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
```

App Router pages live under `packages/nextjs/app/`. Add `"use client"` when the page uses hooks.

Prefer `type` over `interface`. No `T` prefix on types. Let TypeScript infer when it can. Comments should add information.
