# SUBSTREAMS-RESCUE

## One-line pitch
graph-node v0.42.0 deleted Substreams-powered subgraphs and stranded everyone who had one — this migrates them automatically and proves the migration is correct with **zero entity diff across 10,000 blocks**.

## Sponsor bundle & prize exposure
**Slots: The Graph · Hedera · Bazantic**

| Prize line | $ | Places | P(win) | Reasoning |
|---|---|---|---|---|
| **The Graph — Composable/Standardized** | $5,000 | 3 | **30%** | Substreams → sink → subgraph is a *live-viable* composition, and the migration target is the sponsor's own breakage. |
| **The Graph — AI Tooling (From Scratch)** | $5,000 | 3 | **25%** | The migrator shipped as an agent SKILL + MCP tool = reusable infrastructure. |
| **Hedera — Improve the Hedera Harness** | $2,000 | 2 × $1,000 | **50%** | **1★ repo, one substantive open issue, two community PRs ever.** |
| Bazantic — Best Recipe / Agentify | $2,000 | 3+3 | **35%** | Wrap the migrator as a gateway; zero sponsor APIs on the platform. |

**Exposure $14,000. EV ≈ $1,900.**

## Why this wins
**P10 — solve the sponsor's fresh wound, publicly.** graph-node NEWS.md v0.42.0, verbatim: *"Substreams support removed… **Substreams-based subgraphs will no longer work.**"* Confirmed structurally — there is no `chain/substreams` in the workspace. Every team with one is stranded, and the designated successor (`kind: amp`) is **enterprise sales-gated with source unreleased and every docs subpath 404ing**.

The precedent is direct: **High TPS Solana Client won Renaissance Infrastructure 1st ($30k) by shipping a better validator client than the chain had.** Sponsor-prize judges are the sponsor's own engineers, and they score on *"does this reduce my backlog."*

**The falsifiable claim is unarguable:** take a real public Substreams-powered subgraph, migrate it, and show **entity-by-entity equivalence across 10,000 blocks** — two hashes matching on screen (P9 + P13).

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **7** | Manifest transformation, a sink pipeline, a differential comparator. Craft rather than invention. |
| Originality | **7** | Nobody is doing migration tooling; the breakage is six months old. |
| Practicality | **10** | It solves a live problem for real users today. |
| Usability | **8** | One command; a diff report; a SKILL file. |
| WOW | **6** | "Zero diff" is quietly devastating rather than loud. |
| **Weighted** | **7.6/10** | |

## What it is (plain English)
The Graph used to let you feed a subgraph from a Substreams pipeline — the fast path for big datasets. In March 2026 that support was removed from the indexing software entirely. Not deprecated: deleted. Anyone who built that way now has code that cannot run on the network, and the official replacement is a product you can only get by talking to a sales team.

SUBSTREAMS-RESCUE reads one of those broken manifests and mechanically produces a working replacement — routing the Substreams output through a supported sink into a conventional subgraph. Then it does the part that matters: it runs the old pipeline and the new one over the same range of blocks and compares every entity they produce, field by field, printing a diff wherever they disagree.

If the diff is empty, you have a migration you can trust. If it isn't, you have a precise list of what changed, which is far more useful than a promise.

## The demo moment
**(0–10s)** A real public Substreams-powered subgraph manifest. One command: `rescue migrate ./subgraph.yaml`. New manifest + mappings emitted.
**(10–22s)** `rescue verify --blocks 10000`. A progress bar. Then: **`entities compared: 84,213 · diffs: 0`** and two matching state hashes side by side.
**(22–30s)** Deliberately corrupt one handler. Re-run. **`diffs: 1`**, with the exact entity id, field, and both values. Caption: **`it catches itself.`**

## Ecosystem components used
- **Substreams + `substreams sink postgres/clickhouse`** (folded into the core CLI in v1.20.2) — *If we deleted this, **there is no supported path off the deleted code path and the migration has no destination.***
- **Subgraph + Gateway (live data)** — *If we deleted this, **there is nothing to migrate *to* and no way to verify against the network.***
- **The Graph agent SKILLs** — *If we deleted this, **the migrator is a one-off script instead of something an agent can invoke on any stranded repo.***
- **Hedera Harness `chainAssertions`** — *If we deleted this, we lose the contribution line; the PR exists **because the harness's CHAIN stage claims mirror-node verification and contains zero mirror-node code**.*
- **Bazantic gateway** — *If we deleted this, **the migrator isn't callable by agents that haven't installed it.***

## Buildability
**Weight: light-medium.** ~1,200 lines.
**Must-ship v1:** the manifest transformer + the differential comparator on one real public subgraph.
**Cut order:** Bazantic gateway → Harness PR (do it anyway, it's 1.5 days and near-free) → the SKILL packaging.
**Hardest unknown:** whether a representative stranded subgraph can be *run* at all post-removal to produce a baseline — you may need to pin an older graph-node in Docker to generate the "before" side.
**Riskiest dependency:** docs still list the **archived** `streamingfast/substreams-sink-sql` as official; use the in-CLI `substreams sink postgres`.

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **Live data from a Graph provider**; composition of 2+ products explicit
- [ ] **Reusable infrastructure, not a single end-user app** ✔ · **README or SKILL.md so judges can run it**
- [ ] Hedera Harness: **PR link** (unmerged fine) against **`dev`, not `master`**; `npm i -D hedera-harness@next`
- [ ] Bazantic: gateway + Recipe + **username in the submission**

## Hostile Q&A prep
**Q1: "Is this just a codemod?"** The transformer is, deliberately. The contribution is the **verifier** — entity-level differential equivalence over a real block range, which is the only thing that makes a migration trustworthy.
**Q2 (Graph): "Why not tell people to use Amp?"** Because Amp's source is unreleased, `thegraph.com/amp/` is a Request-a-Demo page, and every `ampup.sh/docs` subpath 404s. Nobody can self-serve onto it today. This unblocks people now.
**Q3: "How many projects are actually stranded?"** Unverified, and I say so — I found no public count. What I can show is that the removal is real, the replacement is gated, and the migration path is undocumented.
**Q4 (Hedera): "How is a Harness PR related to a Graph migration tool?"** It isn't thematically — it's the same discipline applied twice: both fix a gap between what a tool claims and what it does. The harness README claims mirror-node verification and ships none.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Can't produce a "before" baseline | Pin an older graph-node in Docker on day 1; if impossible, verify against the *published* subgraph's live query results instead. |
| Reads as unglamorous | Lean into it — "zero diff across 10,000 blocks" plus two matching hashes is a research artifact, not a dashboard. |
| Low ceiling | Accepted. This is the floor play, not the ceiling play. Pair it with the Harness PR for two near-certain lines. |
