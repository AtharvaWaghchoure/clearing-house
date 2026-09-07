# NAMEGATE

## One-line pitch
An agent's authority to act **is** an ENS name — expiring, revocable, non-transferable — so revoking it mid-run makes the agent refuse itself on its very next action, with no redeploy and no restart.

## Sponsor bundle & prize exposure
**Slots: ENS · World · Privy**

| Prize line | $ | Places | P(win) | Reasoning |
|---|---|---|---|---|
| **ENS — Best Use of ENSv2** | $4,500 | 4 ($1.5k/$1.5k/$1k/$500) | **35%** | Est. 15–30 entries, **most a subname registrar with a UI** (the tutorial). Four prizes for that field is unusually good odds, and this uses the primitives nobody reaches. |
| **World — Selfie Check** | $3,500 | 1 | **20%** | ⚠️ Two human-approved gates, no SLA. Go/no-go Sep 6. |
| **Privy — Best B2B financial product** | $2,500 | flat, winner-take-all | **30%** | Policies + key quorums + **intents** — the prize names all three, and intents appear nowhere in Privy's changelog. |
| **Privy — Best financial flow** | $2,500 | flat, winner-take-all | **20%** | Requires a *generally available* flow — a self-serve **Morpho Earn** vault sweep. |

**Exposure $13,000 across 4 lines. EV ≈ $2,000.**

## Why this wins
- **The precedent is a $30,000 grand-prize-adjacent win.** **epPlex** took Solana Hyperdrive's Infrastructure 1st ($30k) for *"a protocol for minting ephemeral, epNFTs"* — expiring tokens as a primitive. **ENSv2's expiring / revocable / non-transferable subnames are that exact idea on a primitive nobody has touched**, brand new this cycle. It is the single best under-exploited primitive in the sponsor list.
- **It uses the ENSv2 feature almost nobody will find.** `_getRoles(resource, account)` is an **overridable read-time hook** — override it and permissions become a *computed function of external state* (time, an oracle, a human-backing lookup) with **no stored grant and no transaction.** The prize demands ENSv2 features be *"central, not cosmetic"*; here the name tree **is** the permission system.
- **The refusal beat is the whole product** (P3 + P12 stacked) — and a countdown hitting zero is the most legible visual in existence.
- **Privy's tracks are the clearest anti-agent-hype tracks at the event** — B2B workflow and financial flow, no AI framing. Enforcing the same capability at a second, independent layer (key quorum) is exactly "team permissions, quorum approvals, intents."

## Judging scorecard
| Criterion | Score | Justification |
|---|---|---|
| Technicality | **8** | A custom `PermissionedRegistry` overriding EAC internals, nybble-packed role bitmaps, cross-layer enforcement. |
| Originality | **9** | Nobody has done expiring capabilities on ENSv2; the `_getRoles` override is effectively undiscovered. |
| Practicality | **7** | Sepolia-only by necessity (ENSv2 is L1-Sepolia; Namechain is cancelled). |
| Usability | **8** | A permission matrix and a live countdown are inherently legible. |
| WOW | **9** | Revoke from another window; the agent refuses itself mid-sentence. |
| **Weighted** | **8.2/10** | |

## What it is (plain English)
When you let software act on your behalf, you usually hand it a key and hope your rules hold. The rules live in the same software, so they are only as strong as the code around them — and when you change your mind, you have to redeploy something.

NAMEGATE makes permission a *name*. An agent's right to do a specific thing is a subname like `treasury-payout.agent-7.yourorg.eth`. It expires on a date. It can be revoked. It cannot be transferred. And before every single action, the agent must look up its own name; if the record is gone, it stops.

The clever part is that the name's permissions are not stored — they are **computed**. Because ENSv2 lets you override how roles are read, a name's authority can depend on live conditions: has this agent's human backer been verified recently, is it inside its time window, has a risk signal fired. Nothing is written on chain to change a permission; the answer to "may I?" simply changes.

Underneath, a second, independent layer enforces the same thing on the money itself: the wallet only signs when a quorum agrees, and anything over budget becomes a proposal a human must authorise. Two locks, different keys.

## The demo moment
**(0–8s)** An agent runs a treasury sweep. Terminal shows it resolving `payout.agent-7.acme.eth` before each action — green, green, green. A countdown reads **`expires in 00:47`**.

**(8–16s)** A second window. One transaction: `revokeRoles`. Nothing is restarted. Nothing is redeployed.

**(16–24s)** The agent's **very next action** resolves the name, gets nothing, and **refuses itself** — printing `capability revoked: payout.agent-7.acme.eth` and halting. Caption: **`no redeploy. no restart. it just stops.`**

