# CLEARING HOUSE

**A tokenised-bond settlement venue where the trade and the cash never move separately.**
Compliance is checked *inside* the same transaction that settles both legs — and the venue proves,
from an index it does not control, that no non-compliant trade ever cleared.

> Hedera's Asset Tokenization Studio can *issue* a compliant bond. It deliberately ships no market —
> [their own docs name the gap](https://docs.hedera.com). CLEARING HOUSE is that market, built the
> way ATS was designed to allow: **it needs no permission from the issuer.**

---

## The one idea: a single seam

Everything hangs off one interface. Read this and you've read the project.

```
                       ┌─────────────────────────────────────────────┐
   place holds  ─────► │  MatchingEngine.settle(bondLeg, cashLeg)     │
   (seller: bond)      │    1. pre-flight  → EIP-1066 code + reason   │
   (buyer:  cash)      │    2. execute BOTH legs, atomically          │
                       │    3. emit SettlementReceipt                 │
                       └───────────────┬─────────────────────────────┘
                                       │  talks only to ISettlementLeg
              ┌────────────────────────┴────────────────────────┐
              ▼                                                  ▼
      HederaHoldLeg                                        ArcMemoLeg
  ATS executeHoldByPartition                     USDC transferFrom wrapped in Memo
  (msg.sender == hold.escrow,                    (Transfer.from = payer's EOA,
   compliance enforced inside)                    tradeId in an indexed Memo log)
```

- The **delivery leg** is always an ATS `Hold`. Execution gates *solely* on
  `msg.sender == hold.escrow` — so our matcher needs **no role, no whitelist, no issuer trust**.
- The **payment leg** is swappable: ATS deposit-token on Hedera, or USDC-via-`Memo` on Arc. Moving
  the cash rail is one `setLegs`, not a rewrite.
- Compliance isn't a bolt-on: `executeHoldByPartition` carries `onlyCompliant(address(0), _to,
  false)`, so **a buyer who lost KYC between placing and matching simply cannot be filled.**

Verified against the real ATS source in [`specs/ats-mechanism.md`](specs/ats-mechanism.md) and the
real Arc source in [`specs/arc-mechanism.md`](specs/arc-mechanism.md).

---

## Run it now (no accounts, no keys)

```bash
pnpm install
bash scripts/local-demo.sh      # needs foundry (forge/anvil) + node/pnpm
```

One command spins up anvil, deploys the venue, and plays all three demo moments:

1. **`one tx · delivery ∧ payment`** — three trades clear; each is a single transaction where the
   bond moves to the buyer *and* the cash moves to the seller, or neither does.
2. **KYC revoked → the same order rejects itself** — not "failed", but the *real* reason read from
   the chain before anything is signed: **`0x10 · DISALLOWED_OR_STOP · AddressNotVerified`**.
3. **The independent verifier catches a lie** — it reconstructs every settlement's compliance from
   public logs (sharing no venue code), confirms the honest report, then flags a fabricated trade by
   id when the venue misreports.

Or open the trading terminal — the live book, the pre-flight register, and the independent verifier:
```bash
pnpm --filter @clearing-house/app dev      # http://localhost:3737  (no keys)
```

Run the tests:
```bash
cd contracts && forge test        # 15 Solidity tests
pnpm --filter @clearing-house/verifier test   # 5 verifier tests
cd subgraph && pnpm codegen && pnpm build      # subgraph compiles to WASM
```

---

## What's built

| Component | Path | Status |
|---|---|---|
| `ISettlementLeg` — the seam | `contracts/src/interfaces/ISettlementLeg.sol` | ✅ |
| `MatchingEngine` — atomic compliant DvP | `contracts/src/MatchingEngine.sol` | ✅ 9 tests |
| `HederaHoldLeg` — ATS hold executor (escrow) | `contracts/src/legs/HederaHoldLeg.sol` | ✅ |
| `ArcMemoLeg` — USDC via Arc `Memo` | `contracts/src/legs/ArcMemoLeg.sol` | ✅ 6 tests |
| Independent verifier + agent-callable MCP | `verifier/` | ✅ 5 tests, MCP live |
| Subgraph (composes settlements + compliance) | `subgraph/` | ✅ live on Hedera (self-hosted graph-node) |
| Local end-to-end demo | `verifier/src/demo/e2e.ts` | ✅ runs |
| Order-book terminal (book · pre-flight register · verifier) | `app/` | ✅ builds, frontend + backend |
| **Live on Hedera testnet** (deploy + 2 atomic settlements + rejection) | `verifier/src/deploy/hedera.ts` | ✅ [on-chain](docs/hedera-deployment.md) |
| HashScan source verification (4/4 exact match) | `scripts/verify-hedera.sh` | ✅ Sourcify |
| Real bond issued via ATS Factory `0.0.9213391` | `verifier/src/deploy/ats-bond.ts` | ✅ [`0x6e19…522a`](https://hashscan.io/testnet/contract/0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a) |
| Real ATS bond **settled** through the venue (delivery via ATS hold) | `verifier/src/deploy/ats-settle.ts` | ✅ [settle tx](https://hashscan.io/testnet/transaction/0xf85dffd72b438f340a870d8e191218802672a1884f7affb85469b20097a9c93a) |
| x402 NAV endpoint · real paid request via Blocky402 | `services/nav-x402/` | ✅ [settlement tx](https://hashscan.io/testnet/transaction/0.0.7162784-1788882998-808742657) |
| ArcMemoLeg live on Arc testnet · USDC settled via Memo | `verifier/src/deploy/arc.ts` | ✅ [Arc settle tx](https://testnet.arcscan.app/tx/0x3a72c47b85f9e3eaf3066e7306f1dc9cdbafc640327f9bfbc0ebf1f77206b52f) |
| x402 NAV · Harness PR | — | ⏳ planned |

See [`BUILD_PLAN.md`](BUILD_PLAN.md) for the full sequence and cut order.

---

## Sponsors

**Hedera** — issues the bond on ATS (ERC-1400/3643) and provides the `Hold` escrow that makes a
permissionless secondary market possible. The whole DvP + compliance-rejection spine is Hedera.

**The Graph** — a subgraph composes two independent streams (settlements + ATS identity/control
events) and reconstructs per-trade compliance in-mapping; an independent verifier exposes that as an
agent-callable MCP (`verifier/SKILL.md`) that can catch the venue lying.

**Arc (Circle)** — the swappable payment rail. `ArcMemoLeg` settles USDC through Arc's `Memo`
contract so each settlement emits a `Transfer` from the payer's own address *and* an indexed `Memo`
carrying the trade id — provable reconciliation no other chain reproduces (CallFrom sender
delegation).

---

## Honest by construction
- **Atomicity is same-chain.** One EVM tx can't span Hedera and Arc, so atomic DvP is the Hedera
  headline; the Arc leg proves the *pluggable rail* + *provable reconciliation*, not cross-chain
  atomicity.
- **The demo shows the real reason code.** The idea doc's `0x56 IDENTITY_REGISTRY_NOT_VERIFIED` was
  fiction (`0x56` is `TRANSFER_VOLUME_EXCEEDED`); the chain actually returns `0x10 ·
  AddressNotVerified`, and that's what the UI/CLI display.
- **Reference contracts are reused, not redeployed** — ATS BLR `0.0.9212226`, Factory `0.0.9213391`.

## Repo layout
```
contracts/   Foundry — settlement contracts, ATS/Arc interfaces, tests
app/         Next.js order-book terminal (book · pre-flight register · verifier) + venue backend
verifier/    Independent verifier + CLI + MCP + the anvil e2e demo (+ SKILL.md)
subgraph/    The Graph subgraph (schema + mappings)
specs/       Source-verified mechanism notes (ATS, Arc)
docs/        Hedera account setup, etc.
scripts/     local-demo.sh (one-command demo)
```

## Deploying for real
- Hedera: [`docs/hedera-setup.md`](docs/hedera-setup.md) → fill `.env` → deploy scripts.
- Arc: fill `ARC_TESTNET_RPC` in `.env`; `ArcMemoLeg` targets USDC `0x3600…0000` + Memo
  `0x5294…E505`.
