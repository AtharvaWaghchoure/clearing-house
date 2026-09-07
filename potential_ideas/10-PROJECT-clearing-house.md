# CLEARING HOUSE

## One-line pitch
A tokenised-bond venue where the trade and the cash never move separately — compliance is checked *inside* the same transaction that settles both legs, and the venue can prove, from an index it doesn't control, that no non-compliant trade has ever cleared.

## Sponsor bundle & prize exposure
**Slots: Hedera · The Graph · Arc (Circle)** — the maximum-exposure Classic bundle.

| Prize line | $ | Structure | P(win) | Reasoning |
|---|---|---|---|---|
| Hedera — Tokenization of Anything | $6,000 | up to 3 × $2,000 | **30%** | **ATS has no secondary market and the sponsor says so.** The diamond-pattern monorepo filters most teams. |
| Hedera — Improve the Hedera Harness | $2,000 | up to 2 × $1,000 | **50%** | **1★ repo, one substantive open issue, two community PRs ever.** Bar is *"open a PR, unmerged is fine."* |
| Hedera — AI & Agentic Payments | $6,000 | up to 3 × $2,000 | **10%** | 85 existing `x402 hedera` repos. Entered only because the NAV endpoint qualifies for free. |
| The Graph — Composable/Standardized | $5,000 | 3 places | **20%** | HCS receipts + ATS events + Substreams, composed. |
| The Graph — AI Tooling (From Scratch) | $5,000 | 3 places | **15%** | The independent verifier as agent-callable infrastructure. |
| Arc — Best DeFi stablecoin-native Pool | $2,500 | **split evenly** | **60% qualify** | Mechanical bar; payout decays with entrants ($30–$500). |
| Arc — Best Agentic Economy | $2,500 | **split evenly** | **50% qualify** | Most crowded Arc line (97% of the field ships an agent). |
| Arc — Launch on Testnet & Push to Mainnet | $5,000 | **split evenly** | **45% qualify** | **Smallest field** — requires returning Sep 16–30 to deploy after the event ends. |

**Total exposure $34,000 across 8 lines.** Realistic EV ≈ **$2,000–2,800**, but with materially higher execution risk than AQUAGUARD.

## Why this wins
- **Hedera's own docs name the gap:** *"**Secondary Market Trading** — when placing a sell order, the marketplace needs ability to transfer your tokens to a buyer; tokens are held in escrow until the order is matched."* Zero `.sol` hits for orderbook/marketplace/matching across `main` **and** `develop`.
- **The mechanism is elegant and nobody found it.** `HoldStorageWrapper` gates execution **solely** on `msg.sender == hold.escrow`. Your matcher needs **no role grant, no whitelist, no issuer trust** — which is exactly why ATS could ship a market without changing its permission model.
- **Arc contributes something unportable.** `Memo` and `Multicall3From` sit on the `CallFrom` precompile and **preserve the original EOA as `msg.sender` in subcalls.** A batch of USDC settlements emits `Transfer` events *from the payer's own address*, each carrying indexed trade metadata, atomically. **Zero repositories use either contract.**
- **The Graph turns a claim into a proof** (P19, the third-party verifier): the venue asserts compliance; an independent index reconstructs it from public data.
- **Harness + app compose by design** — the harness is a *tool you use to build the app*, which is literally how both existing community PRs were born (*"we hit exactly this while building an invoice-financing RWA project on testnet"*).

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **9** | Diamond-pattern ATS, dual-leg atomic escrow, HIP-1215 self-rescheduling cron, an Arc precompile, a cross-chain index. |
| Originality | **8** | First ATS secondary market; first use of `Memo`/`Multicall3From` anywhere. |
| Practicality | **9** | Real asset lifecycle on testnet, real compliance rejections, deployable to Arc mainnet Sep 16. |
| Usability | **7** | Order book UI + a compliance pre-flight that names the EIP-1066 reason. |
| WOW | **7** | KYC revoked → the same order rejects with a named reason, mid-demo. |
| **Weighted** | **8.0/10** | |

## What it is (plain English)
When institutions trade a bond today, delivery and payment are two separate processes stitched together by intermediaries and a day of settlement risk. Hedera ships an Asset Tokenization Studio that can *issue* a compliant bond — with KYC gates, freezes, transfer restrictions and coupon payments — but it deliberately has no marketplace. There is nowhere for those bonds to trade.

CLEARING HOUSE is that marketplace, built the way ATS was designed to allow. A seller places their bond into a *hold* naming our matching contract as escrow agent; the buyer places their cash the same way. When the orders match, one transaction executes both holds. Either both legs move or neither does — and the compliance check runs inside that same transaction, so a buyer who lost their KYC between placing and matching simply cannot be filled.

The cash leg is adapter-swapped. On Hedera it is ATS's own deposit-token; on Arc it is USDC, wrapped in Arc's `Memo` contract so every settlement carries its trade reference in an indexed on-chain event emitted from the payer's own wallet — something no other chain can do. Coupons and maturity redemptions schedule themselves via Hedera's on-chain cron, which we verified firing autonomously with zero signatures, 169 ms after its target.

