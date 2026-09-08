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

## Honest scope

- The bond here is `MockATSSecurity` — a **faithful** stand-in that reproduces the ATS hold +
  compliance semantics verbatim (`executeHoldByPartition` gating on `msg.sender == hold.escrow`,
  `onlyCompliant(0, to)`, the real `0x10 · AddressNotVerified`), verified against source in
  [`specs/ats-mechanism.md`](../specs/ats-mechanism.md). Issuing the bond through the **real ATS
  Factory** `0.0.9213391` (so the "issued via ATS" gate is literal, not just interface-faithful) is
  the next step — the `ISettlementLeg`/`IATSSecurity` seam means the venue contracts don't change.
- Fresh contracts are deployed per run for clean hold-id state; the addresses above are that run
  (and are the source-verified ones).
