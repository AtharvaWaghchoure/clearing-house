// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IMemo } from "../../src/interfaces/arc/IMemo.sol";

interface ICallFromEmulator {
    function callFromExec(address effectiveSender, bytes calldata data)
        external
        returns (bool ok, bytes memory ret);
}

/// @title MockMemo
/// @notice Stand-in for the Arc `Memo` contract. Emits the same `Memo` event and forwards the call
///         through the target's CallFrom emulation, preserving THIS mock's caller (the leg) as the
///         effective sender — matching Arc's precompile behaviour.
contract MockMemo is IMemo {
    uint256 public memoIndex;

    function memo(address target, bytes calldata data, bytes32 memoId, bytes calldata memoData) external {
        uint256 idx = memoIndex++;
        emit BeforeMemo(idx);
        emit Memo(msg.sender, target, keccak256(data), memoId, memoData, idx);

        // Arc routes the subcall through CallFrom, preserving msg.sender (the leg that called memo()).
        (bool ok, bytes memory ret) = ICallFromEmulator(target).callFromExec(msg.sender, data);
        if (!ok) revert MemoFailed(ret);
    }
}
