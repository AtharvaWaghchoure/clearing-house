// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title ISettlementLeg
/// @notice THE SEAM. One leg of a settlement — delivery (the bond) or payment (the cash).
///         Every rail the venue supports implements this one interface, which is why the project
///         is a single idea and not three integrations:
///           - HederaHoldLeg  → an ATS `Hold` executed by the escrow (bond, or Hedera cash)
///           - ArcMemoLeg     → USDC on Arc wrapped in `Memo` (cash, provable reconciliation)
///         The MatchingEngine only ever talks to ISettlementLeg; swapping the payment rail is a
///         one-line `setLegs`, not a rewrite.
interface ISettlementLeg {
    /// @param token     settlement asset (ATS security diamond, ATS deposit token, or USDC)
    /// @param from      party whose pre-committed value moves (hold owner / payer)
    /// @param to        recipient of this leg
    /// @param amount    units to move (asset's smallest unit)
    /// @param partition ATS partition (ignored by non-ATS legs)
    /// @param holdId    ATS hold id (ignored by non-ATS legs)
    /// @param tradeId   venue trade id, carried into receipts/logs for the independent verifier
    /// @param extra     adapter-specific payload (e.g. Arc memo metadata)
    struct LegInstruction {
        address token;
        address from;
        address to;
        uint256 amount;
        bytes32 partition;
        uint256 holdId;
        bytes32 tradeId;
        bytes extra;
    }

    /// @notice Read-only compliance/eligibility pre-flight. MUST NOT revert.
    /// @return ok     true if this leg would settle right now
    /// @return code   EIP-1066 status byte (0x01 == success)
    /// @return reason ATS error selector explaining a non-success code (bytes32(0) when ok)
    function preflight(LegInstruction calldata i) external view returns (bool ok, bytes1 code, bytes32 reason);

    /// @notice Execute the leg. MUST revert on any failure so the enclosing settlement is atomic
    ///         (either both legs move or neither does).
    /// @return legRef adapter-specific reference (partition, sub-tx id, memo hash, ...)
    function execute(LegInstruction calldata i) external returns (bytes32 legRef);

    /// @notice Stable identifier of the rail, e.g. "hedera-hold" or "arc-memo".
    function legKind() external view returns (string memory);
}
