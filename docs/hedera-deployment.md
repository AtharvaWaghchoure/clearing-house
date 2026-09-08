# Live on Hedera testnet

The venue is deployed and clearing real settlements on Hedera testnet (chain `296`, via the Hashio
JSON-RPC relay). Reproduce with:

```bash
pnpm --filter @clearing-house/verifier exec tsx src/deploy/hedera.ts   # needs a funded .env
```

The script provisions two counterparties via the Hedera SDK (`AccountCreateTransaction` with the
ECDSA key's EVM alias — an EVM value-transfer does **not** create an account on Hedera), deploys the
venue, issues + KYCs, clears two atomic delivery-versus-payment trades, then revokes the buyer's KYC
and shows the identical order refuse itself with the named reason.

## Deployment (run of 2026-09-08)

| Contract | EVM address | HashScan | Source |
|---|---|---|---|
| `MatchingEngine` | `0xa73690cb94d03ee05a68fd2de753964b73a7072a` | [contract](https://hashscan.io/testnet/contract/0xa73690cb94d03ee05a68fd2de753964b73a7072a) | ✅ exact match |
| `HederaHoldLeg` (escrow) | `0x90775920812cc4726c75e651fe30bc2606f78dee` | [contract](https://hashscan.io/testnet/contract/0x90775920812cc4726c75e651fe30bc2606f78dee) | ✅ exact match |
| Bond token (ATS-faithful) | `0x4f76877d98db72102127fab8b0a1e7fedf763604` | [contract](https://hashscan.io/testnet/contract/0x4f76877d98db72102127fab8b0a1e7fedf763604) | ✅ exact match |
| Cash token (deposit) | `0xa6491faaf3f5ef0b582e2a865ca6e3b993d09f79` | [contract](https://hashscan.io/testnet/contract/0xa6491faaf3f5ef0b582e2a865ca6e3b993d09f79) | ✅ exact match |

All four are **source-verified** on Sourcify (which HashScan reads) with an **exact bytecode match** —
compiled with solc `0.8.24+commit.e11b9ed9`, optimizer 200, `evm_version=paris`. Reproduce with
`bash scripts/verify-hedera.sh`.

Accounts: operator `0.0.10413613` (`0x5eb6…5993`), seller `0.0.10417883` (`0x0B93…05Ac`), buyer
`0.0.10417884` (`0xA32A…7e9E`).

## What cleared

**Two atomic DvP settlements** — each one transaction where the bond moves to the buyer *and* the
cash moves to the seller, or neither does:

| Trade | Settle tx | Result |
|---|---|---|
| `0x…0001` | [`0x9fa94842…`](https://hashscan.io/testnet/transaction/0x9fa94842e3b56e88f1f112cf88b9557d0c1d7df1aeb7633213ad22fec977bb72) | `SUCCESS` |
| `0x…0002` | [`0xdf77edaa…`](https://hashscan.io/testnet/transaction/0xdf77edaa9a73a8286af2dbc37a8e08ae1d3dd06a5edc5c6d75f1e816ff588cb0) | `SUCCESS` |

**One compliance rejection** — after the issuer revokes the buyer's KYC, the *identical* order
pre-flights to `0x10 · DISALLOWED_OR_STOP · AddressNotVerified` and `settle()` refuses. Nothing moves.

## Independent proof (mirror node, not our script)

The `SettlementReceipt` events read straight from Hedera's mirror node — topic0
`0x3f98230f…` = `keccak(SettlementReceipt(bytes32,address,address,address,uint256,address,uint256,bytes1,bytes1))`:

```
GET https://testnet.mirrornode.hedera.com/api/v1/contracts/0xa736…072a/results/logs
  ✔ SettlementReceipt tradeId=0x…0001 bondToken=0x4f76…3604 seller=0x0b93…05ac block=40252121
  ✔ SettlementReceipt tradeId=0x…0002 bondToken=0x4f76…3604 seller=0x0b93…05ac block=40252131
GET .../contracts/results/0x9fa94842…  →  status 0x1 · SUCCESS
GET .../contracts/results/0xdf77edaa…  →  status 0x1 · SUCCESS
```

## The independent index runs on this data

The verifier reconstructs each settlement's compliance from Hedera's public logs — sharing no venue
code — and reconciles it against the venue's report:

```bash
pnpm --filter @clearing-house/verifier exec tsx src/deploy/hedera-audit.ts
# → reads 2 SettlementReceipt(s) + token identity logs from Hedera
# → honest report:     both CONFIRMED_COMPLIANT (blocks 40252121 / 40252131)
# → fabricated report: FABRICATED 0x…019d caught by id
# writes .local/hedera-config.json + hedera-ledger.json, so the CLI / MCP point at Hedera:
pnpm --filter @clearing-house/verifier exec tsx src/cli.ts audit \
  --config .local/hedera-config.json --ledger .local/hedera-ledger.honest.json
```

The subgraph is wired to the same addresses (`subgraph/networks.json`, `startBlock 40252086`) and
compiles against `hedera-testnet` (`graph build --network hedera-testnet` → real addresses in
`build/subgraph.yaml`). Publishing it to a hosted Graph node is the one remaining step (needs a
graph-node endpoint / Studio deploy key).

## Real bond issued via the ATS Factory

A compliant bond issued through the **real** Hedera ATS Factory `0.0.9213391` (not the mock),
reusing the on-chain BLR `0.0.9212226` as its business-logic resolver:

| | |
|---|---|
| Bond diamond | `0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a` (`0.0.10418524`) — [HashScan](https://hashscan.io/testnet/contract/0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a) |
| deployBond tx | [`0xfbadfcd2…`](https://hashscan.io/testnet/transaction/0xfbadfcd2dc0eda905ebd7b04f8c63983ca5d7d7fbda26a1d54d7803a7f0d4d2c) · `SUCCESS`, 6.98M gas |
| Live facets | `name()` = "HELVETIA 4.25% 15FEB2031", `symbol()` = "HELV31", `decimals()` = 6, `isControllable()` = true |
| Config | `BOND_CONFIG_ID` v1 · REG_S/NONE · `clearingActive=false` (holds enabled) · `ISIN US0378331005` |

`contracts/src/interfaces/ats/IATSFactory.sol` copies the `deployBond` config structs verbatim from
ATS source (field order == ABI encoding); `verifier/src/deploy/ats-bond.ts` simulates then deploys.
Because delivery is *any* ATS hold, the venue's `HederaHoldLeg` + `MatchingEngine` settle this real
diamond with no code change — the `IATSSecurity` seam holds.

## Honest scope

- The bond **settled** in the two atomic trades above is `MockATSSecurity` — a **faithful** stand-in
  reproducing the ATS hold + compliance semantics verbatim (`executeHoldByPartition` gating on
  `msg.sender == hold.escrow`, `onlyCompliant(0, to)`, the real `0x10 · AddressNotVerified`), verified
  against source in [`specs/ats-mechanism.md`](../specs/ats-mechanism.md). Separately, a **real** bond
  is now issued through the ATS Factory (above); wiring the venue to settle *that* diamond
  end-to-end (mint + internal-KYC grants + hold) is the remaining lifecycle step.
- Fresh contracts are deployed per run for clean hold-id state; the addresses above are that run
  (and are the source-verified ones).
