# LEASH

## One-line pitch
An agent that pays for its own API calls — where the payment *is* the permission: an unapproved 402 transfers zero bytes, because the settlement signature never leaves the Secure Element.

## Sponsor bundle & prize exposure
**Slots: Ledger · Bazantic · World**

| Prize line | $ | P(win) | Reasoning |
|---|---|---|---|
| **Ledger — track TBD, drops Sep 7** | ~$5,000 / ~5 places | **35%** | Predicted **"AI Agents x Ledger" ~75%**. All four identified NY 2026 winners are agent-spends-money + policy + hardware gate. Shallow field: **9 used Ledger, 4 placed.** |
| Bazantic — Best Recipe using Sponsor APIs | $1,000 / 3 places | **40%** | Platform is `noindex`; **recipe catalog is empty**; 8 paid places across $3,000. |
| Bazantic — Agentify a New API | $1,000 / 3 places | **40%** | **Zero sponsor APIs are on Bazantic** — wrapping one satisfies both lines. |
| World — Selfie Check | $3,500 | **20%** | ⚠️ Two human-approved gates, **no SLA**. Go/no-go Sunday Sep 6. |

**Exposure ≈ $10,500.** Weakest fields on the board, highest uncertainty.

## Why this wins
- **Ledger wrote the brief themselves.** Cannes 2026, verbatim: *"Build agents that pay for APIs, tools, or services with **Ledger-secured payment flows**"* and *"human-in-the-loop agents where Ledger approves high-risk actions **before funds move**."* **Bazantic is that payment rail** — an x402/MPP gateway where agents pay per call in USDC.
- **⚠️ The critical distinction.** The adjacent lane — *policy wrappers around agent spending* — is a **graveyard**: 8 teams at Lisbon, 5 lost, including **PlanBound with 163 tests and seven MCP tools.** LEASH is **not** a spending cap. **Settlement is the access mechanism**, Conduit-style. If it drifts into "we added approval limits," kill it.
- **The A/B proof and the Ledger demo are the same recording.** Bazantic's SKILL.md flags *"an `X-Payment` header you built yourself"* as a red flag — so the control run fails exactly where the Recipe run gets a hardware approval and settles. One take, two prizes.
- **No physical device needed.** Speculos emulates Nano S+/X/Stax/Flex with a **screen-recordable device UI** — Ledger sanctioned it for their own June sprint.

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **7** | DMK transport, ERC-7730 descriptor generation, x402/MPP settlement, an OpenAPI gateway. Integration-heavy rather than novel-mechanism. |
| Originality | **7** | Payment-as-handshake is unclaimed; the adjacent lane is not. |
| Practicality | **8** | Runs end to end on real USDC on Base. |
| Usability | **8** | The device screen *is* the UI — inherently legible. |
| WOW | **8** | The freeloader gets nothing; the device renders a human sentence, not a hex blob. |
| **Weighted** | **7.6/10** | |

## What it is (plain English)
Autonomous agents increasingly need to buy things — an API call, a dataset, a model inference. The standard answer is to give the agent a wallet and a spending limit. That answer has been built dozens of times and it has a hole: whatever wrote the limit is software the agent can, in principle, talk its way past.

LEASH removes the agent's ability to pay at all. It can discover a paid service, probe it, and receive the price — all free. But the signature that actually settles the payment is produced inside a hardware device, after a human has read, on the device's own screen, a plain-English sentence describing exactly what is being bought and for how much. That sentence is generated from a clear-signing descriptor, so it cannot be spoofed by the calling code.

The consequence is the demo: an agent that has not been approved doesn't get a degraded response or a rate limit. It gets nothing, because no payment settled, and the gateway never returned a byte.

## The demo moment
**(0–8s)** Agent needs market data. It searches Bazantic, finds the gateway, probes a path — **404, free** — then the right path: **402, free**, price quoted `10000` = $0.01.

**(8–18s)** Agent attempts to settle by hand-building an `X-Payment` header. **Refused.** Terminal shows `bytes received: 0`. Caption: **`no approval, no bytes`**.

**(18–28s)** Same request, with the Recipe. The Speculos device screen fills the frame: **"Pay 0.01 USDC · Zerion API gateway · call: getPortfolio"** — a sentence, not a hex blob. A physical button press. Settlement lands; `paid.explorerUrl` opens.

**(28–30s)** Split screen: control run vs Recipe run, `N=3` each, same model, same prompt, same credentials — **the only difference is one block of text.**

## Technical architecture
```
agent ──search/probe──► Bazantic gateway (free 404 / free 402 quote)
   │                              │
   │  402 + price                 │
   ▼                              │
RiskClassifier ──under cap──► auto-settle via baz curl
   │ over cap / new counterparty / anomalous rate
   ▼
ERC-7730 resolver ── descriptor from EF registry (or generated + PR'd)
   │        validate with python-erc7730
   ▼
DMK  ──device-transport-kit-speculos──►  [ SPECULOS DEVICE SCREEN ]
   │                                        human reads + presses
   ▼
signature ──► baz curl settles ──► receipt {transaction, explorerUrl}
   │
   └─► World AgentKit: lookupHuman(agentWallet) → per-human rate budget
```
**Adapter seam:** `IApprovalGate` — instantiated as (a) Speculos/DMK hardware, (b) World AgentKit human-backing, (c) auto-approve under threshold. Same interface, three assurance levels.

## Ecosystem components used
- **Ledger DMK + `device-signer-kit-ethereum` + Speculos transport** — *If we deleted this, **the approval would be software the agent could be argued past — which is the exact failure every spending-cap project has.***
- **ERC-7730 descriptor + `python-erc7730`** — *If we deleted this, **the device would show a hex blob and the human would be approving something they cannot read, which defeats the whole gate.***
- **Bazantic gateway + Recipe** — *If we deleted this, **there is no real paid service to gate, and no A/B baseline — the Recipe is what encodes the handshake the agent cannot infer.***
- **World AgentKit / AgentBook** — *If we deleted this, **rate budgets would key on wallet addresses, which an agent can mint infinitely; `lookupHuman` makes the budget per-human.***

