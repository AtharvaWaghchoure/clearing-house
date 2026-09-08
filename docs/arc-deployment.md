# Live on Arc testnet

The swappable payment rail, on Circle's **Arc** (USDC-native L1, chain `5042002`, USDC is the gas
token). A USDC settlement through Arc's `Memo` contract carries the trade id in an **indexed** log and
emits an ERC-20 `Transfer` **from the payer's own EOA** — so the settlement reconciles from public
logs alone. That's the property no other chain reproduces (protocol-level sender delegation).

Reproduce (fund the operator at [faucet.circle.com](https://faucet.circle.com) → Arc Testnet first):

```bash
pnpm --filter @clearing-house/verifier exec tsx src/deploy/arc.ts
```

## Deployment (run of 2026-09-08)

| | |
|---|---|
| `ArcMemoLeg` (reference) | `0x2fc6b3c50f7a91d31569b2ba07c19147d84520dd` — [Arcscan](https://testnet.arcscan.app/address/0x2fc6b3c50f7a91d31569b2ba07c19147d84520dd) |
| Settlement tx | [`0x3a72c47b…`](https://testnet.arcscan.app/tx/0x3a72c47b85f9e3eaf3066e7306f1dc9cdbafc640327f9bfbc0ebf1f77206b52f) · block 61102114 · **success** |
| USDC | `0x3600000000000000000000000000000000000000` · Memo `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |

## What the settlement proves (read from the receipt logs)

- **`Transfer( from = 0x5eb6…5993, to = 0xa32a…7e9e, value = 1 USDC )`** on USDC — the `from` is the
  **payer's own EOA**, not a contract.
- **`Memo( sender = 0x5eb6…5993, target = USDC, memoId = 0x…0a2c )`** — the `memoId` (= the venue
  tradeId) is an **indexed** topic, so a settlement is queryable/reconcilable by trade id.

Both in one transaction. On a chain without the CallFrom precompile a batching contract *becomes* the
`Transfer` sender and the trade reference lives off-chain — the property is lost.

## Two things the live network corrected (honest findings)

1. **Arc's `Memo` is EOA-only.** CallFrom only lets an EOA spoof *itself* (`sender == tx.origin`); a
   contract calling `memo()` reverts `sender spoofing requires tx.origin as sender`. Our earlier
   source read assumed the *caller* of `memo()` became the sender. So the Arc cash leg is
   **payer-initiated**: the payer submits `memo(USDC, transferFrom(payer, seller, amount), tradeId)`
   directly (self-approved so the exact `transferFrom` `ArcMemoLeg` encodes still runs). The
   `ArcMemoLeg` contract is deployed as the reference for that calldata; it cannot invoke `memo()`
   itself on Arc. Contrast Hedera, where the settlement is contract-driven (`engine.settle`).
2. **Circle USDC blocklists well-known test addresses** (e.g. anvil's `0x7099…79C8`) — transfers to
   them revert `Blocked address`. The demo settles to a fresh account we control.

## Mainnet (Sep 16–30 window)

Arc mainnet opens 2026-09-16. The same script re-points at the mainnet RPC/USDC to satisfy the
"Launch on Testnet → push to Mainnet" line — return in-window to post the mainnet tx.
