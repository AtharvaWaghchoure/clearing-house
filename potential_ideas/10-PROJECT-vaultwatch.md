# VAULTWATCH

## One-line pitch
Privy ships no scheduler — so we built the missing one, where the agent proposes, a rolling budget decides, and anything over the line becomes a proposal that **changing the rules is itself governed by the rules**.

## Sponsor bundle & prize exposure
**Slots: Privy · Chainlink · Arc (Circle)**

| Prize line | $ | Structure | P(win) | Reasoning |
|---|---|---|---|---|
| **Privy — Best B2B financial product** | $2,500 | flat, winner-take-all | **35%** | Uses **four** Privy controls where **one** is required; the prize text literally enumerates *"organization wallets, policies, team permissions, quorum approvals, intents, automated transactions, event-driven operations."* |
| **Privy — Best financial flow** | $2,500 | flat, winner-take-all | **25%** | The scheduled action is a **self-serve Morpho Earn vault** sweep — *generally available*, as the prize requires. |
| **Chainlink — Best Confidential Workflow** | $2,000 | 2 × $1,000 | **30%** | Confidential HTTP is **ungated**; `simulate --broadcast` is a **sanctioned** path per the near-identical Cannes 2026 wording. |
| Arc ×3 (split evenly) | $10,000 | qualify | **~50%** | Settlement on Arc; **$30–$500 realistic.** |

**Exposure $17,000 nominal. EV ≈ $1,800.**

## Why this wins
- **A verified product gap.** Grepping Privy's full 4.2 MB docs bundle returns **no cron, no price/condition triggers, no recurring payments, no limit-order primitive.** They exist only as *recipes telling you to build them.* The intended architecture is explicitly *your trigger loop + a signer + a policy* — so building it is filling a hole the vendor designed you to fill.
- **The recursive twist is the originality.** Raising the agent's budget is itself an **intent** requiring the same quorum. **Changing the rules is governed by the rules.** Nobody will build that.
- **Intents are the freshest surface Privy has** — named in the prize text and appearing **nowhere in their changelog**.
- **Confidentiality is load-bearing, not decoration:** treasury balances and counterparty exposure are exactly what a business will not put in a public workflow, so the risk computation runs in a **CRE Confidential HTTP** workflow and only the *decision* lands on chain.
- **Privy's tracks are the clearest anti-agent-hype tracks at the event.** Pitch business workflow, not agents.

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **7** | P-256 authorization signing, TEE-enforced policies, aggregations, CRE workflow authoring. |
| Originality | **8** | The recursive governance loop; the missing scheduler. |
| Practicality | **9** | A real treasury workflow with a real yield leg. |
| Usability | **8** | An approvals inbox is immediately legible to a non-technical judge. |
| WOW | **7** | The over-budget action stopping and reappearing as a proposal. |
| **Weighted** | **7.8/10** | |

## What it is (plain English)
Companies increasingly want software to move their money on a schedule — sweep idle cash into yield, pay a vendor weekly, rebalance a treasury. Privy gives you excellent tools for *who may sign what*, but it deliberately gives you no way to say *when*. Every recurring-payment story in their documentation ends with "so build a loop."

VAULTWATCH is that loop, built properly. It runs on a schedule, decides whether an action is inside the agreed budget, and if it is, signs it. The budget isn't a number in a config file; it's a rolling window enforced inside Privy's secure enclave, so the loop cannot exceed it even if the loop is compromised.

When an action would exceed the budget, nothing fails. It becomes a **proposal** — a signed object sitting in an approvals inbox, waiting for two of three humans to authorise it. And the part nobody builds: raising the budget is itself a proposal, requiring the same two of three. The system's own rules can only be changed through the system's own rules.

The risk calculation — how exposed is the treasury, how unusual is this counterparty — runs inside a confidential compute environment, because that is precisely the data a business will not publish. Only the verdict reaches the chain.

## The demo moment
**(0–8s)** Approvals inbox, empty. A scheduler ticks. Three sweeps into a Morpho vault execute silently, inside budget. A rolling-window meter fills.
**(8–16s)** The fourth sweep would breach the 24-hour cap. **The backend does not sign.** An **intent** appears in the inbox with a countdown. Caption: **`it didn't fail. it asked.`**
**(16–24s)** Two of three approvers sign from different browsers. Privy auto-executes on threshold. The settlement lands on Arc wrapped in `Memo`, carrying the treasury reference in an indexed event **emitted from the treasury's own EOA**.
**(24–30s)** An operator tries to raise the cap to make the problem go away. **That, too, becomes an intent requiring the same quorum.** Caption: **`the rules govern changing the rules.`**

