# ATS bond

Replace the home page at `/` with a bond issuance desk. The issuer issues a
tokenised bond through Hedera's **Asset Tokenization Studio** (ATS) testnet
factory, approves the investors allowed to hold it, and distributes it to them.
ATS deploys each bond as an ERC-1400 security from audited contracts that are
already on testnet: this app deploys **no contracts of its own**.

Three parties:

- **Issuer** — the operator account the app runs with. Issues the bond, holds
  its admin, issuer and control-list roles, approves investors and distributes
  bonds.
- **Investors** — two demo investors the app creates: one the learner is
  expected to approve, one they are expected to leave unapproved.
- **Wallet investor** (optional) — the learner's own MetaMask account on Hedera
  testnet, which can be approved, receive bonds, and transfer them.

## What a user sees

**Layout.** The title and a short explanation span the top: what a tokenised
bond is, that ATS issues it from contracts already on Hedera, and that only
approved investors may hold it. Below them, on a window at least 1024px wide,
two columns scroll together with the page: what the learner *does* on the left
(the issue form, then investor actions), what the network *shows* on the right
(the bond, the investors, the activity log). Before a bond exists the right
column holds a placeholder card saying what will appear there. Narrower windows
stack the columns, controls first. Every card has a title and a one-sentence
caption. Form labels sit above their inputs.

**The issue form.** Inputs, each pre-filled with a value that works:

- `#bond-name` — default `Acme Corp 1Y Bond`
- `#bond-symbol` — default `ACME1Y`
- `#bond-isin` — default `US0378331005`; an ISIN whose check digit is wrong is
  refused before anything is signed, with a message saying so
- `#bond-face-value` — face value in USD per bond, whole number, default `1000`
- `#bond-maturity-months` — months until maturity, whole number `1`–`120`,
  default `12`
- `#bond-max-supply` — maximum number of bonds, whole number, default `1000`

and `#issue-bond`, labelled `Issue bond`. When the app has no operator
configured, `#issue-bond` is disabled and `#config-error` names the variables to
set: `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`.

**Issuing shows its progress** as a one-line-per-step checklist, each step an
element carrying its state in `data-status` (`pending`, `active`, `done`,
`failed`): `#issue-step-version` (resolve the bond configuration version),
`#issue-step-deploy` (deploy through the ATS factory), `#issue-step-investors`
(create the demo investors), `#issue-step-verify` (read the bond back). A
spinner marks the running step, a check and the ids it produced mark finished
ones, a cross marks a failure. The server reports each step as it starts and
finishes; the list reflects real progress. No step is left `active` once the run
has ended: a failure anywhere marks the step that was running as `failed`, so a
spinner never outlives the run. A one-line explanation per step sits
in a collapsed "What each step does" section that starts closed. The issue
button stays visible without scrolling. When issuing finishes the page scrolls
the bond into view.

**The bond.** Once issued:

- `#bond-address` — the bond's EVM address, and `#bond-contract-id` — its
  Hedera contract id, both linked to HashScan
- `#bond-terms` — name, symbol, ISIN, currency (`USD`), face value, start date,
  maturity date, as **read back from the bond contract**, not echoed from the
  form. The start date comes from the factory's `BondDeployed` event, which
  records the terms the bond was actually created with
- `#bond-supply` — total issued and maximum supply, read from the contract

**The investors.** `#investors` lists every investor as rows with the class
`investor-row`, each carrying `data-address`: a label (`Investor A`,
`Investor B`, or `Your wallet`), the Hedera account id (linked to HashScan) where
there is one, the EVM address, whether it is approved (`Approved` / `Not
approved`), and its bond balance read from the contract. Each row has:

- `Approve` (class `investor-approve`) and `Revoke` (class `investor-revoke`),
  one of which is enabled depending on its state
- an amount input (class `investor-amount`, whole number, default `100`) and
  `Issue` (class `investor-issue`)

`#action-error` carries the reason the last investor action was refused — the
decoded ATS error, for example `AccountIsBlocked(0x…)` — or the reason a request
failed outright. It is cleared when the next action starts. A refusal appears
there as well as in the activity log; an action that is refused is never silent.

**The wallet investor.** The header keeps the scaffold's RainbowKit connect
button, offering MetaMask (and WalletConnect); the burner wallet is removed.
`#add-wallet-investor`, labelled `Add my wallet as an investor`, appears once a
wallet is connected and adds a `Your wallet` row for its address. While a
wallet is connected and holds bonds, `#wallet-transfer` offers a transfer: a
recipient EVM address (`#transfer-to`), an amount (`#transfer-amount`) and
`#transfer-submit`, signed by the wallet. `#wallet-state` says in a sentence
what to do next: connect, switch MetaMask to Hedera testnet, add the wallet,
wait for approval, or transfer.

