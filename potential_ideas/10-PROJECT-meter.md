# METER

## One-line pitch
The Graph's pay-per-query rail has processed **$2.22 in its entire life** — because every query costs a separate on-chain settlement; METER makes 200 queries settle once, and an unfunded channel return zero rows.

## Sponsor bundle & prize exposure
**Slots: The Graph · Bazantic · Arc (Circle)**

| Prize line | $ | Places | P(win) | Reasoning |
|---|---|---|---|---|
| **The Graph — AI Tooling (From Scratch)** | $5,000 | 3 | **30%** | Answers `graph-client#1031` — a named, **officially unanswered** ask. x402 payment tooling is explicitly in scope. |
| **The Graph — Composable/Standardized** | $5,000 | 3 | **20%** | Gateway + x402 rail + MCP composed on live data. |
| Bazantic — Best Recipe using Sponsor APIs | $1,000 | 3 | **40%** | Empty recipe catalog; the proxy *is* a sponsor API to wrap. |
| Bazantic — Agentify a New API | $1,000 | 3 | **35%** | Zero sponsor APIs on Bazantic. |
| Arc ×3 (split evenly) | $10,000 | — | **~50% qualify** | Settlement leg on Arc; **$30–$500 realistic.** |

**Exposure $16,000 nominal. EV ≈ $1,700.**

## Why this wins
- **A live rail with almost no traffic and a documented unmet ask.** The Graph shipped x402-paid queries in April 2026: `POST gateway.thegraph.com/api/x402/subgraphs/id/{id}` returns a real 402 — Base mainnet, USDC, **$0.01/query**, EIP-3009. Their own forum, July 2026: *"$2.22 total · 222 payments · 29 agents."* And `graph-client#1031` asks about batched settlement with **no official response**, while `@x402/evm@2.24.0` already ships `batch-settlement/{client,server,facilitator}` and The Graph's client sits at **v1.0.0 pinning `^2.8.0`**.
- **The honest architecture is the interesting one.** You **cannot** make the gateway speak batch-settlement — its 402 advertises `"accepts": [{"scheme":"exact"}]`, one entry, server's choice. So METER is a **settlement-amortizing proxy**: it advertises `batch-settlement` to agents and pays the gateway plain `exact` from a float. Fully live, no gateway changes, and the design constraint is itself the story.
- **P6 + P3 stacked:** provable resource accounting *with an adversary*. The counter ticking real fractions of a cent is the most viscerally credible object in a demo; the unfunded channel returning nothing is the refusal beat.

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **8** | Payment channels, EIP-3009 escrow, cumulative vouchers, `setSettlementOverrides`, cooperative refund. |
| Originality | **8** | Nobody has amortized settlement over a data gateway; the ask is public and unanswered. |
| Practicality | **9** | Runs against the live rail with real USDC on Base. |
| Usability | **8** | A running total to six decimal places is self-explanatory. |
| WOW | **7** | 1 settlement vs 200, side by side. |
| **Weighted** | **8.0/10** | |

## What it is (plain English)
Blockchain data is expensive to serve, so The Graph built a way for software to pay for it a penny at a time — no accounts, no API keys, just a payment attached to each request. It works. Almost nobody uses it, and the reason is arithmetic: paying a penny on-chain costs more attention than the penny is worth, and doing it 200 times is 200 separate settlements.

METER sits in front. An agent opens a channel once by depositing into escrow. After that, every query is settled off-chain with a signed voucher that says "cumulatively, I owe this much" — instant, free, no waiting. When the agent is done, one transaction settles the total. Two hundred queries, one on-chain event.

Two details make it more than a batching trick. Empty or failed queries can be settled **below** the quoted price, so you are not charged for data you didn't get. And an agent that hasn't funded its channel doesn't get a partial result or an error page — it gets nothing, because the proxy never forwards the request upstream.

## The demo moment
**(0–10s)** An agent runs a 200-query research task. A live counter in the corner ticks **$0.010 → $0.470 → $1.310**, six decimal places, while a second counter reads **`on-chain settlements: 0`**.

**(10–18s)** Task completes. **One** transaction fires. Split screen against the stock client doing the same workload: **200 settlements vs 1**. Caption: **`same data. 1/200th the on-chain footprint.`**

**(18–26s)** A second agent — no channel — issues the identical query. **`bytes forwarded upstream: 0`.** Not an error page. Nothing.

**(26–30s)** One query returns an empty result set. The voucher for it settles at **$0.000**, via `setSettlementOverrides`. Caption: **`you don't pay for rows you didn't get.`**

## Technical architecture
```
agent ──402 (batch-settlement advertised)──► METER proxy
   │  open channel: EIP-3009 deposit → escrow (once)
   ├──query 1..N──► voucher_i = sign(cumulative_total_i)      [off-chain, ~ms]
   │                    │
   │                    ├─ empty/failed result → setSettlementOverrides(res,"0%")
   │                    └─ forward upstream ──► gateway.thegraph.com/api/x402/...
   │                                              (plain `exact`, paid from float)
   └──close──► redeem highest voucher ──► ONE on-chain settlement
                        │
                        ├─ receipt → Arc: Memo(tradeRef) so the invoice is on-chain
                        └─ index → subgraph → MCP tool: "what did agent X spend?"
```
**Adapter seam:** `ISettlementRail` — instantiated as (a) Base/EIP-3009 for the gateway leg, (b) **Arc** with `Memo` attaching the query reference to the settlement, (c) Bazantic's MPP gateway. Same voucher logic, three rails.

