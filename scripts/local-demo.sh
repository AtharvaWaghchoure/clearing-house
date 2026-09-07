#!/usr/bin/env bash
# CLEARING HOUSE — one-command local end-to-end demo.
# Builds the contracts, starts a local anvil, deploys the venue, clears three compliant trades,
# rejects a de-KYC'd order with the real named reason, and runs the INDEPENDENT verifier against
# the chain (catching a fabricated trade). No external credentials required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ building contracts"
forge build --root contracts >/dev/null

echo "→ starting anvil"
anvil --silent >/tmp/ch-anvil.log 2>&1 &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if curl -s -m2 -o /dev/null -X POST http://127.0.0.1:8545 \
      -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'; then
    break
  fi
  sleep 0.3
done

echo "→ running demo"
pnpm -C verifier exec tsx src/demo/e2e.ts
