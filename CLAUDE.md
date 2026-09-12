# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

CLEARING HOUSE is a tokenised-bond settlement venue: one transaction moves the bond **and** the cash
or neither, with compliance checked *inside* that transaction, and an independent index that can
prove the venue never cleared a non-compliant trade. Built for ETHOnline 2026 (Hedera · The Graph ·
Arc). `README.md` leads with the idea; `specs/architecture.md` and `BUILD_PLAN.md` carry the detail.

**Everything hangs off one interface — `contracts/src/interfaces/ISettlementLeg.sol`.** Read it
first. `MatchingEngine` talks only to `ISettlementLeg`, so swapping the cash rail is one `setLegs`
call, not a rewrite. When adding a chain/rail, implement `ISettlementLeg` — do not add a branch to
the engine.

Two rules the interface imposes, and both are load-bearing:
- `preflight()` **MUST NOT revert** — the UI calls it before asking anyone to sign, so a rejection
  shows a named reason (`0x10 · DISALLOWED_OR_STOP · AddressNotVerified`) instead of "failed".
- `execute()` **MUST revert** on any failure, so the EVM unwinds the other leg. There is no code
  path that leaves one leg settled.

## Layout

| Path | What |
|---|---|
| `contracts/` | Foundry. `MatchingEngine.sol`, `legs/{HederaHoldLeg,ArcMemoLeg}.sol`, ATS/Arc interfaces, 15 tests. **Not** a pnpm workspace member. |
| `app/` | Next.js 14 App Router terminal + venue backend. Live against Hedera testnet. |
| `verifier/` | Independent verifier — CLI (`ch-verify`), MCP server, anvil e2e demo, Hedera/Arc deploy scripts. |
| `subgraph/` | The Graph subgraph; reconstructs per-trade compliance in-mapping. |
| `services/nav-x402/` | x402-paywalled NAV endpoint (Blocky402). |
| `specs/` | Source-verified mechanism notes for ATS and Arc. Check these before guessing at ATS behaviour. |
| `docs/` | Hedera account setup, live deployment records. |

pnpm workspace = `verifier`, `subgraph`, `services/*`, `app`.

## Commands

```bash
pnpm install

forge test --root contracts                    # 15 Solidity tests (verified green)
pnpm --filter @clearing-house/verifier test    # 5 verifier tests (vitest)

bash scripts/local-demo.sh                     # one command: anvil + deploy + 3 trades + rejection + audit
pnpm --filter @clearing-house/app dev          # terminal on http://localhost:3737

pnpm --filter @clearing-house/verifier audit   # ch-verify against verifier/.local/*.json
pnpm --filter @clearing-house/verifier mcp     # MCP server over stdio
cd subgraph && pnpm codegen && pnpm build
bash scripts/verify-hedera.sh                  # Sourcify v2 source verification of the last Hedera deploy
```

Deploy scripts are `tsx` entrypoints under `verifier/src/deploy/` (`hedera.ts`, `ats-bond.ts`,
`ats-settle.ts`, `arc.ts`) and need a funded `.env` — see `docs/hedera-setup.md`.

There is no repo-wide lint or typecheck task; `app` has `next lint`, and TS builds are per-package.

## Conventions and gotchas

**Contracts**
- `evm_version = "paris"` in `contracts/foundry.toml` is deliberate — it keeps PUSH0/transient
  storage out of the bytecode so the same artifact deploys on both the Hedera testnet EVM and Arc.
  Do not bump it without checking both targets.
- EIP-1066 status bytes are mirrored from ATS in `contracts/src/lib/Eip1066.sol`; keep them exact so
  on-chain codes round-trip.
- **Never redeploy the ATS BLR** (`0.0.9212226`, ~180M gas) or the Factory (`0.0.9213391`). Reuse
  the IDs in `.env.example`.
- `HederaHoldLeg.preflight` treats `0x54 · INSUFFICIENT_FUNDS` as passing on purpose — the sender's
  free balance is short precisely because the amount sits in the hold. Read the doc comment before
  touching it.
- Arc's `Memo` routes through the CallFrom precompile, which only lets an EOA spoof *itself*, so on
  real Arc the **payer** submits `memo(...)` directly; `ArcMemoLeg` is the reference for that exact
  wrapped calldata. Don't "fix" it to be engine-driven on live Arc.

**Secrets and env**
- One `.env` at the repo root, shared by the verifier, deploy scripts and the app. `.env.example`
  documents it. Keep every value on its own line — **no trailing inline comments**, the parsers fold
  them into the value.
- `app/lib/server/env.ts` backfills the app's env from `../.env` in dev without overriding real
  deploy env.
- `app/lib/server/*` is server-only and throws if it is ever evaluated in a browser. The operator
  key must never reach the client; only import those modules from API route handlers.

**The app**
- Live venue addresses are in `app/lib/chain.ts` (`VENUE`) — that is the single source of truth for
  the deployed engine/leg/tokens. `INSTRUMENT` and `DESKS` in `app/lib/accounts.ts` are display
  metadata bound to the deterministic anvil accounts; their token addresses are *not* the live ones.
- Hedera log reads go through the **mirror node** (range-tolerant); point reads (balances,
  eligibility) go through the Hashio relay. The mirror node rejects topic0 filtering without a
  timestamp bound, so `app/lib/onchain.ts` pulls all logs per contract and filters client-side.
- The order book is off-chain by design (`app/lib/server/store.ts`: Redis when `REDIS_URL` is set,
  in-memory otherwise). `settle()` is the only on-chain write a trade makes. The user signs only
  their own ATS hold; the operator signs onboarding and settlement server-side.
- `/api/venue/onboard` is a public testnet faucet with a per-address cooldown *and* a rolling-window
  circuit breaker — both live in the shared store so they hold across restarts and instances. The
  cooldown must stay longer than the onboard's own ~35s latency or it lapses before it can throttle.

**The verifier's independence is the product**
- `verifier/src/verify.ts` and its port `app/lib/verify.ts` must derive verdicts from public facts
  only (`SettlementReceipt` + ATS `Verified`/`Blocked` logs). Never let them read venue state, and
  keep the two in sync when the reconstruction changes.
- `app/app/api/venue/report/route.ts` introduces the demo's lie **server-side** so the client
  verifier genuinely catches the backend rather than itself.
- The subgraph reconstructs the same compliance independently in `handleSettlementReceipt`; it must
  never read the venue's claim.

**Drift to watch**: `subgraph/networks.json` still points at the original bond/cash tokens
(`0x4f76…`, `0xa649…`); the app uses the redeployed pair (`0x4131…`, `0xb91f…`) that supports hold
release. Re-check both when touching either.

**Commits**: `type(scope): lowercase summary` — e.g. `feat(app):`, `refactor(receipt):`,
`chore(hedera):`.

**Claims in docs must stay true.** The README, specs and `docs/` cite real tx hashes and addresses;
if you change behaviour, update the corresponding record rather than leaving a stale claim.