## Ecosystem components used
- **Privy policies + stateful aggregations** — *If we deleted these, **the budget would be a variable in my own process and the guarantee would be worth nothing — the enclave is what makes the cap real.***
- **Privy intents** — *If we deleted these, **an over-budget action could only fail; there would be no path from "refused" to "authorised" without a human editing config.***
- **Privy key quorums + organization wallets** — *If we deleted these, **approval would be one person, which is not a business control.***
- **Chainlink CRE Confidential HTTP workflow** — *If we deleted this, **the treasury's exposure and counterparty data would have to be public to be computed on — which is exactly why businesses don't automate this today.***
- **Arc `Memo` + native USDC** — *If we deleted this, **the settlement would carry no on-chain reference from the payer's own address, and reconciliation stops being provable.***

## Buildability
**Weight: medium.** ~2,000 lines.
**Must-ship v1:** org wallet + one policy + one aggregation + the intent escalation loop + the Morpho sweep.
**Cut order:** CRE workflow → Arc `Memo` leg → the recursive policy-change intent → the inbox UI polish.
**Hardest unknown:** **P-256 authorization-key signing and Privy's canonical request payload.** Getting the canonicalisation exactly right is the classic time sink — **budget a full day**, and use `@privy-io/node`'s `authorization_context` helper rather than hand-rolling.
**Riskiest dependency:** **key quorums are "reach out to us" gated.** **Test in the first two hours of day 1.** Fallback: a 2-of-2 owner (user + app key), which needs no enablement and still demonstrates multi-party authorisation.

**Traps:** any `PATCH /v1/wallets/{id}` **dismisses every pending intent for that wallet** — never mutate the wallet while intents are pending. Aggregation windows are capped at **72 hours**; intents expire at **72 hours**. Design demo timings well inside both. Policies are **default-DENY** — omit a rule for a method you use and it is *silently bricked*.

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **Privy core**; ≥1 wallet created/used; a business/org use case; ≥1 functional B2B workflow; **≥1 control** (we use four); explain how Privy enables the product
- [ ] **Financial flow uses a *generally available* feature** — self-serve **Morpho** vault only (Aave/Veda/Kamino are sales-gated and would fail)
- [ ] Privy Cards, if shown at all, are **mocked and are not the required live integration**
- [ ] **Chainlink: integration causes an on-chain state change** — frontend display explicitly insufficient. **Use CRE, not Functions/Automation (both switched off).** Disclose the **MockKeystoneForwarder** honestly; do **not** set `setExpectedWorkflowId/Author/Name` during simulation
- [ ] **Arc: working frontend AND backend + architecture diagram**; **name the bounty explicitly**
- [ ] Use `@privy-io/node`, **not the deprecated `@privy-io/server-auth`**

## Hostile Q&A prep
**Q1 (Privy): "You built a cron job."** The cron is deliberately boring — it's the missing piece, not the clever piece. The contribution is the **escalation path**: over-budget actions become intents rather than failures, and policy changes are themselves intents. That loop is what turns a script into a control system.
**Q2: "Your aggregation can be raced."** Yes — values update *after* signing, so concurrent requests can all clear the cap. Privy documents this as *"disaster prevention rather than strict real-time enforcement."* It's on my honest-gap slide, and the mitigation is a per-window high-water mark.
**Q3 (Chainlink): "Your workflow ran against a mock forwarder."** Correct, and I say so on camera. The DON consensus step is simulated locally; **the transaction and the state change are real and publicly verifiable** — here's the hash and here's my contract's storage slot before and after. Deploy access is a separate approval I requested on day 1.
**Q4: "Why does the risk computation need to be confidential?"** Because it takes treasury balances and counterparty exposure as inputs. A business will not publish those to get automation. Confidential HTTP fetches them inside the enclave and only the verdict lands on chain.
**Q5 (Circle): "Could this settle anywhere?"** The payment could. The *receipt* couldn't — `Memo` uses Arc's `CallFrom` precompile to preserve the payer's own EOA as `msg.sender`, so the reference is indexed against the treasury's address rather than a wrapper contract's.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Key quorums gated** | Test in the first two hours; fall back to 2-of-2 owner. |
| P-256 canonicalisation eats a day | Use the SDK's `authorization_context`; do not hand-roll. |
| **Wallet updates silently dismiss pending intents** | Never mutate the wallet while intents are pending; state it in the docs as evidence you read them. |
| CRE adds scope late | It is the third leg, not the spine. Cut it first if days 1–5 slip. |
| Reads as a payroll dashboard | The recursive governance loop is the headline; lead with it, not the schedule. |
