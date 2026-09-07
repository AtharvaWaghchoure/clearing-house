// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ISettlementLeg } from "../interfaces/ISettlementLeg.sol";
import { IATSSecurity } from "../interfaces/ats/IATSSecurity.sol";
import { Owned } from "../lib/Owned.sol";

/// @title HederaHoldLeg
/// @notice ISettlementLeg over a Hedera ATS `Hold`. This contract is named as the `escrow` when a
///         holder places a hold, so when it calls `executeHoldByPartition` the ATS sees
///         `msg.sender == hold.escrow` and lets the transfer through — with NO issuer role grant.
///         That is the permissionless-venue thesis, in one contract.
///
///         A single deployment settles BOTH the bond leg and the (Hedera) cash leg — any ATS
///         diamond with `executeHoldByPartition` — because the target token is carried per-call in
///         `LegInstruction.token`.
contract HederaHoldLeg is ISettlementLeg, Owned {
    /// @notice The only contract permitted to trigger `execute` (the venue's MatchingEngine).
    address public engine;

    error NotEngine(address caller);
    error HoldExecFailed();
    event EngineSet(address indexed engine);

    constructor(address initialOwner) Owned(initialOwner) {}

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine(msg.sender);
        _;
    }

    /// @notice Wire the engine allowed to drive settlements through this escrow.
    function setEngine(address newEngine) external onlyOwner {
        engine = newEngine;
        emit EngineSet(newEngine);
    }

    /// @inheritdoc ISettlementLeg
    function legKind() external pure returns (string memory) {
        return "hedera-hold";
    }

    /// @inheritdoc ISettlementLeg
    /// @dev Mirrors EXACTLY what `executeHoldByPartition` enforces: `onlyCompliant(address(0), _to,
    ///      false)` — i.e. the recipient's identity/compliance/control, NOT the sender's free
    ///      balance. Passing `address(0)` as `_from` is deliberate: the tokens are already locked in
    ///      the hold, so checking the sender's (now-zero) free balance would falsely reject. Never
    ///      reverts. See specs/ats-mechanism.md.
    function preflight(LegInstruction calldata i) external view returns (bool ok, bytes1 code, bytes32 reason) {
        bytes memory empty;
        (ok, code, reason) =
            IATSSecurity(i.token).canTransferByPartition(address(0), i.to, i.partition, i.amount, empty, empty);
    }

    /// @inheritdoc ISettlementLeg
    /// @dev Executes the pre-placed hold. `msg.sender` reaching the ATS is THIS contract (the
    ///      escrow). Reverts (via the ATS) if the recipient lost KYC, the caller isn't the escrow,
    ///      or the destination is wrong — which is what makes the whole settlement atomic.
    function execute(LegInstruction calldata i) external onlyEngine returns (bytes32 legRef) {
        (bool success,) = IATSSecurity(i.token).executeHoldByPartition(
            IATSSecurity.HoldIdentifier({ partition: i.partition, tokenHolder: i.from, holdId: i.holdId }),
            i.to,
            i.amount
        );
        if (!success) revert HoldExecFailed();
        return i.partition;
    }
}
