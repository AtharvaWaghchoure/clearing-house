// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ISettlementLeg } from "../interfaces/ISettlementLeg.sol";
import { IMemo } from "../interfaces/arc/IMemo.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { Owned } from "../lib/Owned.sol";

/// @title ArcMemoLeg
/// @notice The payment rail swapped in on Arc: settle the cash leg in USDC, wrapped in Arc's `Memo`
///         contract. In one call this produces, atomically:
///           - an ERC-20 `Transfer` whose `from` is the PAYER's own address, and
///           - a `Memo(sender, target, callDataHash, memoId=tradeId, memo, memoIndex)` event that
///             carries the trade id as an INDEXED topic and the trade metadata,
///         so a settlement is reconcilable from public logs alone. This is the property no other
///         chain reproduces (protocol-level sender delegation via the CallFrom precompile).
///
///         Same `ISettlementLeg` as `HederaHoldLeg` — the MatchingEngine swaps rails with one
///         `setLegs`, no rewrite. See specs/arc-mechanism.md.
contract ArcMemoLeg is ISettlementLeg, Owned {
    /// @notice Arc `Memo` contract (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505` on testnet).
    IMemo public immutable memoContract;
    /// @notice The stablecoin this rail settles in (Arc USDC `0x3600…0000`, 6 decimals).
    address public immutable stablecoin;
    /// @notice The only contract permitted to trigger `execute` (the venue's MatchingEngine).
    address public engine;

    error NotEngine(address caller);
    event EngineSet(address indexed engine);

    constructor(address initialOwner, IMemo memo_, address stablecoin_) Owned(initialOwner) {
        memoContract = memo_;
        stablecoin = stablecoin_;
    }

    modifier onlyEngine() {
        if (msg.sender != engine) revert NotEngine(msg.sender);
        _;
    }

    function setEngine(address newEngine) external onlyOwner {
        engine = newEngine;
        emit EngineSet(newEngine);
    }

    /// @inheritdoc ISettlementLeg
    function legKind() external pure returns (string memory) {
        return "arc-memo";
    }

    /// @inheritdoc ISettlementLeg
    /// @dev Cash leg pre-flight: the payer (`i.from`) must hold enough USDC and have approved this
    ///      leg (Arc's CallFrom makes THIS contract the effective spender of the wrapped
    ///      transferFrom). Never reverts. `0x54` = EIP-1066 INSUFFICIENT_FUNDS.
    function preflight(LegInstruction calldata i) external view returns (bool ok, bytes1 code, bytes32 reason) {
        if (IERC20(i.token).balanceOf(i.from) < i.amount) return (false, 0x54, bytes32(0));
        if (IERC20(i.token).allowance(i.from, address(this)) < i.amount) return (false, 0x54, bytes32(0));
        return (true, 0x01, bytes32(0));
    }

    /// @inheritdoc ISettlementLeg
    /// @dev Wraps `transferFrom(payer, seller, amount)` in `memo(...)`. Reverts (via Memo's
    ///      `MemoFailed`) if the transfer fails, keeping the enclosing settlement atomic.
    function execute(LegInstruction calldata i) external onlyEngine returns (bytes32 legRef) {
        bytes memory callData = abi.encodeWithSelector(IERC20.transferFrom.selector, i.from, i.to, i.amount);
        memoContract.memo(i.token, callData, i.tradeId, i.extra);
        return i.tradeId;
    }
}
