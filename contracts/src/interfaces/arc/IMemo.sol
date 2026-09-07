// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IMemo
/// @notice The Arc `Memo` contract (testnet `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`). Copied
///         verbatim from `circlefin/arc-node` (`contracts/src/memo/IMemo.sol`) so this is
///         ABI-compatible with the live deployment. `memo()` forwards `data` to `target` through the
///         CallFrom precompile (preserving the caller as the subcall's msg.sender) and emits a `Memo`
///         event whose indexed `memoId` we set to the venue trade id. See specs/arc-mechanism.md.
interface IMemo {
    error MemoFailed(bytes returnData);

    event BeforeMemo(uint256 indexed memoIndex);
    event Memo(
        address indexed sender,
        address indexed target,
        bytes32 callDataHash,
        bytes32 indexed memoId,
        bytes memo,
        uint256 memoIndex
    );

    function memoIndex() external view returns (uint256);

    /// @param target   contract to call (USDC)
    /// @param data     calldata to execute (e.g. transferFrom(payer, seller, amount))
    /// @param memoId   indexed reference — the venue trade id
    /// @param memoData arbitrary metadata carried in the event
    function memo(address target, bytes calldata data, bytes32 memoId, bytes calldata memoData) external;
}