**(24–30s)** The agent tries to route around the name check and call the wallet directly. **Privy's policy denies it**, and an **intent** appears in the approvals inbox awaiting a 2-of-3 quorum. Caption: **`two locks, different keys.`**

## Technical architecture
```
                       ROOT: acme.eth  (ETHRegistry, Sepolia)
                                │ setSubregistry
                       ┌────────▼─────────────────┐
                       │  CapabilityRegistry       │  ← custom PermissionedRegistry
                       │   override _getRoles()     │
                       │     ├ stored grant bitmap  │
                       │     ├ AND expiry not passed│
                       │     └ AND ICapabilityOracle│ ← THE ADAPTER SEAM
                       └────────┬─────────────────┘
                                │
        agent-7.acme.eth ───────┼──── payout.agent-7.acme.eth   (expiring, non-transferable)
                                │      read.agent-7.acme.eth    (forever, emancipated)
                                ▼
                 ICapabilityOracle instantiations:
                   (a) TimeWindowOracle      — system timestamp
                   (b) HumanBackingOracle    — World AgentKit lookupHuman
                   (c) RiskOracle            — anomaly signal
                                ▼
   agent ──resolve own name (UniversalResolver proxy 0xeEeE…eEeE)──► allowed? 
                                │ yes
                                ▼
        Privy org wallet ── policy (calldata-decoded, allowlisted) ──► sign
                                │ over budget →
                                ▼
                    Intent proposed → 2-of-3 key quorum → auto-execute
```
**Non-transferable** = revoke `ROLE_CAN_TRANSFER_ADMIN`. **Forever names** = *emancipation* — revoke every dangerous and escalation role on `ROOT_RESOURCE`, then verify with `roleCount`. Both are ENSv2 features named in the prize text and used here non-cosmetically.

## Ecosystem components used
- **ENSv2 `PermissionedRegistry` + `_getRoles` override** — *If we deleted this, **permissions would be stored grants requiring a transaction to change, and the "authority is computed, not written" property — the entire thesis — disappears.***
- **ENSv2 expiring / non-transferable subnames + emancipation** — *If we deleted these, **capabilities would be permanent and tradeable, which is the opposite of a capability.***
- **ENSv2 Permissioned Resolver `authorizeTextRoles`** — *If we deleted this, **we could not scope an agent to a single record key, and the permission granularity collapses to all-or-nothing.***
- **World AgentKit `AgentBook.lookupHuman`** — *If we deleted this, **rate and authority budgets would key on wallet addresses, which an agent can mint infinitely; `lookupHuman` makes them per-human.***
- **Privy policies + key quorums + intents** — *If we deleted these, **the name check would be advisory — anything holding the key could ignore it. Privy makes the second lock real.***

## Novelty verification
Showcase search across Lisbon 2026, NY 2026, NY 2025, Cannes 2026, BA 2025, ETHOnline 2025, Open Agents, Agentic Ethereum. **ENS winners found:** ENSignv2 (name-as-wallet, social recovery), Namesake (claim a name → it becomes an agent), Agora (shared vault, ENS seats, **self-expiring mandates** — closest prior art, but mandates are off-chain policy, not the name itself), ENSFromWei (ENSIP-10 fallback resolver), OneName, chai, The Human Zoo.
**Nothing overrides `_getRoles`. Nothing uses emancipation. Nothing makes revocation the demo.** And the crowd prediction is explicit: most ENSv2 entries will be **a subname registrar with a UI**, because that is the tutorial.
⚠️ **Adjacent graveyard:** eight teams shipped agent mandates/allowance wrappers at Lisbon and five lost. **The distinction here is that the capability is an on-chain object with its own lifecycle, not a limit in a policy engine.** Hold that line.