**The activity log.** `#activity` lists every action the desk performed, newest
first, as rows with the class `activity-entry`: time, what was done, the result
(`SUCCESS`, or the refusal decoded to its ATS error name, e.g.
`AccountIsBlocked`), and the transaction hash linked to HashScan when one was
sent.

## Behaviour

**Issuing deploys a real ATS bond.** `Issue bond` calls `deployBond` on the ATS
v8 testnet factory. The bond's terms on chain match the form: name, symbol,
ISIN, decimals `0`, currency `USD`, face value with 2 decimals (`1000` → stored
as `100000`), a starting date a few minutes in the future, maturity the chosen
number of months after issuing, the chosen maximum supply. The issuer holds
`DEFAULT_ADMIN_ROLE`, the issuer role and the control-list role, granted at
deployment. The bond's control list is an **allowlist**. Issuing again creates
a new bond and resets the desk to it.

**Only approved investors can hold the bond.** `Approve` adds the investor's
EVM address to the bond's control list; `Revoke` removes it. `Issue` mints bonds
to the investor: for an approved investor the balance and the total supply rise
by the amount; for an unapproved investor the bond refuses with
`AccountIsBlocked`, nothing is minted, and the refusal appears in the activity
log and as a readable message. Issuing beyond the maximum supply is refused too.

**A wallet investor holds and transfers under the same rules.** Once the
issuer approves the wallet's address and issues to it, the wallet's balance
shows it. A transfer signed by the wallet to an approved address succeeds; to an
unapproved address it is refused by the bond, and the page says so.

**Balances are read from the chain.** Every balance, the total supply and the
approval state are read from the bond contract, and refresh after each action
without a page reload.

**A value that could not be read is shown as unknown, never as a number.** When
a read fails, the investor's approval shows `Unknown` and its balance
`unavailable`; the issued total shows `unavailable`. Never `Not approved` and
never `0`: on a compliance desk those are claims about the chain, and a failed
read has made none. The bond keeps the terms read from it when it was issued,
and says that its live values could not be read. An investor whose approval is
unknown keeps both `Approve` and `Revoke` enabled, because the contract, not
the page, decides which one applies.

**Private keys never reach the browser.** No response the server sends contains
the operator key or a demo investor's key.

**Nothing half-rendered is ever shown.** No element above displays
`undefined`, `NaN`, `null`, or an empty value while visible; a control that is
working shows it and cannot be pressed twice.

## How this will be checked

1. Open `/` at 1024px or wider. Confirm the title on top, the two columns below
   (issue form left, placeholder right), and `#issue-bond` visible without
   scrolling.
2. Change `#bond-isin` to `US0378331006` and press `#issue-bond`: confirm it is
   refused before anything is signed with a message about the check digit. Put
   back `US0378331005`.
3. Press `#issue-bond` with the defaults. Watch the four steps reach `done`.
   Confirm `#bond-contract-id` exists on the mirror node as a contract, and that
   `#bond-terms` shows the entered name, symbol, ISIN, `USD`, face value `1000`
   and a maturity about 12 months out.
4. In `#investors`, approve `Investor A` and issue `100` to it. Confirm the row
   reads `Approved` with balance `100`, `#bond-supply` shows `100` issued, and
   the transaction appears in `#activity` with `SUCCESS` and on the mirror node
   as a successful contract call.
5. Issue `100` to `Investor B` without approving it. Confirm the refusal
   `AccountIsBlocked` in `#activity` and on the page, its balance `0`, and the
   total supply unchanged.
6. Approve `Investor B`, issue `50`, and confirm balance `50` and supply `150`.
   Revoke `Investor B` and confirm a further issue to it is refused again.
7. Inspect the responses the page received during all of the above for any
   private key.
8. Without connecting a wallet, confirm `#wallet-state` says to connect and
   `#add-wallet-investor` is not offered.

Connecting MetaMask and signing with it is **not** checked: the checker has no
MetaMask wallet. It is still part of the feature and must be implemented as
described.

## Constraints

- No contracts are deployed by this app and no Solidity package is added. The
  bond is deployed by the ATS factory.
- The new bond's address is taken from the factory's `BondDeployed` event in the
  deployment receipt, not from simulating `deployBond`. A simulation predicts the
  address against the state at that moment, and this factory is shared: anyone
  else deploying through it in between changes the address, which turned a
  successful deployment into a failed run and abandoned a bond that had just been
  paid for. The simulation is still run first — it is how a refusal is decoded
  before a transaction is sent — and its predicted address is only the fallback
  below.
- Every route is unauthenticated, and `POST /api/hedera/bond/activity` lets the
  browser write any activity row it likes — it exists because the wallet's
  transfer is signed client-side, so only the browser knows the outcome. Both are
  the bargain of a localhost tutorial: the desk spends the operator account and
  mints a real security, so this app is not meant to be reachable by anyone else.
  Adding a wallet as an investor is likewise taken on trust; no signature proves
  the address belongs to whoever asked.
