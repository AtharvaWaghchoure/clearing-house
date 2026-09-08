# NAV · x402 (HTTP just got paid)

An x402-gated endpoint that sells the **Net Asset Value** of the tokenised bond. `GET /nav` returns
HTTP **402** with payment terms; once an agent pays (in HBAR, on Hedera testnet, settled through the
**Blocky402** facilitator), the server returns the live NAV — computed from the real ATS bond's
on-chain `totalSupply`.

```
 agent ──GET /nav──────────────►  server
       ◄──402 + PAYMENT-REQUIRED──   (scheme exact · hedera:testnet · 0.1 HBAR → payTo)
   builds a partially-signed Hedera transfer (payer signs; fee payer left to the facilitator)
       ──GET /nav + X-PAYMENT─────►  server ──/verify──► Blocky402
                                     server ──/settle──► Blocky402 ──adds fee-payer sig, submits──► Hedera
       ◄──200 + NAV + X-PAYMENT-RESPONSE──
```

## Run it

```bash
# terminal 1 — the paywalled service (reads the bond NAV from Hedera)
pnpm --filter @clearing-house/nav-x402 serve      # http://localhost:4021/nav

# terminal 2 — an agent that pays and fetches (uses the operator key from .env)
pnpm --filter @clearing-house/nav-x402 pay
```

- **Server** (`src/server.ts`) — plain Express + `@x402/core` (`HTTPFacilitatorClient` → Blocky402,
  `decodePaymentSignatureHeader` / `encodePaymentRequiredHeader` / `encodePaymentResponseHeader`). The
  402 carries the v2 terms in the `PAYMENT-REQUIRED` header; on a paid retry it verifies then settles
  through Blocky402 and returns the NAV + an `X-PAYMENT-RESPONSE` settlement receipt.
- **Client** (`src/pay.ts`) — `@x402/fetch` + `@x402/hedera`: `createClientHederaSigner` →
  `ExactHederaScheme` → `wrapFetchWithPayment`. It auto-handles the 402 and prints the settlement tx.
- **NAV** (`src/nav.ts`) — live `totalSupply()` on the ATS bond `0x6e19…522a`, marked at a clean price.

## The qualifying paid request (real, on-chain)

A real payment settled through Blocky402 on Hedera testnet — captured in
[`settlement-proof.json`](settlement-proof.json) (mirror-node record, since Blocky402 has no SLA):

| | |
|---|---|
| Settlement tx | `0.0.7162784@1788882998.808742657` · `CRYPTOTRANSFER` · **SUCCESS** — [HashScan](https://hashscan.io/testnet/transaction/0.0.7162784-1788882998-808742657) |
| Payer → payTo | `0.0.10413613` **−0.1 HBAR** → `0.0.10417883` **+0.1 HBAR** |
| Fee payer | `0.0.7162784` (Blocky402) paid the network fee — the x402 sponsored-gas model |
| Bought | `{ navUsd: 19.97, unitsOutstanding: 20, bond: HELV31 }` — live from the ATS bond |

## Notes

- **Facilitator:** Blocky402 (`https://api.testnet.blocky402.com`), scheme `exact`, network
  `hedera:testnet`, fee payer `0.0.7162784` — from its `/supported`. Open access, no API key. This is
  **not** `x402.org/facilitator`.
- **Asset:** HBAR (`0.0.0`) to avoid HTS token association; USDC (`0.0.429274`) also works. HBAR isn't
  in the client's default-asset table, so the client opts in with `setSpendControls({ allowedAssets: true })`.
- Hedera's `exact` scheme uses **partially-signed native transactions**: the payer signs the transfer,
  the facilitator adds the fee-payer signature and submits — so the agent never pays gas.
