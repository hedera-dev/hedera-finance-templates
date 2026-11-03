# hcs-audit-trail

Publish a tamper-evident audit trail of security-token actions to a Hedera Consensus Service (HCS) topic that only authorised publishers can write to, and give a regulator a live feed that verifies itself from the public mirror node. No smart contracts.

Paired with the Hedera docs page **Solutions → Finance Workflows → Publish a tamper-evident audit trail and regulator feed with HCS**.

```bash
npx create-scaffold-hbar@latest --template hedera-dev/hedera-finance-templates#templates/hcs-audit-trail
```

```bash
yarn install
yarn next:dev   # http://localhost:3000
```