## Ecosystem components used
- **The Graph x402 gateway** — *If we deleted this, **there is no metered data rail to amortize and the entire premise vanishes.***
- **The Graph Gateway + Subgraph (live data)** — *If we deleted this, **the receipts index nothing and the "audit what this agent spent" tool has no source.***
- **`@x402/evm` batch-settlement** — *If we deleted this, **each query would settle individually, which is exactly the status quo we are fixing.***
- **Arc `Memo`** — *If we deleted this, **the settlement would carry no on-chain reference to what it paid for, and reconciliation would be a spreadsheet again.***
- **Bazantic gateway + Recipe** — *If we deleted this, **agents would have to learn the channel protocol by reading source; the Recipe is what makes it usable without us present.***

## Novelty verification
`graph-client#1031` (2026-07-02) is unanswered. `@graphprotocol/client-x402` has **one release** and no batching. **Glassbox402** won two prizes for x402 *analytics* — observation, not settlement mechanics. **Corbits** (Solana) built an x402 endpoint dashboard — again a directory, Solana-only. **MCPay** and **Latinum** bridged MCP↔x402 — payment plumbing, not amortization. **No project in the 174-item corpus amortizes settlement across a data provider.**
⚠️ Generic x402 wrappers are **RED**; this survives only because the mechanism is channel amortization, not "we added x402."

## Buildability
**Weight: medium.** ~1,800 lines.
**Must-ship v1:** the proxy terminating `batch-settlement` and forwarding `exact`, with the 200-vs-1 counter and the zero-bytes refusal.
**Cut order:** Arc leg → the receipts subgraph → Permit2 (keep EIP-3009 only) → cooperative refund → multi-rail adapters.
**Hardest unknown:** **whether `@x402/evm`'s batch-settlement escrow contract is deployed on Base mainnet** or must be self-deployed. If self-deployed, add a day and consider running the channel on Base Sepolia while paying the gateway from Base mainnet — an awkward split and the main schedule risk.
**Riskiest dependency:** **`testnet.gateway.thegraph.com` is NXDOMAIN** despite being documented — you are spending real USDC on Base mainnet. **Budget $5.** Also: the client README instructs `rm .graphclient/package.json` because mesh generates broken ESM exports.

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **Live data from a Graph provider** — mocked/local/static **disqualifies**
- [ ] **Meaningful work with the data**, not printing query results
- [ ] Graph tooling submission must be **reusable infrastructure, not a single end-user app** ✔ (it's a proxy + MCP server)
- [ ] **README or SKILL.md so judges can run it**; open source
- [ ] Composition of **2+ Graph products** stated explicitly
- [ ] **Bazantic:** gateway created; Recipe authored; **username in the submission**; screen recording start-to-finish
- [ ] **Arc:** working **frontend AND backend + architecture diagram**; detailed docs; repo link; **name the bounty explicitly**
- [ ] Arc mainnet line: return **Sep 16–30** with the mainnet link/tx

## The pitch narrative
**Opening line:** *"The Graph built a pay-per-query rail in April. It has processed two dollars and twenty-two cents. Here's why, and here's the fix."*

Problem → per-query on-chain settlement is more expensive in attention than the query is worth. Insight → the gateway will only ever speak `exact`, so amortization has to happen in front of it, not inside it. Solution → a proxy that terminates channel payments and pays the gateway from a float. Demo → 200 queries, one settlement, and a freeloader who gets nothing. Vision → machine-scale data consumption needs machine-scale settlement, and the receipts should be queryable by the same protocol that generated them.

## Hostile Q&A prep
**Q1 (Graph engineer): "Why not just fix the client to do batch-settlement against the gateway?"**
I tried that first. The gateway's 402 advertises exactly one scheme — `exact` — and the server chooses. A client speaking `batch-settlement` has nothing to talk to. That's why this is a proxy, and it's why the write-up includes a concrete proposal for the gateway-side scheme, filed as an issue on `graph-client`.

**Q2: "Isn't your proxy just custody with extra steps?"**
It holds a float, yes, and I say so. But the agent's funds sit in escrow they can unilaterally reclaim after the timeout, vouchers are cumulative so the proxy can only ever claim the highest signed value, and the refund path is cooperative. The trust assumption is bounded and stated on the honest-gap slide.

**Q3: "What stops the proxy over-charging?"**
Cumulative vouchers — the agent signs a running total, so the proxy can never redeem more than the last thing the agent agreed to. And `setSettlementOverrides` only ever moves the amount *down*, never up.

**Q4 (Circle): "Why Arc for the receipt and not Base?"**
Because `Memo` runs on Arc's `CallFrom` precompile and preserves the payer's own EOA as `msg.sender`, so the settlement event carries an indexed query reference *from the payer's address*. On Base a wrapper contract becomes the sender and the reference lives off-chain. That's the difference between reconciliation being provable and being a spreadsheet.

**Q5: "$2.22 of lifetime volume — is this a real market or a dead one?"**
Honestly, unproven. What I can show is that the rail works, the ask for batching is public and unanswered, and the cost structure is the obvious blocker. I'd rather build the missing primitive on a rail with a documented gap than another wrapper on a saturated one.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Batch-settlement escrow not deployed on Base | Spike Sep 2. Fallback: self-deploy; worst case run the channel on Base Sepolia and document the split. |
| Spending real USDC (no testnet gateway) | Budget $5; cap the demo workload. |
| Reads as "another x402 project" (RED category) | Lead with **1 settlement vs 200** and the unanswered issue. Never say "we support x402." |
| Graph pool is the most contested at the event | Bazantic and Arc lines are the floor; the Graph lines are the upside. |
| Proxy custody objection | Pre-empt it in the video with the escrow/timeout/cumulative-voucher explanation. |
