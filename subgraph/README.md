# CLEARING HOUSE subgraph

Composes two independent on-chain products and reconstructs per-trade compliance **in the index** —
so the venue's compliance claim is provable from data it doesn't control:

1. **the venue** — `MatchingEngine.SettlementReceipt` (what actually cleared), and
2. **the securities** — `Verified` / `Blocked` identity/control events from the bond *and* cash ATS
   tokens (who was compliant, and when).

`handleSettlementReceipt` joins them: for every settlement it replays the identity/control state of
each party at that block and writes `reconstructedCompliant` + `reason` — derived here, never read
from the venue. `VenueStat` then tallies `compliantCount` / `nonCompliantCount` independently.

## Live on Hedera testnet

Indexed off live Hedera testnet through a self-hosted Graph node (Hashio JSON-RPC). The network name
`hedera-testnet` and the addresses come from `networks.json` (the source-verified deployment).

```bash
docker compose up -d                                   # graph-node + ipfs + postgres, pointed at Hashio
pnpm codegen && pnpm build
pnpm exec graph create --node http://localhost:8020/ clearing-house
pnpm exec graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 \
  --network hedera-testnet --version-label v0.0.1 clearing-house
# → http://localhost:8000/subgraphs/name/clearing-house/graphql
```

It syncs from `startBlock 40252086` to the chain head and stays healthy.

### The composition, queried live

```graphql
{
  venueStats { settledCount compliantCount nonCompliantCount }
  settlements(orderBy: blockNumber) {
    tradeId seller buyer quantity cashAmount reconstructedCompliant reason blockNumber
  }
  complianceEvents(orderBy: blockNumber) { token account kind status blockNumber }
}
```

Returns (this deployment):

```json
{
  "venueStats": [{ "settledCount": "2", "compliantCount": "2", "nonCompliantCount": "0" }],
  "settlements": [
    { "tradeId": "0x…0001", "quantity": "10", "cashAmount": "1000", "reconstructedCompliant": true, "reason": "" },
    { "tradeId": "0x…0002", "quantity": "10", "cashAmount": "1000", "reconstructedCompliant": true, "reason": "" }
  ],
  "complianceEvents": [ /* … incl. the KYC revoke (status:false) + re-grant on the bond token … */ ]
}
```

The index picked up the MOMENT-2 KYC revoke/re-grant on the bond token — the identity stream the
reconstruction reasons over.

## Reusable infrastructure

The verifier (`../verifier`, `SKILL.md`) reconstructs the *same* compliance from the *same* public
facts with zero shared code — the subgraph is one data source it can read (alongside raw RPC), so the
"catch the venue lying" check runs against the index too. A Studio / decentralized-network deploy is
the identical manifest wherever Hedera is a supported chain.
