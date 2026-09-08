# CLEARING HOUSE — Build Plan

> A tokenised-bond settlement venue where the trade and the cash never move separately.
> Compliance is checked **inside** the same transaction that settles both legs, and the
> venue proves — from an index it does not control — that no non-compliant trade ever cleared.

**Event:** ETHOnline 2026 · **Sponsors:** Hedera · The Graph · Arc (Circle)
**Source spec:** private idea notes (local, not published)

---

## 0. The one thesis (do not lose this)

Everything is built around a **single seam**: the `ISettlementLeg` interface.

```
MatchingEngine.settle(orderA, orderB)
  ├─ pre-flight: canTransferByPartition  → EIP-1066 reason code (compliance)
  ├─ legA.execute()  ⟶  legB.execute()   → atomic: both or neither (DvP)
  └─ emit SettlementReceipt              → indexed independently (proof)
```

- **Delivery leg** (the bond) is *always* a Hedera ATS `Hold` — gated on `msg.sender == hold.escrow`, so the matcher needs **no role, no whitelist, no issuer trust**.
- **Payment leg** is *adapter-swapped*: `HederaHoldLeg` (ATS deposit-token) or `ArcMemoLeg` (USDC via Arc `Memo`).
- The README leads with this seam so the project reads as **one idea**, not three integrations.

---

## 1. Verified ground truth (checked 2026-09-07)

| Fact | Status |
|---|---|
| ATS repo `hashgraph/asset-tokenization-studio` | ✅ live, default branch `main`, pushed 2026-08-21, 76 open issues |
| BLR `0.0.9212226` | ✅ live on testnet → EVM `0xba2d5fc2083a0b8f164c50e65d782087fba18e0a` |
| Factory `0.0.9213391` | ✅ live on testnet → EVM `0xd1f118a40f3b02883d35909ef2517e7edd78379d` |
| HSS schedule precompile `0.0.363` | system precompile (not in mirror contract index — expected) |
| Hedera testnet mirror node | ✅ reachable |

**Do NOT** redeploy the BLR (~180M gas / ~28 min). Reuse the two IDs above.

**Still to verify against cloned source (Phase 0):** exact signatures of `createHoldByPartition`,
`executeHoldByPartition`, `canTransferByPartition`, the `Hold` struct, and the
`onlyClearingDisabled` ↔ hold mutual-exclusion. These drive the contract code.

---

## 2. Prize map → build priority (EV-ordered)

| # | Prize line | $ | What earns it | Priority |
|---|---|---|---|---|
| 1 | Hedera — Tokenization of Anything | 6,000 | ATS bond + atomic DvP + compliance rejection | **P0 must-ship** |
| 2 | Hedera — Improve the Harness | 2,000 | one PR (`chainAssertions`), unmerged OK | **P0 cheap win** |
| 3 | The Graph — Composable | 5,000 | subgraph: ATS events + HCS receipts + Arc logs | P1 |
| 4 | The Graph — AI Tooling | 5,000 | independent verifier as agent-callable MCP | P1 |
| 5 | Arc — Stablecoin Pool | 2,500 | USDC settlement leg on Arc | P2 |
| 6 | Arc — Agentic Economy | 2,500 | agent settles/queries via the venue | P2 |
| 7 | Arc — Testnet→Mainnet | 5,000 | redeploy to Arc mainnet Sep 16–30 | P2 (smallest field) |
| 8 | Hedera — AI & Agentic Pmts (x402) | 6,000 | NAV endpoint behind Blocky402 | P3 free-roll |

**Realistic EV ≈ $2,000–2,800.** P0 alone = two prize lines and the whole demo spine.

---

## 3. Build phases (with acceptance criteria)

### Phase 0 — Foundation  ✅ DONE
- [x] Verify deployed contracts + repo
- [x] Shallow-clone ATS into `_reference/ats` (gitignored) for real interfaces
- [x] `git init`; Foundry project under `contracts/`; forge-std vendored
- [x] Extract the minimal ATS interfaces into `contracts/src/interfaces/ats/`
- **Accept:** ✅ `forge build` compiles clean.

