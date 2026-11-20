# dvp-settlement

Settle a trade delivery-versus-payment on Hedera: the security leg and the stablecoin leg move in one scheduled native `TransferTransaction`, or neither moves. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → DvP Settlement**. That page also covers [dvp-settlement-evm](https://github.com/hedera-dev/hedera-finance-templates/tree/templates/dvp-settlement-evm), which settles the same trade with Asset Tokenization Studio holds and a settlement contract instead of a scheduled transfer. Read them side by side.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/dvp-settlement
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```

The page opens on a guided tour: **Set up** the market, have the Seller **Propose** a trade, **Sign** it as the Buyer so both legs settle in one transaction, **Break it** with three trades the network refuses (each with a HashScan link), and make **More trades**, including ones that settle at a set time. The **Sandbox** tab (`/?view=sandbox`) has every control on one page, including signing with HashPack. Setup costs about 48 testnet HBAR, 36 of it the fee for creating two tokens.
