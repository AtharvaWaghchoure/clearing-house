# THE FUZZER

## One-line pitch
Property-based differential fuzzing against three brand-new sponsor codebases — submitted as **found-and-reported bugs verified by the sponsors themselves**, with no demo application at all.

## Sponsor bundle & prize exposure
**Slots: 1inch · Uniswap Foundation · Hedera**

| Prize line | $ | Places | P(win) | Reasoning |
|---|---|---|---|---|
| **1inch — Build an Aqua App** | $5,000 | 3 | **35%** | KSwap-VM **won 3rd place with formal verification and no demo app** — the only category facing zero competition in 173 Lisbon projects. |
| **Uniswap — Best Stack Contribution** | $3,000 | 3 | **35%** | *"Tooling or solutions built for the broader ecosystem."* **No public adversary corpus exists for v4 hooks or CCA.** |
| **Hedera — Tokenization of Anything** | $6,000 | 3 × $2,000 | **20%** | *"Contributions back upstream to ATS"* is an explicit extra-points bullet; ATS has 3 open issues and stale docs. |

**Exposure $14,000. EV ≈ $2,000.**

## Why this wins
**The most falsifiable artifact available at a hackathon is a bug the sponsor confirms.** It is verified by someone you do not control (§Layer 3, P14) — the epistemic upgrade every other project lacks. It also requires **zero UI, zero video polish and zero live-demo risk**, which is a rational trade when the field's median entry is a broken demo.

**AgentSeer won top-10 of 600+ teams and $50,000 at OpenAI's red-teaming hackathon on essentially one measurement** (67% vs 0%) plus a graph. The pattern is proven at scale.

**⚠️ The one honest caveat:** KSwap-VM already did formal verification **on SwapVM specifically**. Repeating that target repeats a winner. **The uncontested move is the same technique pointed at ATS, CCA validation hooks, and Aqua's registry** — none of which has any public property-based testing.

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **8** | Invariant design is the hard part; generators and minimisers are craft. |
| Originality | **7** | The technique won once; the targets are new. |
| Practicality | **9** | Findings are immediately actionable by the sponsors. |
| Usability | **6** | A report and a CI action, not a product. **The weak axis — budget a real UI for the coverage grid.** |
| WOW | **7** | A confirmed bug in a sponsor's live contracts is a mic drop; zero findings is a shrug. |
| **Weighted** | **7.4/10** | |

## What it is (plain English)
Three of this event's sponsors shipped brand-new, unusual code this year: 1inch built a small virtual machine for pricing trades, Uniswap built a new auction with a plug-in validation system, and Hedera shipped a toolkit for issuing regulated financial instruments. All three are young, and none has public adversarial testing.

THE FUZZER generates enormous numbers of random-but-valid inputs for each — random pricing programs, random auction bids, random compliance configurations — runs them, and checks that things which must always be true remain true. Prices must never reward splitting a trade into pieces. An auction must never accept a bid it should reject. A compliance-gated asset must never move to an unverified holder.

When a rule breaks, it shrinks the failing case to the smallest version that still breaks it, so the sponsor gets a two-line reproduction instead of a haystack. The output is a coverage grid: how many properties, how many cases, how many violations, each with a minimal reproducer.

## The demo moment
**(0–10s)** A coverage grid fills in live: three codebases, ~18 properties, tens of thousands of cases. Green cells accumulate.
**(10–20s)** **Three cells go red.** Each expands to a minimised reproducer — a 6-line program, a specific bid sequence, a specific fee configuration.
**(20–30s)** Cut to the filed issue on the sponsor's own repo, with the maintainer's reply visible. Caption: **`verified by them, not by us.`**

## Ecosystem components used
- **1inch SwapVM + Aqua** — *If we deleted these, **there is no VM to fuzz and the pricing invariants have no subject.***
- **Uniswap CCA `IValidationHook` + v4 hooks** — *If we deleted these, **the auction-side invariants disappear — and CCA's hook directory has three files and no adversary corpus.***
- **Hedera ATS compliance path** — *If we deleted this, **we lose the most consequential property class: that a compliance-gated asset never moves to an unverified holder.***

**The adapter seam:** one `IInvariantTarget` interface — generate / execute / assert — instantiated three times. **That is what makes this one mechanism rather than three scripts.**

## Buildability
**Weight: medium.** ~1,500 lines plus per-target adapters.
**Must-ship v1:** one target (SwapVM), 6 invariants, a minimiser, and a coverage grid.
**Cut order:** ATS target → CCA target → the CI action → the web grid (ship a terminal table).
**Hardest unknown:** **whether any real violation exists.** The project must be valuable at **zero findings** — hence the coverage grid framing, and hence shipping the harness itself as the artifact.
**Riskiest dependency:** ATS is a diamond-pattern monorepo with a **7-minute `viaIR` compile** on the 1inch side; iteration is slow. Keep a minimal harness.

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **1inch: official Aqua/SwapVM contracts used; on-chain execution of token transfers shown in the final demo** (a fork is fine) — ⚠️ **a pure fuzzer risks failing this bullet; include a minimal Aqua app that executes a real fill**
- [ ] **Uniswap: `FEEDBACK.md` in the repo + the feedback form including its link** ← hard gate; README points at exact contracts/lines
- [ ] **Hedera: ATS used to issue/manage an asset on testnet; contracts verified on HashScan; video shows ≥1 lifecycle operation**
- [ ] Every finding filed as a public issue/PR with a minimal reproducer

## Hostile Q&A prep
**Q1 (1inch): "KSwap-VM already did this."** They did K semantics on SwapVM and found real bugs — which is exactly why I'm not repeating that target as the headline. My SwapVM properties are differential and randomised rather than symbolic, and the new ground is ATS and CCA, where nothing exists.
**Q2: "You found zero bugs. Why does this deserve a prize?"** Because the harness is the deliverable and it's reusable — the grid shows exactly which properties are covered and which aren't. I'd rather hand you honest coverage than a staged finding.
**Q3: "How do I know your invariants are the right ones?"** They're derived from the sponsors' own documented guarantees, and I run 1inch's `CoreInvariants` suite alongside mine, naming which I deliberately relaxed and why.
**Q4 (Uniswap): "Is this a stack contribution or a test suite?"** It ships as a CI action any hook author can adopt, plus a CIP proposing a conformance profile for validation hooks. The suite is the artifact; the action is the contribution.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Zero findings** | Frame as coverage from day 1; the grid is the product. |
| **1inch requires an on-chain token transfer in the demo** | Ship a minimal Aqua app that executes one real fill — do not submit a pure test suite. |
| Usability is the weak axis | Budget a real day for the grid UI; it's the cheapest criterion to lift. |
| Slow compiles | Minimal harness; full runs twice daily. |
| Reads as three scripts | The `IInvariantTarget` adapter is the spine; lead the README with it. |