### Phase 1 — Core DvP (P0)  ← the spine  ✅ CONTRACTS DONE / ⏳ deploy pending
- [x] `ISettlementLeg` interface + `SettlementReceipt` event
- [x] `HederaHoldLeg` (execute an ATS `executeHoldByPartition` as escrow)
- [x] `MatchingEngine.settle()`: pre-flight `canTransferByPartition` → revert with EIP-1066 code; execute both legs atomically; emit receipt
- [x] Foundry tests vs **mock ATS**: (a) atomic DvP ✅, (b) KYC-revoked buyer → revert with the REAL `0x10 DISALLOWED_OR_STOP · AddressNotVerified` (doc's `0x56` was fictional) ✅, (c) one leg fails → whole tx reverts ✅ — **9 tests pass**
- [ ] Deploy/interaction scripts (viem) → Hedera testnet, reusing BLR/Factory  ← execution-gated on a funded key
- [ ] Issue a real bond via ATS Factory; place two holds; fire one `settle` tx
- [ ] HashScan verification of my contracts
- **Accept:** one testnet tx where both legs move; a second where the same order rejects with a *named* reason. (Local anvil e2e can prove the logic without a Hedera key.)

### Phase 2 — Harness PR (P0, cheap)
- [ ] Reproduce the harness gap (`CHAIN` validates nothing → `chainAssertions`)
- [ ] Open PR to the harness repo with README + repro; link it
- **Accept:** PR URL exists (unmerged fine).

### Phase 3 — The Graph (P1)  ✅ CODE DONE / ⏳ live-data pending deploy
- [x] Subgraph: composes `SettlementReceipt` + ATS `Verified`/`Blocked` from both tokens; reconstructs compliance in-mapping — `graph codegen && graph build` pass
- [x] Independent **verifier**: reconstructs "was trade N compliant?" from public logs, shares zero venue code — **5 tests pass**
- [x] Agent-callable **MCP** wrapper (`audit_venue`/`verify_trade`/`list_settlements`) + `SKILL.md` — handshake verified
- [x] Demo: fabricated trade → verifier flags it by id (runs in the local e2e)
- **Accept:** ✅ verifier catches the injected lie by id (local). Live subgraph query pending Hedera deploy.

### Phase 4 — Arc leg (P2)  ✅ CONTRACT DONE / ⏳ deploy pending
- [x] `ArcMemoLeg`: settle USDC through Arc `Memo` so `Transfer` emits from payer EOA with indexed trade ref — **6 tests pass**, CallFrom precompile emulated in the mock
- [ ] Deploy on Arc testnet; architecture diagram; name the exact bounty in each Arc submission
- [ ] (Sep 16–30) push to Arc mainnet, post tx
- **Accept:** USDC settlement tx on Arc carrying the trade id in an indexed log from the payer's own address.

### Phase 5 — Additive
- [ ] Scheduled coupons/maturity via HSS `scheduleCall` (self-rescheduling; **guard the return value**)
- [ ] Chainlink HBAR/USD proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` for pricing
- [ ] x402 NAV endpoint settled through Blocky402 (`https://api.testnet.blocky402.com`, **no `/v1`**, **not** `x402.org/facilitator`)

### Phase 6 — Product & submission polish
- [x] Order-book frontend (Next.js + viem) under `app/`: live book, atomic Match & Settle, compliance **pre-flight register** showing the named EIP-1066 reason before signing, swappable Hedera⇆Arc rail, independent-verifier panel (with a real venue backend that can be caught lying) — `next build` clean, backend API verified. Faithful in-browser model of the contract; live-mode viem path documented.
- [ ] README leading with the `ISettlementLeg` seam
- [ ] `/specs` + AI attribution; 2:00–4:00 demo video script
- [ ] Fill the compliance checklist (§5)

---

## 4. Repo layout

```
.
├── contracts/          Foundry — settlement contracts + ATS interfaces + tests + deploy scripts
├── app/                Next.js order-book frontend
├── subgraph/           The Graph subgraph (schema + mappings)
├── verifier/           Independent compliance verifier + MCP server + SKILL.md
├── services/nav-x402/  x402 NAV endpoint (Blocky402)
├── harness-pr/         The chainAssertions harness contribution (+ PR notes)
├── specs/              AI attribution, design notes, demo script
└── _reference/         Cloned upstream (ATS) — gitignored, reference only
```

## 5. Compliance checklist (qualification gates)
- [ ] Continuous commit history through the event
- [ ] ATS used to issue/manage a tokenised asset on Hedera **testnet**
- [ ] Contracts **verified on HashScan** (manual)
- [ ] Video: issuance + configuration + ≥1 lifecycle op (transfer / compliance check / distribution)
- [ ] Harness: PR link + README explaining problem & how to run
- [ ] x402: ≥1 real paid request through **Blocky402** + README of the flow
- [ ] Graph: live data, composition of 2+ products explicit, reusable infra + `SKILL.md`
- [ ] Arc: working frontend **and** backend + architecture diagram + name the bounty
- [ ] Arc mainnet: return Sep 16–30, post mainnet link/tx

## 6. Known risks (from spec)
- **Over-scope is the #1 failure mode** → P0 first, everything else additive; ship the cut order cleanly.
- Holds vs clearing mode are **mutually exclusive** → verify the dual-leg atomic path doesn't trip `onlyClearingDisabled`.
- `scheduleCall` **never reverts** → must check its return code or recurrence silently dies.
- Compliance may be partly `address(0)` (empty = pass) → wire the identity registry for the demo; be honest in README.
- Blocky402 has no SLA → capture the qualifying paid request early with HashScan link + mirror JSON.

---
_Status: Phase 0 in progress. Next: scaffold workspace + Foundry, extract ATS interfaces from the clone._