Finally, everything the venue does is indexed independently. The venue *claims* it never cleared a non-compliant trade. A separate service, sharing no code, reconstructs that claim from public chain data — and can catch us lying.

## The demo moment
**(0–10s)** An order book with a live bond. Seller holds; buyer holds; match fires. One transaction hash. Both legs move. Caption: **`one tx · delivery ∧ payment`**.

**(10–20s)** In a second window, the issuer calls `revokeKyc` on the buyer. **The identical order is re-submitted and rejects** — and the UI does not say "failed", it says **`ERC-1066 0x56 · IDENTITY_REGISTRY_NOT_VERIFIED`**, read from `canTransferByPartition` before anything was signed.

**(20–30s)** Cut to the independent verifier: *"the venue claims 412 settled trades, all compliant."* Flip a flag to make the venue lie about one. **The verifier flags it from the subgraph alone, with the offending trade id.**

## Technical architecture
```
HEDERA (compliance chain)                     ARC (settlement chain)
┌───────────────────────────┐                ┌──────────────────────────┐
│ ATS Security (ERC-1400)   │                │ USDC native (18dp/6dp)   │
│  BLR 0.0.9212226          │                │ Memo 0x5294E992…         │
│  Factory 0.0.9213391      │                │ Multicall3From 0x522fAf…│
└─────────┬─────────────────┘                └──────────┬───────────────┘
          │ createHoldByPartition(escrow=MATCHER)        │ aggregate3 wrapped in memo()
          ▼                                              ▼
   ┌──────────────────────────── ISettlementLeg ──────────────────────────┐
   │  HederaHoldLeg          │          ArcMemoLeg                        │  ← THE ADAPTER SEAM
   │  executeHoldByPartition │          memo(target,data,tradeId,meta)    │
   └──────────────────────────────┬───────────────────────────────────────┘
                                  ▼
                     MatchingEngine.settle(orderA, orderB)
                       ├─ pre-flight canTransferByPartition (EIP-1066)
                       ├─ execute BOTH legs or revert
                       └─ emit HCS receipt (hcs-audit-trail-hook)
                                  │
        ┌─────────────────────────▼──────────────────────────┐
        │ SUBGRAPH: ATS events + HCS receipts + Arc EIP-7708 │
        │  → independent compliance reconstruction           │
        └─────────────────────────┬──────────────────────────┘
                                  ▼   agent-callable MCP
                        "was trade 412 actually compliant?"
```
**Coupons/maturity:** a contract calls HSS `0.0.363` `scheduleCall` (`0x6f5bfde8`) and **re-schedules itself** — verified executing with zero signatures. Guard the return value: **`scheduleCall` never reverts**, so an unchecked return silently ends the recurrence.
**Pricing:** Chainlink **HBAR/USD proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`** on Hedera testnet (proxy, never the aggregator). NAV feeds do not exist on Hedera — say so rather than implying otherwise.

## Ecosystem components used
- **Hedera ATS `Hold` escrow** — *If we deleted this, **there is no way for a matcher to move a compliance-gated asset without the issuer granting it a privileged role, which is precisely what makes a permissionless venue impossible today.***
- **Hedera HIP-1215 scheduled calls** — *If we deleted this, **coupons and maturity would need an off-chain cron, and the "the bond services itself" claim collapses.***
- **Hedera HCS + `hcs-audit-trail-hook`** — *If we deleted this, **there is no consensus-ordered receipt for the verifier to reconstruct from.***
- **Hedera Harness** — *If we deleted this, we lose the contribution track; the `chainAssertions` PR exists **because building this exposed that CHAIN validates nothing**.*
- **Arc `Memo` / `Multicall3From`** — *If we deleted these, **settlements would emit events from a contract instead of the payer's own EOA, and the invoice reference would live off-chain — reconciliation stops being provable.***
- **The Graph subgraph + Substreams + MCP** — *If we deleted this, **the venue's compliance claim would be self-attested, which is exactly the thing institutions cannot accept.***

## Novelty verification
Searched ATS `main` and `develop` for orderbook/marketplace/matching/atomic-swap: **zero `.sol` hits**; the `temporal/uniswap` branch is a misnamed stale snapshot with no swap code; 3 open issues, none about markets. GitHub `x402 hedera`: **85 repos** — clusters are inference gateways, spend guards, agent marketplaces, HCS receipt wrappers. **Absent from all 85: ATS + x402, scheduled-transaction recurring payments, HTS custom fees in settlement, anything touching the harness.** Arc: **zero repositories** use `Memo` or `Multicall3From`. Showcase: Covenant (tokenised property, refuses transfers to unverified wallets) and Unlockd (vested RSUs) are the closest, and neither built a market.

## Buildability
**Weight: HEAVY. This is the honest concern.** ATS alone is 5–6 days; three sponsors is three integrations.

**Must-ship v1:** Hedera-only atomic DvP with the compliance rejection demo, plus the Harness PR. **That alone is two prize lines.**
**Cut order:** the Graph verifier → Arc leg → scheduled coupons → oracle pricing.
**Hardest unknown:** whether the `Hold` + `deployDepositToken` dual-leg executes atomically in one transaction without tripping `onlyClearingDisabled` (**holds and clearing mode are mutually exclusive**).
**Riskiest dependency:** **ATS ships no HashScan verification tooling** — no `hardhat-verify`, no `verify` script — and the prize asks for verified contracts. Budget half a day.
**Do not:** deploy a fresh BLR (~180M gas, ~28 min). Reuse `0.0.9212226` / `0.0.9213391`.

## Compliance checklist
- [ ] Staked before Sep 3, 11:59 PM EDT · continuous commits from Sep 4
- [ ] **ATS used to issue/manage a tokenised asset; deployed on Hedera testnet**
- [ ] **Contracts verified on HashScan** (ATS ships no tooling — do it manually)
- [ ] Video shows **issuance + configuration + ≥1 lifecycle operation** (transfer / compliance check / distribution)
- [ ] Harness: **PR link** (unmerged fine) + README/PR description explaining the problem and how to run it
- [ ] x402: live service **settled through Blocky402** (`https://api.testnet.blocky402.com`, **no `/v1`**) with **≥1 real paid request end to end**, plus README covering the payment flow
- [ ] ⚠️ **Do NOT copy the sponsor PoC's `x402.org/facilitator` default** — that fails qualification
- [ ] Graph: **live data**, composition of 2+ products explicit, reusable infrastructure + SKILL.md
- [ ] Arc: **working frontend AND backend + architecture diagram**, detailed docs, repo link, and **explicitly name which bounty** — repeated in all three Arc descriptions
- [ ] Arc mainnet track: **return Sep 16–30 and post the mainnet link/tx**
- [ ] Video 2:00–4:00, ≥720p, own voice · AI attribution + `/specs`

