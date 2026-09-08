# CLEARING HOUSE — architecture & submission map

A tokenised-bond settlement venue where delivery and payment clear in **one atomic transaction**,
compliance is checked **inside** it, and an **independent index** proves no non-compliant trade ever
cleared. Three sponsors, one seam.

## The one seam: `ISettlementLeg`

Everything hangs off a single interface. Read it and you've read the system.

```
                          ┌──────────────────────────────────────────────┐
   place holds  ───────►  │  MatchingEngine.settle(bondLeg, cashLeg)      │
   (seller: bond)         │    1. pre-flight  → EIP-1066 code + reason    │
   (buyer:  cash)         │    2. execute BOTH legs, atomically           │
                          │    3. emit SettlementReceipt                  │
                          └───────────────┬──────────────────────────────┘
                                          │ talks only to ISettlementLeg
                 ┌────────────────────────┴───────────────────────────┐
                 ▼                                                     ▼
         HederaHoldLeg                                           ArcMemoLeg
   ATS executeHoldByPartition                        USDC transferFrom wrapped in Memo
   (msg.sender == hold.escrow,                        (Transfer.from = payer's EOA,
    compliance enforced inside)                        tradeId in an indexed Memo log)
```

The delivery leg is *always* an ATS hold; the payment leg is *swappable* — one `setLegs`, no rewrite.

## Full system (all live on testnet)

```
   HEDERA (compliance + delivery)                    ARC / Circle (settlement rail)
   ┌─────────────────────────────────┐               ┌────────────────────────────────┐
   │ ATS bond (ERC-1400/3643)         │               │ USDC (native gas, 6dp)          │
   │  issued via Factory 0.0.9213391  │               │  0x3600…0000                    │
   │  → 0x6e19…522a  (HELV31)          │               │ Memo 0x5294…E505 (CallFrom)     │
   │ HederaHoldLeg 0x0b55…d05e (escrow)│              │ payer-initiated: memo(USDC,      │
   │ MatchingEngine 0x5246…83b6        │               │   transferFrom(payer,seller,amt),│
   │  atomic DvP · 0x10 rejection      │               │   tradeId)  → Transfer.from=payer│
   └───────────────┬──────────────────┘               └──────────────┬─────────────────┘
                   │ SettlementReceipt (indexed)                      │ Transfer + indexed Memo(tradeId)
                   ▼                                                  ▼
        ┌──────────────────────── THE GRAPH ─────────────────────────────┐
        │ subgraph: SettlementReceipt ⋈ ATS Verified/Blocked (2 tokens)   │
        │   → reconstructedCompliant IN-MAPPING (live on Hedera)          │
        │ verifier + MCP: same reconstruction, shares no venue code →     │
        │   "was trade N compliant?" · catches a fabricated trade by id   │
        └──────────────────────────────┬─────────────────────────────────┘
                                        ▼
        ┌──────────────── x402 (agentic payments) ───────────────────────┐
        │ GET /nav → 402 → agent pays USDC-on-Hedera via Blocky402 →      │
        │ live NAV of the ATS bond. Real paid request, fee sponsored.     │
        └────────────────────────────────────────────────────────────────┘
```

## Live deployments

| Chain | Artifact | Address / tx |
|---|---|---|
| Hedera testnet | MatchingEngine · HederaHoldLeg | `0x5246…83b6` · `0x0b55…d05e` (source-verified) |
| Hedera testnet | ATS bond (via Factory) | `0x6e19…522a` (`0.0.10418524`) |
| Hedera testnet | atomic DvP settle | `0xf85dffd7…` (buyer holds 10 of the ATS bond) |
| Hedera testnet | subgraph | self-hosted graph-node, live-synced from block 40252086 |
| Hedera testnet | x402 NAV paid request | `0.0.7162784@1788882998…` (Blocky402) |
| **Arc testnet** | **ArcMemoLeg** | **`0x2fc6…20dd`** |
| **Arc testnet** | **USDC settlement via Memo** | **`0x3a72c47b…`** (`Transfer.from = payer`, `Memo.memoId = tradeId`) |

Details: [`hedera-deployment.md`](../docs/hedera-deployment.md) · [`arc-deployment.md`](../docs/arc-deployment.md).

## Sponsor track map — what earns each line

**Hedera**
- *Tokenization of Anything* — a real ATS bond issued via the Factory and **settled** through the
  venue (atomic DvP, `0x10 · AddressNotVerified` rejection), contracts source-verified on HashScan.
- *AI & Agentic Payments (x402)* — the NAV endpoint behind Blocky402, with a real paid request.

**The Graph**
- *Composable / Standardized* — the subgraph composes 2 products (venue settlements + ATS identity
  events from two tokens) and reconstructs per-trade compliance in-mapping, live on Hedera.
- *AI Tooling (From Scratch)* — the independent verifier as an agent-callable MCP (`verifier/SKILL.md`).

**Arc / Circle** — *frontend `app/` + backend `app/app/api/*` + this diagram; the Arc integration is
`ArcMemoLeg` + the live settlement above.*
- **Best DeFi stablecoin-native Pool** — the venue settles the cash leg **natively in USDC on Arc**
  through `Memo`, so each settlement is an on-chain USDC `Transfer` from the payer with the trade id
  in an indexed log — a stablecoin-native settlement primitive.
- **Best Agentic Economy** — an agent settles/queries the venue autonomously: the x402 client pays for
  NAV, and the verifier MCP answers "was trade N compliant?" — the venue is machine-operable.
- **Launch on Testnet → Mainnet** — `ArcMemoLeg` is live on Arc **testnet** now; the same
  `verifier/src/deploy/arc.ts` re-points at mainnet in the Sep 16–30 window.

## Honest by construction
- **Atomicity is same-chain.** One EVM tx can't span Hedera + Arc; the Arc leg proves the *pluggable
  rail* + *provable reconciliation*, not cross-chain atomicity. Hedera is the atomic-DvP headline.
- Findings surfaced against live networks are documented, not hidden: the real `0x10` reason code
  (not the idea doc's fictional `0x56`), Arc's `Memo` being tx.origin-gated, and Circle USDC's
  test-address blocklist.