## Novelty verification
**apWallet** (NY 2026) was literally *"Wallet for A2A Payment and Orchestration with ENS/Ledger/x402"* — **and did not place**, because it was orchestration without a principled rule. **Tollgate**, **xPayables**, **Fiado** all wired Ledger to agent payments and **all failed to place.** The four that won shipped a *policy abstraction*: Lunave (bounded custody at the Secure Element), Stream Vaults (*"bounded to hours of flow, not TVL"*), Flowguard (a circuit breaker), Aegis (skill verification before execution).
**➜ The unclaimed framing is payment-as-handshake** — settlement itself being the access mechanism — rather than a limit imposed on top of it. **Bazantic has zero published Recipes and zero sponsor APIs on the platform.**

## Buildability
**Weight: medium.** ~55–70 hours.
**Must-ship v1:** Speculos + DMK signing one real payment end to end, with the zero-bytes refusal.
**Cut order:** World AgentKit → the second gateway → ERC-7730 generation (fall back to fetching existing descriptors).
**Hardest unknown — and it gates everything: will Speculos + DMK talk?** **Do this Sep 4 morning.** If it fails, every Ledger shape dies and you need to know on day 1.
**Riskiest dependency:** **Ledger's track is unpublished until Sep 7, 10:00 AM EDT.** Build the shape-independent substrate Sep 4–6 (signing harness, descriptor resolver, policy engine, running `FEEDBACK.md`) so the reveal costs an 8–20 hour re-framing, not a rebuild.

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **Bazantic:** account created; **x402/MPP Gateway deployed**; Recipe authored; **username (email or GitHub handle) in the submission**
- [ ] Bazantic line 2: **≥1 other service** already on Bazantic or from a sponsor; final result depends **meaningfully on both**; start-to-finish screen recording
- [ ] Bazantic line 3: service **not on Bazantic AND not available via another sponsor at event start**; recipe reusable by others
- [ ] **A/B proof:** same model, prompt, settings, API access; Recipe the **only** material difference; both results shown
- [ ] **World (if pursued):** Sandbox App used; **feedback document** covering docs, Developer Portal navigation, Sandbox states/errors/edge cases, and what was confusing/missing/broken
- [ ] **Ledger:** re-read the track when it publishes Sep 7 and tick its bullets; include `FEEDBACK.md` + ≥1 doc PR (a feedback deliverable has been a scored requirement in every recent Ledger track)
- [ ] ⚠️ Do **not** use `@ledgerhq/hw-app-eth` — LedgerJS is deprecated Sept 2026; use DMK

## The pitch narrative
**Opening line:** *"Everyone gives their agent a spending limit. We gave ours no ability to spend at all — and it still buys things."*

Problem → agent payment authority is enforced in software the agent can talk past. Insight → don't limit the payment; make the *settlement signature* physically unreachable. Solution → the 402 becomes an approval request rendered as a human sentence on a device screen. Demo → unapproved agent receives zero bytes; approved agent settles in one press. Vision → machine commerce needs a gate that is not made of the same stuff as the machine.

## Hostile Q&A prep
**Q1 (Ledger): "How is this different from the five projects that wired Ledger to agent payments and didn't place?"**
Those imposed a policy *around* a payment. Here the settlement signature *is* the access token — no signature, no bytes, and the gateway never runs the upstream call. The falsifiable version: the freeloader's byte count is zero, not "degraded."

**Q2: "You're using an emulator. Does this work on real hardware?"**
Same DMK code path; only the transport package differs, and Ragger runs identical tests against emulator or device with a flag. Ledger themselves directed builders without devices to Speculos for their own June sprint. Swapping in `device-transport-kit-web-hid` is a one-line change.

**Q3 (Bazantic): "Is your A/B rigged?"**
The control gets everything except the Recipe — full OpenAPI spec, `tools/list` output, credentials, permission to explore — and I say that on camera. N=3 each, frozen model and temperature, full transcripts shown. The control **starts successfully** and then confidently produces a wrong answer; it doesn't fail immediately, because that would look staged. Every trap it hits is documented in Bazantic's own SKILL.md and independently reproducible.

**Q4 (World): "Selfie Check isn't Sybil resistance."**
Correct, and the docs disclaim it: *"does not provide a strict one-person-one-account guarantee… returns a proof of the completed check, not a numeric Sybil score."* I use it as a **risk and continuity signal** — a step-up on unusually large or first-time-counterparty payments — not as identity.

**Q5: "What if the human just presses approve every time?"**
Then you've bought nothing, which is why the risk classifier only escalates anomalies — over-cap, new counterparty, abnormal rate. The honest-gap slide says exactly this: the gate is only as good as the escalation policy, and the descriptor is what makes each approval *readable* rather than reflexive.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Speculos + DMK don't talk** | Sep 4 morning task. Everything depends on it. |
| **Ledger's track is unknown until day 4** | Build the shape-independent substrate first; the reveal becomes a re-framing. |
| **Drifts into the spending-cap graveyard** | Hard rule: settlement is the mechanism. If the pitch becomes "we added limits," the project is dead — kill it. |
| World gates never open | **Go/no-go Sunday Sep 6.** Drop World, keep Ledger + Bazantic + a third. |
| Bazantic activation is dashboard-only and human-gated | Do the full gateway flow on Sep 4. |
| Reads as integration work, not engineering | Ship the risk classifier as a real abstraction and the descriptor generator as a tool, not glue. |