## Buildability
**Weight: medium.** ~2,000 lines plus surfaces.
**Must-ship v1:** the custom registry with a working `_getRoles` override + the revoke-mid-run refusal demo. That alone carries the ENS line.
**Cut order:** Privy Earn sweep → World oracle → emancipation verifier UI → the permission matrix.
**Hardest unknown:** **the cross-chain read.** ENSv2 is on **Sepolia**; AgentBook is on **Base Sepolia / Base / World Chain**. A `view` on Sepolia **cannot** read Base Sepolia. Resolve on day 1: either deploy your own AgentBook on Sepolia (it's MIT and needs only a World ID router — **confirm one exists on Sepolia, currently unverified**) or relay attestations and label it a hackathon shim.
**Riskiest dependency:** **ENSv2 docs warn interfaces are *"not yet final"*** and an **Immunefi competition runs Aug 18 → Sep 14**, overlapping the entire event. **Pin commit `97a57293f3b4279d94b571e678edb53ce62638f4`.**

**Day-1 smoke test before writing app code:** resolve `ur.integration-tests.eth` → must return `0x2222…2222`. `0x1111…1111` means your web3 library is too old (need viem ≥2.35.0).

## Compliance checklist
- [ ] Staked · continuous commits · video 2:00–4:00 ≥720p own voice · AI attribution + `/specs`
- [ ] **Built on ENSv2, Sepolia**; ENSv2 features **central, not cosmetic**
- [ ] **Demo functional, NOT hard-coded values** (explicit ENS requirement)
- [ ] Video recording **and** live demo link; open source
- [ ] **Privy:** ≥1 wallet created/used; a business/org use case; ≥1 functional B2B workflow; **≥1 control (policies / signers / key quorums / intents)**; explain how Privy enables the product
- [ ] **Privy financial flow:** a **generally available** feature — self-serve **Morpho** Earn vault (Gauntlet USDC Prime or Steakhouse Prime Instant on Base, or Sentora PathUSD on Tempo). Aave/Veda/Kamino are sales-gated and would fail the bar
- [ ] **World (if pursued):** Sandbox App used; **feedback document** on docs, Developer Portal, Sandbox states/errors/edge cases, and what was confusing/missing/broken
- [ ] Use `@privy-io/node`, **not the deprecated `@privy-io/server-auth`**

## The pitch narrative
**Opening line:** *"Revoking an agent's permission usually means a redeploy. Watch me do it with one transaction, from a different window, while it's running."*

Problem → agent authority lives in software that must be changed to change it. Insight → ENSv2 makes a name a permission object with its own lifecycle, and its roles can be *computed* rather than stored. Solution → capability-as-subname, checked before every action, enforced again at the wallet. Demo → revoke; the next action refuses itself. Vision → agents get identity, permission and revocation from one namespace the whole ecosystem already resolves.

## Hostile Q&A prep
**Q1 (ENS): "Is ENSv2 actually central, or is this a wallet with a name on it?"**
Central. The registry is a custom `PermissionedRegistry` whose `_getRoles` I override — permissions are computed at read time from expiry plus an oracle, with no stored grant. Non-transferability comes from revoking `ROLE_CAN_TRANSFER_ADMIN`; the forever-name comes from emancipation, verified with `roleCount` on `ROOT_RESOURCE`. Remove ENSv2 and there is no capability object at all.

**Q2: "Eight teams shipped agent spending mandates at Lisbon and five lost. Why is this different?"**
Those enforce a *limit inside a policy engine*. Here the capability is an on-chain object with an expiry and a revocation bit that the agent must resolve before acting — and revocation is one transaction by the parent, with no cooperation from the agent's own software. The demo is the difference: I revoke from a separate window and nothing is redeployed.

**Q3: "Your agent checks its own name. What stops it skipping the check?"**
Nothing, alone — which is why the second lock exists. Privy's policy denies the direct call, and the over-budget path becomes an intent needing a 2-of-3 quorum. I show that exact bypass attempt failing on camera.

**Q4 (World): "AgentBook is on Base Sepolia; your registry is on Sepolia. How does that read work?"**
It can't, directly — a `view` on Sepolia cannot read Base Sepolia. I deploy my own AgentBook instance on Sepolia against the World ID router, or relay attestations, and I say which on the honest-gap slide. The verification logic itself is chain-agnostic — `viem.verifyMessage` plus one staticcall.

**Q5: "What's the failure mode if the oracle is down?"**
`_getRoles` fails closed — no answer means no roles, so the agent refuses. That's deliberate and it's the same posture as the expiry: absence of permission is not permission.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Cross-chain AgentBook read is impossible on Sepolia** | Resolve day 1: local AgentBook deploy, or a labelled relay shim. |
| ENSv2 redeploys mid-event (Immunefi runs to Sep 14) | Pin the deployment commit; generate ABIs from artifacts, never docs. |
| **THE demo-killer:** subname owner holds no roles on the parent resolver, so `setText` reverts `EACUnauthorizedAccountRoles` | Explicitly `authorizeNameRoles` them, or give each subname its own resolver. Test on day 2. |
| Privy key quorums are "reach out to us" gated | **Test in the first two hours.** Fall back to a 2-of-2 owner (user + app key), which needs no enablement. |
| World gates never open | Go/no-go Sep 6; drop World, keep ENS + Privy + a third. |
| Reads as a permissions demo, not a product | Frame as infrastructure: any agent framework can adopt capability-as-subname; ship the resolver check as a library. |