## The pitch narrative
**Opening line:** *"Hedera can issue a compliant bond. It cannot trade one. Their own documentation describes the missing piece — so we built it, and it needs no permission from the issuer."*

Problem → institutions need delivery-versus-payment, and tokenised assets currently give them delivery *or* payment. Insight → ATS's hold mechanism gates on escrow address, not role, so a matcher can be permissionless. Solution → dual-leg atomic execution with compliance checked inside the settlement transaction. Demo → revoke KYC, watch the same order refuse itself. Vision → a settlement venue that proves its own compliance from an index it does not control.

## Hostile Q&A prep
**Q1 (Hedera): "Is your compliance real, or is the module address zero?"**
Partly zero, and I say so in the README. `LowLevelCall.functionStaticCall` returns empty bytes for `address(0)` and **empty is treated as pass** — so with `enableERC3643=false` the real gates are the control list, pause, cap and balance. My demo runs with the identity registry wired, and I show `canTransferByPartition` returning EIP-1066 `0x56`.

**Q2: "Why holds rather than `ROLE_AGENT` + `forcedTransfer`?"**
Because `ROLE_AGENT` requires the issuer to trust my contract, which makes the venue permissioned and un-deployable by anyone else. Holds gate on `msg.sender == hold.escrow`, so any matcher works with any issuer. The trade-off is that holds and clearing mode are mutually exclusive — documented.

**Q3 (Circle): "Couldn't this settle on Base?"**
Not the same way. `Memo` and `Multicall3From` run on Arc's `CallFrom` precompile and preserve the payer's EOA as `msg.sender`. On Base a batching contract *becomes* the sender, so settlements would emit `Transfer` from my contract and the invoice reference would live off-chain. Reconciliation stops being provable. That is protocol-level sender delegation — there's no library that reproduces it.

**Q4 (Graph): "Your verifier reads your own subgraph. How is that independent?"**
It shares no code with the venue and derives compliance from ATS events, HCS receipts and Arc's EIP-7708 system logs — all public. To demonstrate, I flip a flag that makes the venue misreport one trade, and the verifier catches it.

**Q5: "Scheduled transactions for coupons — is that real or a cron in disguise?"**
Real, and I verified it: a contract-created schedule executed with **zero signatures**, 169 ms after target, via HSS `0.0.363`. The caveat is that `scheduleCall` never reverts — it returns an error code — so an unchecked return silently ends the chain. My code checks it, and the payer balance is monitored.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Over-scope — the #1 documented failure mode** | v1 is Hedera-only DvP + the Harness PR = two prize lines. Everything else is additive. |
| ATS learning curve | Reuse deployed BLR/Factory; start from `templates/payments-scheduler` and `templates/oracles`, not greenfield. |
| HashScan verification missing | Budget half a day; it is an explicit qualification item. |
| Blocky402 outage near the deadline | **Capture the qualifying paid request on day 2–3** with the HashScan link and mirror-node JSON. Blocky402 has no public repo, status page or SLA. |
| Arc split-evenly dilutes to ~$200 | Arc is the technical substrate and a near-certain floor, not the payday. Judge it on the mainnet-push line, which almost nobody will complete. |
| Reads as three projects | The `ISettlementLeg` adapter is the single seam; the README leads with it. |
