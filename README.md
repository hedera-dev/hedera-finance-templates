# hcs-audit-trail

Publish an audit trail of security-token actions to a Hedera Consensus Service (HCS) topic that only authorised publishers can write to, carrying what the ledger cannot: why each action was taken, the authority behind it, and the hash of the document supporting it — plus the decisions that never reach the network at all, like a KYC review or a board approval. A regulator gets a live feed that verifies the trail from the public mirror node. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → HCS Audit Trail**.

```bash
npx scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/hcs-audit-trail
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
