// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ISettlementLeg } from "./interfaces/ISettlementLeg.sol";
import { IClearingHouse } from "./interfaces/IClearingHouse.sol";
import { Owned } from "./lib/Owned.sol";
import { Eip1066 } from "./lib/Eip1066.sol";

/// @title MatchingEngine
/// @notice The venue's settlement core. Given two matched, pre-placed legs — a bond delivery and a
///         cash payment — it (1) runs a compliance pre-flight that fails fast with a NAMED reason,
///         (2) executes both legs in one transaction so either both move or neither does, and
///         (3) emits a `SettlementReceipt` that an independent index can reconstruct compliance from.
///
///         It talks only to `ISettlementLeg`. The delivery leg is always an ATS hold; the payment
///         leg is swappable (ATS deposit token on Hedera, USDC via `Memo` on Arc) — one seam.
contract MatchingEngine is IClearingHouse, Owned {
    /// @notice Delivery rail (the bond). Always an ATS `HederaHoldLeg`.
    ISettlementLeg public deliveryLeg;
    /// @notice Payment rail (the cash). `HederaHoldLeg` on Hedera, `ArcMemoLeg` on Arc.
    ISettlementLeg public paymentLeg;
    /// @notice The venue matcher permitted to submit settlements.
    address public operator;
    /// @notice Count of settlements cleared (monotonic; useful for the verifier's totals).
    uint256 public settledCount;

    event OperatorSet(address indexed operator);
    event LegsSet(address indexed deliveryLeg, address indexed paymentLeg);

    /// @param bond Delivery leg: seller -> buyer, over the ATS security's held balance.
    /// @param cash Payment leg: buyer -> seller, over the cash rail's held/authorised balance.
    struct Trade {
        ISettlementLeg.LegInstruction bond;
        ISettlementLeg.LegInstruction cash;
    }

    constructor(address initialOwner, ISettlementLeg _delivery, ISettlementLeg _payment, address _operator)
        Owned(initialOwner)
    {
        deliveryLeg = _delivery;
        paymentLeg = _payment;
        operator = _operator;
        emit LegsSet(address(_delivery), address(_payment));
        emit OperatorSet(_operator);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        _;
    }

    // --- configuration (owner) ---

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorSet(newOperator);
    }

    /// @notice Swap the settlement rails. Point `paymentLeg` at `ArcMemoLeg` to settle cash on Arc.
    function setLegs(ISettlementLeg _delivery, ISettlementLeg _payment) external onlyOwner {
        deliveryLeg = _delivery;
        paymentLeg = _payment;
        emit LegsSet(address(_delivery), address(_payment));
    }

    // --- read ---

    /// @notice What would `settle` do right now? Per-leg EIP-1066 status. Never reverts — this is
    ///         what the UI calls before asking anyone to sign, so a rejection shows a named reason
    ///         (e.g. 0x10 · AddressNotVerified) instead of "failed".
    function preflight(Trade calldata t)
        external
        view
        returns (bool ok, bytes1 bondCode, bytes32 bondReason, bytes1 cashCode, bytes32 cashReason)
    {
        (bool okB, bytes1 cB, bytes32 rB) = deliveryLeg.preflight(t.bond);
        (bool okC, bytes1 cC, bytes32 rC) = paymentLeg.preflight(t.cash);
        return (okB && okC, cB, rB, cC, rC);
    }

    // --- settle ---

    /// @notice Clear one delivery-versus-payment trade atomically.
    /// @dev Order of operations is load-bearing: pre-flight BOTH legs first (fail fast, no state
    ///      touched), then execute both. If either execute reverts, the EVM unwinds the other —
    ///      there is no code path that leaves one leg settled.
    function settle(Trade calldata t) external onlyOperator returns (bytes32 tradeId) {
        if (address(deliveryLeg) == address(0)) revert LegNotRegistered(0);
        if (address(paymentLeg) == address(0)) revert LegNotRegistered(1);
        if (t.bond.tradeId != t.cash.tradeId) revert TradeIdMismatch(t.bond.tradeId, t.cash.tradeId);
        tradeId = t.bond.tradeId;

        // 1. compliance pre-flight — the whole point of the demo: reject with a named reason.
        (bool okB, bytes1 bondCode, bytes32 bondReason) = deliveryLeg.preflight(t.bond);
        if (!okB) revert LegNotCompliant(0, bondCode, bondReason);
        (bool okC, bytes1 cashCode, bytes32 cashReason) = paymentLeg.preflight(t.cash);
        if (!okC) revert LegNotCompliant(1, cashCode, cashReason);

        // 2. atomic execution — both legs or neither.
        deliveryLeg.execute(t.bond);
        paymentLeg.execute(t.cash);

        // 3. canonical receipt for the independent verifier.
        settledCount++;
        emit SettlementReceipt(
            tradeId,
            t.bond.token,
            t.bond.from, // seller
            t.bond.to, // buyer
            t.bond.amount, // quantity
            t.cash.token,
            t.cash.amount, // cash paid
            bondCode,
            cashCode
        );
    }

    /// @notice Sanity helper for off-chain callers: is a code the EIP-1066 success byte?
    function isSuccess(bytes1 code) external pure returns (bool) {
        return code == Eip1066.SUCCESS;
    }
}
