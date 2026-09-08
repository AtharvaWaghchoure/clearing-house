# CLEARING HOUSE — order-book terminal

The trading surface for the venue: a live order book, an atomic **Match & Settle** that clears one
delivery-versus-payment trade, a **pre-flight register** that reads `engine.preflight()` and renders
the named EIP-1066 reason *before anything is signed*, and an **independent verifier** that catches
the venue's own backend lying.

```bash
pnpm --filter @clearing-house/app dev     # http://localhost:3737
```

## The three surfaces

1. **Order Book** — resting bid/ask holds on a tokenised senior bond (`HELVETIA 4.25% 2031`), with
   depth bars and desk names bound to the deterministic anvil accounts. Click a bid and an ask to
   stage a cross.
2. **Settlement · DvP** — the staged cross, its terms, and the **pre-flight register**: two legs
   (Delivery / Payment), each showing the decoded `canTransferByPartition` result —
   green `0x01 · SUCCESS` or red `0x10 · DISALLOWED_OR_STOP · AddressNotVerified`. The rail is
   swappable (Hedera Hold ⇆ Arc USDC) — the one `setLegs` seam, in the UI. Settlement is refused
   unless **both** legs clear, mirroring the Solidity revert.
3. **Independent Verifier** — POSTs the venue's self-report to the backend (`/api/venue/report`),
   then reconstructs each settlement's compliance from public facts (settlements + ATS
   `Verified`/`Blocked` events) sharing no venue code, and reconciles the two. Toggle **Fabricate**
   or **Hide last** and the backend misreports — the verifier flags it by trade id.

The **Identity Registry** console toggles a desk's ATS KYC on the bond token (emits a `Verified`
event, mines a block) — that is what flips a resting order's pre-flight from `0x01` to `0x10`, live.

## Front end *and* back end (Arc gate)

- **Back end** — `app/app/api/venue/report/route.ts` is the venue's reporting API. The lie is
  introduced *server-side*, so the client verifier genuinely catches the backend, not itself.
- **Front end** — everything else: the book, the atomic settle, the pre-flight register, and the
  independent reconstruction (`lib/verify.ts`, a faithful port of `verifier/src/verify.ts`).

## Faithful by construction

`lib/venue.ts` is not a mock — it enforces the same rules the Solidity does: pre-flight both legs,
execute atomically or not at all, gate delivery on ATS identity/control state, and record a
`SettlementReceipt` an independent index reads back. The selectors, EIP-1066 codes, token addresses,
and first trade ids line up 1:1 with `verifier/.local/local.json`, so the terminal is a true preview
of the on-chain venue. Point it at a live anvil deployment by reading that file and swapping
`lib/venue.ts`'s in-memory store for viem log reads — the components never change.

Stack: Next.js 14 (App Router) · viem · Instrument Serif + Martian Mono. Runs with no keys.
