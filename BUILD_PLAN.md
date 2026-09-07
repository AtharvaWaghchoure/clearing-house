# CLEARING HOUSE — Build Plan

> A tokenised-bond settlement venue where the trade and the cash never move separately.
> Compliance is checked **inside** the same transaction that settles both legs, and the
> venue proves — from an index it does not control — that no non-compliant trade ever cleared.

**Event:** ETHOnline 2026 · **Sponsors:** Hedera · The Graph · Arc (Circle)
**Source spec:** [`potential_ideas/10-PROJECT-clearing-house.md`](potential_ideas/10-PROJECT-clearing-house.md)

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

### Phase 0 — Foundation  ⏳ IN PROGRESS
- [x] Verify deployed contracts + repo (done above)
- [x] Shallow-clone ATS into `_reference/ats` (gitignored) for real interfaces
- [ ] `git init`; pnpm workspace; Foundry project under `contracts/`
- [ ] Extract the minimal ATS interfaces I actually call into `contracts/src/interfaces/ats/`
- **Accept:** `forge build` compiles an empty skeleton; workspace installs clean.

### Phase 1 — Core DvP (P0)  ← the spine
- [ ] `ISettlementLeg` interface + `SettlementReceipt` event
- [ ] `HederaHoldLeg` (execute an ATS `executeHoldByPartition`)
- [ ] `MatchingEngine.settle()`: pre-flight `canTransferByPartition` → revert with EIP-1066 code; execute both legs atomically; emit receipt
- [ ] Foundry tests against a **mock ATS** proving: (a) happy-path atomic DvP, (b) KYC-revoked buyer → revert `0x56 IDENTITY_REGISTRY_NOT_VERIFIED`, (c) one leg fails → whole tx reverts (no partial settlement)
- [ ] Deploy/interaction scripts (ethers/viem) → Hedera testnet, reusing BLR/Factory
- [ ] Issue a real bond via ATS Factory; place two holds; fire one `settle` tx
- [ ] HashScan verification of my contracts (ATS ships no tooling — do manually)
- **Accept:** one testnet tx hash where both legs move; a second where the same order rejects with a *named* EIP-1066 reason read from `canTransferByPartition` before signing.

### Phase 2 — Harness PR (P0, cheap)
- [ ] Reproduce the harness gap (`CHAIN` validates nothing → `chainAssertions`)
- [ ] Open PR to the harness repo with README + repro; link it
- **Accept:** PR URL exists (unmerged fine).

### Phase 3 — The Graph (P1)
- [ ] Subgraph: ATS `Transfer`/hold events + my `SettlementReceipt` + (later) Arc logs
- [ ] Independent **verifier** service: reconstructs "was trade N compliant?" from the subgraph, shares zero code with the venue
- [ ] Agent-callable **MCP** wrapper + `SKILL.md`
- [ ] Demo: flip a flag so the venue misreports one trade → verifier flags the trade id
- **Accept:** live subgraph queried; verifier catches the injected lie by id.

### Phase 4 — Arc leg (P2)
- [ ] `ArcMemoLeg`: settle USDC through Arc `Memo` so `Transfer` emits from payer EOA with indexed trade ref
- [ ] Deploy on Arc testnet; architecture diagram; name the exact bounty in each Arc submission
- [ ] (Sep 16–30) push to Arc mainnet, post tx
- **Accept:** USDC settlement tx on Arc carrying the trade id in an indexed log from the payer's own address.

### Phase 5 — Additive
- [ ] Scheduled coupons/maturity via HSS `scheduleCall` (self-rescheduling; **guard the return value**)
- [ ] Chainlink HBAR/USD proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` for pricing
- [ ] x402 NAV endpoint settled through Blocky402 (`https://api.testnet.blocky402.com`, **no `/v1`**, **not** `x402.org/facilitator`)

### Phase 6 — Product & submission polish
- [ ] Order-book frontend (Next.js + viem): place holds, live book, compliance pre-flight banner showing the EIP-1066 reason before signing
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
├── potential_ideas/    Original idea docs (kept as spec)
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
