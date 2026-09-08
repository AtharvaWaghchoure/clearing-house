# Arc payment rail — verified from source (`circlefin/arc-node@main`, 2026-09-07)

The swappable payment leg. Same `ISettlementLeg` interface as `HederaHoldLeg`; different rail.

## Addresses (Arc testnet — from docs.arc.io)
| Contract | Testnet address | Notes |
|---|---|---|
| USDC | `0x3600000000000000000000000000000000000000` | native gas token, optional ERC-20, **6 decimals** |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 decimals |
| Memo | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | attaches indexed memo metadata to a call |
| Multicall3From | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | batch with sender preservation |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | approvals |

## IMemo (exact, `contracts/src/memo/IMemo.sol`)
```solidity
event Memo(
    address indexed sender,     // ORIGINAL caller, preserved via the CallFrom precompile
    address indexed target,
    bytes32 callDataHash,
    bytes32 indexed memoId,     // ← we put the venue tradeId here (indexed → queryable)
    bytes   memo,               // ← trade metadata (bond token, seller, buyer, …)
    uint256 memoIndex
);
function memo(address target, bytes calldata data, bytes32 memoId, bytes calldata memoData) external;
```

## ICallFrom (exact, `contracts/src/call-from/ICallFrom.sol`)
```solidity
function callFrom(address sender, address target, bytes calldata data)
    external returns (bool success, bytes memory returnData);
```
`Memo` (and `Multicall3From`) route their subcalls through this precompile so the wrapped call runs
as a spoofed sender.

**Corrected against live Arc testnet (2026-09-08):** the precompile only lets an EOA spoof *itself* —
the spoofed sender **must equal `tx.origin`**. A contract calling `memo()` reverts with
`sender spoofing requires tx.origin as sender`. So **`Memo` is EOA-only**: the *payer* invokes it
directly, and inside the subcall `msg.sender` is the **payer** (`tx.origin`), not the calling
contract. (Our earlier source read had this backwards — it assumed the caller of `memo()` became the
sender.) Consequently the Arc cash leg is **payer-initiated**: the payer submits
`memo(USDC, transferFrom(payer, seller, amount), tradeId, meta)` (self-approved so the exact
`transferFrom` the `ArcMemoLeg` encodes still runs), yielding `Transfer.from == payer`. `ArcMemoLeg`
remains the reference for that calldata; it cannot itself invoke `memo()` on Arc.

Second live gotcha: Circle's USDC **blocklists well-known test addresses** (e.g. the anvil default
`0x7099…79C8`) — transfers to them revert `Blocked address`. Use fresh accounts.

## Why this is unportable (the Circle hostile-Q answer)
Wrapping `USDC.transferFrom(payer, seller, amount)` in `memo(USDC, …, tradeId, meta)` yields, in ONE
call, atomically:
- an ERC-20 `Transfer` whose **`from` is the payer's own address**, and
- a `Memo` event carrying the **tradeId as an indexed topic** and the trade metadata,

so reconciliation is provable from public logs. On a chain without the CallFrom precompile a batching
contract *becomes* the sender and the reference lives off-chain — the property is lost. No library
reproduces protocol-level sender delegation.

## Atomicity scope
Arc settlement is the **cash leg only**; the ATS bond lives on Hedera. One EVM tx cannot span both
chains, so cross-chain DvP is not claimed as atomic — the Arc leg proves the *pluggable rail* + the
*provable-reconciliation* property. Same-chain atomic DvP is the Hedera headline. See
[ats-mechanism.md](ats-mechanism.md).

## Mock note
The unit test emulates the CallFrom precompile inside `MockUSDC.callFromExec` with the leg as the
effective spender — a simplification that pre-dates the live finding above. On real Arc the sender is
`tx.origin` (the payer), so the leg's `transferFrom`-wrapping calldata is correct but is submitted by
the payer, not the leg. The live path is verified in `verifier/src/deploy/arc.ts` /
[`docs/arc-deployment.md`](../docs/arc-deployment.md).
