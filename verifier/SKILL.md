# CLEARING HOUSE — Independent Compliance Verifier (agent skill)

Reusable, agent-callable infrastructure that answers **"was this settlement actually compliant?"**
from public chain data alone — sharing no code with the venue it audits.

## What it does
A tokenised-bond venue asserts that every trade it cleared was compliant. This skill reconstructs
that claim independently from two public sources it composes:
1. `MatchingEngine.SettlementReceipt` events — what actually cleared, and
2. the ATS identity-registry / control-list events — who was compliant, and at which block.

It then reconciles the venue's self-reported ledger against that reconstruction and flags any trade
that is **FABRICATED** (reported, never settled), **HIDDEN** (settled, not reported),
**MISREPORTED** (parties/amounts rewritten), or **NONCOMPLIANT** (settled while a party was not
verified at that block).

## MCP tools
| Tool | Input | Returns |
|---|---|---|
| `audit_venue` | — | Full reconciliation report: counts, per-trade findings, `clean` verdict. |
| `verify_trade` | `tradeId` (bytes32) | Verdict for one trade with evidence (block, reasons). |
| `list_settlements` | — | Ground-truth settlements cleared on-chain. |

## Run it
```bash
# 1. produce a deployment + ledger (local demo) — writes verifier/.local/local.json
bash scripts/local-demo.sh

# 2. start the MCP server (stdio)
pnpm --filter @clearing-house/verifier mcp

# or one-shot from the CLI
pnpm --filter @clearing-house/verifier audit
pnpm --filter @clearing-house/verifier exec tsx src/cli.ts trade 0x0000000000000000000000000000000000000000000000000000000000000001
```

## Point it at any chain
Set `CH_CONFIG` to a deployment JSON (`{ rpcUrl, engine, bondToken, cashToken, fromBlock }`) and
`CH_LEDGER` to the venue's reported ledger. The same reconstruction runs over local anvil, the
Hedera testnet JSON-RPC relay (`https://testnet.hashio.io/api`), or Arc — because the verifier only
reads logs.

## Why it's trustworthy
The verdict derives from `SettlementReceipt` + identity/control events — all public. To prove the
independence, the demo injects one lie into the venue's ledger; the verifier flags it by trade id
without ever consulting the venue's API. See `src/verify.ts` (the reconstruction) and
`test/verify.test.ts` (the falsification tests).
