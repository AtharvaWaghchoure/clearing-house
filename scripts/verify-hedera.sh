#!/usr/bin/env bash
# Source-verify the current Hedera deployment on Sourcify (which HashScan reads).
#
# forge's built-in `--verifier sourcify` speaks Sourcify's deprecated v1 API; the public server is
# v2-only now. So we use forge only to emit the exact standard-JSON input, then drive the Sourcify v2
# API directly. Reads the addresses from the last deploy (verifier/.local/hedera.json).
#
# Usage:  bash scripts/verify-hedera.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/verifier/.local/hedera.json"
SOLC="0.8.24+commit.e11b9ed9"          # must match contracts/foundry.toml solc
SOURCIFY="https://sourcify.dev/server"
CHAIN=296

[ -f "$DEPLOY" ] || { echo "no $DEPLOY — run the Hedera deploy first"; exit 1; }

verify() {
  local addr="$1" ref="$2"
  if [ -z "$addr" ] || [ "$addr" = "null" ]; then echo "  skip $ref (no address)"; return; fi
  if ! forge verify-contract --root "$ROOT/contracts" --show-standard-json-input "$addr" "$ref" > /tmp/sc-in.json 2>/tmp/sc-err; then
    echo "  $ref -> forge std-json failed: $(cat /tmp/sc-err)"; return
  fi
  jq -n --slurpfile s /tmp/sc-in.json --arg cv "$SOLC" --arg ci "$ref" \
    '{stdJsonInput:$s[0],compilerVersion:$cv,contractIdentifier:$ci}' > /tmp/sc-body.json
  local vid
  vid=$(curl -s --max-time 40 -X POST "$SOURCIFY/v2/verify/$CHAIN/$addr" -H 'content-type: application/json' --data @/tmp/sc-body.json | jq -r '.verificationId // empty')
  if [ -z "$vid" ]; then echo "  $ref -> submit failed"; return; fi
  for _ in $(seq 1 20); do
    local j; j=$(curl -s --max-time 20 "$SOURCIFY/v2/verify/$vid")
    if [ "$(echo "$j" | jq -r '.isJobCompleted // false')" = true ]; then
      echo "  $(printf '%-42s' "$ref") $addr -> $(echo "$j" | jq -r '.contract.match // .error.customCode // "?"')"
      return
    fi
    sleep 2
  done
  echo "  $ref -> timeout"
}

read -r engine leg bond cash < <(jq -r '[.engine, .holdLeg, .bondToken, .cashToken] | @tsv' "$DEPLOY")
echo "Verifying the Hedera deployment on Sourcify (chain $CHAIN)…"
verify "$engine" src/MatchingEngine.sol:MatchingEngine
verify "$leg"    src/legs/HederaHoldLeg.sol:HederaHoldLeg
verify "$bond"   test/mocks/MockATSSecurity.sol:MockATSSecurity
verify "$cash"   test/mocks/MockATSSecurity.sol:MockATSSecurity
echo "Done. HashScan shows verified source at https://hashscan.io/testnet/contract/<address>"