- ATS on Hedera testnet, version 8: factory `0.0.9213391`, Business Logic
  Resolver `0.0.9212226`. Their EVM addresses are read from the mirror node
  (`/api/v1/contracts/<id>` → `evm_address`).
- The bond configuration id is
  `0x0000000000000000000000000000000000000000000000000000000000000002`. Its
  version must be resolved first with the resolver's
  `getLatestVersionByConfiguration(bytes32) returns (uint256)`: version `0`
  reverts with `VersionZero(bytes32)`.
- The published `@hashgraph/asset-tokenization-contracts` package has no
  Factory ABI; write the fragments by hand. `deployBond` takes
  `(BondData, FactoryRegulationData)` and returns the bond address:
  - `BondData` = `(SecurityData security, BondDetailsData bondDetails,
    address[] proceedRecipients, bytes[] proceedRecipientsData)`
  - `SecurityData` = `(address resolver, uint256 maxSupply,
    (bytes32 key, uint256 version) resolverProxyConfiguration,
    (string name, string symbol, string isin, uint8 decimals) erc20MetadataInfo,
    (bytes32 role, address[] members)[] rbacs, address[] externalPauses,
    address[] externalControlLists, address[] externalKycLists,
    address compliance, address identityRegistry, bool arePartitionsProtected,
    bool isMultiPartition, bool isControllable, bool isWhiteList,
    bool clearingActive, bool internalKycActivated, bool erc20VotesActivated)`
  - `BondDetailsData` = `(bytes3 currency, uint256 nominalValue,
    uint8 nominalValueDecimals, uint256 startingDate, uint256 maturityDate)`
  - `FactoryRegulationData` = `(uint8 regulationType, uint8 regulationSubType,
    (bool countriesControlListType, string listOfCountries, string info)
    additionalSecurityData)`; use `1` (REG_S) and `0`
  - compliance and identity registry are the zero address; external lists empty;
    `isWhiteList` true; `isControllable` true; the rest false
- The factory's `BondDeployed` event indexes only the deployer, so the bond
  address cannot be filtered out of the logs. It is still in the event data:
  decode the factory's logs in the receipt. A receipt with no `BondDeployed`
  event may use the address from that pre-send simulation only when the receipt
  also contains logs emitted by that address; otherwise the run fails.
- Roles granted in `rbacs` at deployment, all to the issuer:
  `DEFAULT_ADMIN_ROLE` (`0x00…00`),
  issuer role `0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f`,
  control-list role `0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d`.
- On the bond: `addToControlList(address)`, `removeFromControlList(address)`,
  `isInControlList(address)`, `getControlListType()` (true = allowlist),
  `issue(address holder, uint256 amount, bytes data)` with data `0x`,
  `transfer`, `balanceOf`, `totalSupply`, `name`, `symbol`,
  `getERC20Metadata()`, `getNominalValue()`, `getNominalValueDecimals()`,
  `getNominalValueCurrency()`, `getMaturityDate()`. Custom errors to decode and
  show by name include `AccountIsBlocked(address)`, `ListedAccount(address)`,
  `UnlistedAccount(address)`, `WrongISIN(string)`, `WrongISINChecksum(string)`,
  `WrongDates(uint256,uint256)`, `VersionZero(bytes32)`.
- Every issuer transaction is signed on the server with the operator key, over
  Hedera's JSON-RPC relay `https://testnet.hashio.io/api`, using `viem`, which
  the project already depends on. Hedera charges for at least 80% of a
  transaction's gas limit, so set limits close to need: a bond deployment uses
  about 7.2M gas (limit `8000000`); control-list and issue calls far less.
  Expect about 7.4 HBAR per bond.
- `HEDERA_OPERATOR_KEY` must be an ECDSA key — raw hex with or without `0x`, or
  DER-encoded ECDSA — because JSON-RPC transactions are ECDSA-signed. An ED25519
  key is refused at start with a readable `#config-error`.
- Demo investors are Hedera accounts the app creates with ECDSA keys and an EVM
  address set from the public key, funded with at most `1` HBAR each (they sign
  nothing). Their keys stay on the server.
- Server routes live under `packages/nextjs/app/api/`, following the pattern in
  `packages/nextjs/app/api/hedera/`. The browser signs only the wallet
  investor's own transfers, through wagmi.
- Keeping the desk's state (bond address, demo investors, activity) in server
  memory is fine; it need not survive a restart.
- No new dependencies. Testnet only.

## Out of scope

- Coupons, dividends and other corporate actions; redemption at maturity.
- KYC with verifiable credentials, ERC-3643 identity, external control lists.
- Equity and the other bond types (fixed rate, KPI-linked).
- HashPack or other non-EVM wallets for the wallet investor.
