# Getting a Hedera testnet account (5 minutes)

You need a funded testnet account with an **ECDSA** key (Solidity/EVM tooling uses ECDSA, not
ED25519). This unlocks the on-chain steps: deploying the venue, issuing a bond via the ATS Factory,
and HashScan verification.

## 1. Create the account
1. Go to **https://portal.hedera.com/** and sign in (email is fine).
2. Choose **Testnet**. The portal provisions an account pre-funded with ~1000 test HBAR.
3. In the account view, select the **ECDSA** key type and copy:
   - **Account ID** — looks like `0.0.1234567`
   - **HEX Encoded Private Key** — `0x…` (this is your `HEDERA_OPERATOR_KEY`)
   - **EVM address** — `0x…` (derived from the ECDSA key; how contracts see you)

> Need more HBAR later? The portal has a faucet button, or use https://portal.hedera.com/faucet.

## 2. Put it in `.env`
Copy `.env.example` to `.env` (already gitignored) and fill:
```
HEDERA_OPERATOR_ID=0.0.1234567
HEDERA_OPERATOR_KEY=0x<your ECDSA hex private key>
HEDERA_RPC=https://testnet.hashio.io/api
```

## 3. Verify it works
```bash
# balance of your EVM address via the Hashio JSON-RPC relay
cast balance 0x<yourEvmAddress> --rpc-url https://testnet.hashio.io/api

# or via the mirror node (no key needed)
curl -s "https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.1234567" | jq '.balance'
```
A non-zero balance means you're ready.

## What this unlocks
Once `.env` is set, the deploy scripts (Phase 1 of the build plan) can:
- deploy `MatchingEngine` + `HederaHoldLeg` to testnet (compiled with `evm_version = paris` for
  Hedera compatibility),
- issue a compliant bond through the **already-deployed** ATS Factory `0.0.9213391` (never redeploy
  the BLR — ~180M gas), KYC the accounts, place holds, and clear a live settlement,
- point the subgraph (`subgraph/networks.json`) and the verifier (`CH_CONFIG`) at the real
  addresses, so the exact same demo runs against Hedera instead of anvil.

Everything else already runs today with **no account** via `scripts/local-demo.sh`.
