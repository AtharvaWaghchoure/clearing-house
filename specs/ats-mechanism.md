# ATS Hold Mechanism — verified from source (`hashgraph/asset-tokenization-studio@main`, 2026-09-07)

This is the ground truth the settlement contracts are built against. Every claim below was
read directly from the cloned ATS source, not inferred.

## Deployed reference contracts (Hedera testnet — reuse, do not redeploy)
| Role | Hedera ID | EVM address |
|---|---|---|
| BusinessLogicResolver (BLR) | `0.0.9212226` | `0xba2d5fc2083a0b8f164c50e65d782087fba18e0a` |
| Factory | `0.0.9213391` | `0xd1f118a40f3b02883d35909ef2517e7edd78379d` |

Default partition: `_DEFAULT_PARTITION = 0x0000…0001` (`constants/values.sol`).

## The `Hold` struct (`facets/hold/IHoldTypes.sol`)
```solidity
struct Hold {
    uint256 amount;
    uint256 expirationTimestamp;   // 0 = never expires
    address escrow;                // ONLY address allowed to execute
    address to;                    // intended recipient; 0 = open (chosen at execute)
    bytes   data;
}
struct HoldIdentifier { bytes32 partition; address tokenHolder; uint256 holdId; }
```

## Create (`IHoldByPartition.createHoldByPartition`)
```solidity
function createHoldByPartition(bytes32 _partition, Hold calldata _hold)
    external returns (bool success_, uint256 holdId_);
```
Modifiers: `onlyOperational onlyActivated onlyUnpaused onlyClearingDisabled …
notZeroAddress(_hold.escrow) onlyDefaultPartitionWithSinglePartition(_partition)`.
- **`onlyClearingDisabled`** → holds require clearing OFF (the mutual exclusion the plan flagged).
- `escrow` must be non-zero; `to` **may be zero** (open-recipient hold).

## Execute (`IHoldByPartition.executeHoldByPartition`) — the settlement primitive
```solidity
function executeHoldByPartition(HoldIdentifier calldata _id, address _to, uint256 _amount)
    external returns (bool success_, bytes32 partition_);
```
Modifiers: `onlyOperational onlyActivated onlyUnpaused
onlyDefaultPartitionWithSinglePartition(_id.partition)
onlyIdentifiedAddresses(_id.tokenHolder, _to)
onlyCompliant(address(0), _to, false)
onlyValidHoldId(_id)`  — **note: NO `onlyClearingDisabled`.**

Internal gate (`HoldStorageWrapper._validateExecuteHold`):
1. `ControlListStorageWrapper.isAbleToAccess(tokenHolder)` — holder not blocked.
2. `hold.to == 0 || _to == hold.to` else `InvalidDestinationAddress`.
3. not expired, else `HoldExpirationReached`.
4. **`isEscrow(hold, msg.sender)` else `IsNotEscrow`** → `escrow == hold.escrow`. This is the
   entire permissionless thesis: execution gates SOLELY on caller == escrow, no role.

### The two load-bearing consequences
- **Atomicity is safe:** create needs clearing-disabled, execute does not. Holds are placed in
  normal mode; a single settlement tx `execute`s both legs — no clearing-mode conflict.
- **Compliance is enforced inside execute:** `onlyCompliant(address(0), _to, false)` +
  `onlyIdentifiedAddresses` + control-list check. A buyer who lost KYC between placing and
  matching makes `executeHoldByPartition` revert. The venue cannot fill a non-compliant trade.
- **Open-recipient holds** (`to == 0`) let a seller rest a sell order before a buyer exists; the
  escrow (our leg) directs the tokens to the matched buyer at execute time. This is what makes a
  real order book — not just bilateral RFQ — possible.

## Compliance pre-flight (`IComplianceByPartition.canTransferByPartition`)
```solidity
function canTransferByPartition(address _from, address _to, bytes32 _partition,
    uint256 _value, bytes _data, bytes _operatorData)
    external view returns (bool status, bytes1 code, bytes32 reason);
```
`code` = EIP-1066 byte; `reason` = the Solidity error selector (bytes32) explaining it.

### Real reason codes (`domain/asset/ERC1594StorageWrapper.sol`, `constants/eip1066.sol`)
| Condition | EIP-1066 `code` | `reason` selector |
|---|---|---|
| Identity **not verified** (KYC revoked) | `0x10 DISALLOWED_OR_STOP` | `AddressNotVerified(address)` |
| Invalid KYC status | `0x10 DISALLOWED_OR_STOP` | `InvalidKycStatus` |
| Account blocked (control list) | `0x10 DISALLOWED_OR_STOP` | `AccountIsBlocked(address)` |
| Wallet recovered | `0x16 REVOKED_OR_BANNED` | `WalletRecovered` |
| Paused | `0x42 PAUSED` | `IsPaused` |
| Clearing activated | `0x40 UNAVAILABLE` | `ClearingIsActivated` |
| Insufficient balance | `0x54 INSUFFICIENT_FUNDS` | — |
| OK | `0x01 SUCCESS` | `0x0` |

> ⚠️ The idea doc's `0x56 IDENTITY_REGISTRY_NOT_VERIFIED` is **wrong** on both counts: `0x56` is
> `TRANSFER_VOLUME_EXCEEDED`, and identity failure actually returns `0x10 · AddressNotVerified`.
> The UI decodes the real `(code, reason)` pair returned on-chain, so the demo stays honest.

## Settlement design that follows from this
```
MatchingEngine.settle(bondLeg, cashLeg)                  (one tx, one chain)
  1. preflight: canTransferByPartition(seller→buyer) on bond,
                canTransferByPartition(buyer→seller) on cash   → fail fast w/ (code,reason)
  2. bondLeg.execute()  → ATS.executeHoldByPartition(bondHold, buyer, qty)   (msg.sender=leg=escrow)
  3. cashLeg.execute()  → ATS.executeHoldByPartition(cashHold, seller, px)   (or Arc USDC memo)
  4. emit SettlementReceipt(tradeId, …)                    → indexed independently
  If any step reverts, the whole tx reverts. Both legs move or neither does.
```
Escrow identity = the **leg adapter** (venue-side), named by the holder at create time. No issuer
role grant → any matcher works with any issuer. Payment leg is the swappable `ISettlementLeg`
(`HederaHoldLeg` = ATS deposit-token, `ArcMemoLeg` = USDC on Arc).

### Atomicity scope (be precise in the README)
One EVM tx cannot span Hedera and Arc. **Atomic DvP is same-chain** (Hedera bond + Hedera cash =
the headline). The Arc leg proves the payment rail is *pluggable* and that USDC settlement carries
its trade ref in an indexed log from the payer's own EOA (provable reconciliation) — it is not
claimed as one-tx cross-chain atomicity.
