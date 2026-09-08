// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ISettlementLeg } from "../interfaces/ISettlementLeg.sol";
import { IATSSecurity } from "../interfaces/ats/IATSSecurity.sol";
import { Owned } from "../lib/Owned.sol";
import { Eip1066 } from "../lib/Eip1066.sol";

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
    /// @dev Asks the ATS whether the RECIPIENT may receive, mirroring what `executeHoldByPartition`
    ///      enforces (`onlyCompliant(address(0), _to, false)`), without tripping over the fact that the
    ///      amount is already escrowed in the hold:
    ///        - Query with the REAL sender `i.from` — the live ATS rejects a zero `_from` outright with
    ///          `0x20 · ZeroAddressNotAllowed`, so `address(0)` cannot be used here.
    ///        - The sender's FREE balance is (correctly) short because the amount sits in the hold; the
    ///          ATS surfaces that as `0x54 · INSUFFICIENT_FUNDS`. That is not a compliance rejection —
    ///          the hold guarantees delivery — so it is treated as passing.
    ///        - Genuine identity/control failures (`0x10`, `0x16`) still block, with their named reason.
    ///      Never reverts. See specs/ats-mechanism.md.
    function preflight(LegInstruction calldata i) external view returns (bool ok, bytes1 code, bytes32 reason) {
        bytes memory empty;
        (ok, code, reason) =
            IATSSecurity(i.token).canTransferByPartition(i.from, i.to, i.partition, i.amount, empty, empty);
        if (ok) return (ok, code, reason);
        if (code == Eip1066.INSUFFICIENT_FUNDS) return (true, Eip1066.SUCCESS, bytes32(0));
        return (false, code, reason);
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
