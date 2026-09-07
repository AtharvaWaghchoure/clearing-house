// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MatchingEngine } from "../src/MatchingEngine.sol";
import { HederaHoldLeg } from "../src/legs/HederaHoldLeg.sol";
import { ISettlementLeg } from "../src/interfaces/ISettlementLeg.sol";
import { IClearingHouse } from "../src/interfaces/IClearingHouse.sol";
import { IATSSecurity } from "../src/interfaces/ats/IATSSecurity.sol";
import { IATSErrors } from "../src/interfaces/ats/IATSErrors.sol";
import { MockATSSecurity } from "./mocks/MockATSSecurity.sol";

/// @notice Proves the three load-bearing properties of CLEARING HOUSE against a source-faithful
///         ATS mock: (1) atomic delivery-versus-payment, (2) a de-KYC'd buyer is rejected with the
///         REAL EIP-1066 reason, (3) if one leg fails the other rolls back — no partial settlement.
contract MatchingEngineTest is Test, IClearingHouse {
    bytes32 constant P = bytes32(uint256(1)); // _DEFAULT_PARTITION
    bytes32 constant T1 = bytes32("trade-1");
    bytes32 constant T2 = bytes32("trade-2");
    uint256 constant QTY = 10; // bond units
    uint256 constant CASH = 1000; // cash units

    MockATSSecurity bond;
    MockATSSecurity cash;
    HederaHoldLeg holdLeg;
    MatchingEngine engine;

    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address rando = makeAddr("rando");

    function setUp() public {
        bond = new MockATSSecurity("ACME 5.5% 2030 Bond");
        cash = new MockATSSecurity("USD Deposit Token");

        holdLeg = new HederaHoldLeg(address(this));
        // On Hedera one HederaHoldLeg settles both rails; delivery == payment == holdLeg.
        engine = new MatchingEngine(address(this), holdLeg, holdLeg, address(this));
        holdLeg.setEngine(address(engine));

        // Issue the bond to the seller, cash to the buyer; KYC both on both tokens.
        bond.mint(P, seller, QTY);
        cash.mint(P, buyer, CASH);
        _kyc(seller, true);
        _kyc(buyer, true);
    }

    // --- helpers ---

    function _kyc(address who, bool ok) internal {
        bond.setVerified(who, ok);
        cash.setVerified(who, ok);
    }

    /// @dev `boundTo == address(0)` places an open-recipient hold (order-book style).
    function _placeBondHold(address boundTo) internal returns (uint256 id) {
        vm.prank(seller);
        (, id) = bond.createHoldByPartition(
            P, IATSSecurity.Hold({ amount: QTY, expirationTimestamp: 0, escrow: address(holdLeg), to: boundTo, data: "" })
        );
    }

    function _placeCashHold(address boundTo) internal returns (uint256 id) {
        vm.prank(buyer);
        (, id) = cash.createHoldByPartition(
            P,
            IATSSecurity.Hold({ amount: CASH, expirationTimestamp: 0, escrow: address(holdLeg), to: boundTo, data: "" })
        );
    }

    function _trade(uint256 bondHoldId, uint256 cashHoldId, bytes32 bondTradeId, bytes32 cashTradeId)
        internal
        view
        returns (MatchingEngine.Trade memory t)
    {
        t.bond = ISettlementLeg.LegInstruction({
            token: address(bond),
            from: seller,
            to: buyer,
            amount: QTY,
            partition: P,
            holdId: bondHoldId,
            tradeId: bondTradeId,
            extra: ""
        });
        t.cash = ISettlementLeg.LegInstruction({
            token: address(cash),
            from: buyer,
            to: seller,
            amount: CASH,
            partition: P,
            holdId: cashHoldId,
            tradeId: cashTradeId,
            extra: ""
        });
    }

    // --- 1. atomic delivery-versus-payment ---

    function test_HappyPath_AtomicDvP_OpenHolds() public {
        uint256 b = _placeBondHold(address(0));
        uint256 c = _placeCashHold(address(0));
        MatchingEngine.Trade memory t = _trade(b, c, T1, T1);

        (bool ok,,,,) = engine.preflight(t);
        assertTrue(ok, "preflight should pass");

        vm.expectEmit(true, true, true, true);
        emit IClearingHouse.SettlementReceipt(
            T1, address(bond), seller, buyer, QTY, address(cash), CASH, bytes1(0x01), bytes1(0x01)
        );
        bytes32 tradeId = engine.settle(t);

        assertEq(tradeId, T1);
        assertEq(bond.balanceOfByPartition(P, buyer), QTY, "buyer got the bond");
        assertEq(bond.balanceOfByPartition(P, seller), 0, "seller delivered the bond");
        assertEq(cash.balanceOfByPartition(P, seller), CASH, "seller got the cash");
        assertEq(cash.balanceOfByPartition(P, buyer), 0, "buyer paid the cash");
        assertEq(engine.settledCount(), 1);
    }

    function test_HappyPath_AtomicDvP_FixedRecipientHolds() public {
        // Seller binds the bond to the buyer, buyer binds the cash to the seller at create time.
        uint256 b = _placeBondHold(buyer);
        uint256 c = _placeCashHold(seller);
        engine.settle(_trade(b, c, T1, T1));
        assertEq(bond.balanceOfByPartition(P, buyer), QTY);
        assertEq(cash.balanceOfByPartition(P, seller), CASH);
    }

    // --- 2. compliance is checked inside settlement; rejection is NAMED ---

    function test_RevertWhen_BuyerKycRevoked_ReturnsRealReason() public {
        uint256 b = _placeBondHold(address(0));
        uint256 c = _placeCashHold(address(0));
        MatchingEngine.Trade memory t = _trade(b, c, T1, T1);

        // The issuer revokes the buyer's KYC on the bond's identity registry, after holds are placed.
        bond.setVerified(buyer, false);

        // The UI reads this BEFORE anyone signs: not "failed" but a named EIP-1066 reason.
        (bool ok, bytes1 bondCode, bytes32 bondReason,,) = engine.preflight(t);
        assertFalse(ok);
        assertEq(bondCode, bytes1(0x10)); // DISALLOWED_OR_STOP
        assertEq(bondReason, bytes32(IATSErrors.AddressNotVerified.selector));

        // The same order re-submitted refuses itself, atomically, with the reason on-chain.
        vm.expectRevert(
            abi.encodeWithSelector(
                IClearingHouse.LegNotCompliant.selector,
                uint8(0),
                bytes1(0x10),
                bytes32(IATSErrors.AddressNotVerified.selector)
            )
        );
        engine.settle(t);

        // Nothing moved.
        assertEq(bond.balanceOfByPartition(P, buyer), 0);
        assertEq(cash.balanceOfByPartition(P, seller), 0);
        assertEq(engine.settledCount(), 0);
    }

    function test_RevertWhen_BuyerBlocked_ReturnsBlockedReason() public {
        uint256 b = _placeBondHold(address(0));
        uint256 c = _placeCashHold(address(0));
        MatchingEngine.Trade memory t = _trade(b, c, T1, T1);

        bond.setBlocked(buyer, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                IClearingHouse.LegNotCompliant.selector,
                uint8(0),
                bytes1(0x10),
                bytes32(IATSErrors.AccountIsBlocked.selector)
            )
        );
        engine.settle(t);
    }

    // --- 3. atomicity: one leg fails at execute -> the other rolls back ---

    function test_Atomicity_CashLegFailsAtExecute_BondRollsBack() public {
        uint256 b = _placeBondHold(address(0));
        _placeCashHold(address(0));
        // Point the cash leg at a non-existent hold: pre-flight (recipient-only) still passes, but
        // execute reverts WrongHoldId — AFTER the bond leg has already executed in this same tx.
        MatchingEngine.Trade memory t = _trade(b, 999, T1, T1);

        vm.expectRevert(IATSErrors.WrongHoldId.selector);
        engine.settle(t);

        // The bond delivery that ran first must be fully unwound.
        assertEq(bond.balanceOfByPartition(P, buyer), 0, "bond delivery rolled back");
        (uint256 amt,, address escrow,,,,) =
            bond.getHoldForByPartition(IATSSecurity.HoldIdentifier({ partition: P, tokenHolder: seller, holdId: b }));
        assertEq(amt, QTY, "seller's bond hold intact");
        assertEq(escrow, address(holdLeg), "seller's bond hold intact");
        assertEq(engine.settledCount(), 0);
    }

    // --- access control / invariants ---

    function test_RevertWhen_CallerNotOperator() public {
        uint256 b = _placeBondHold(address(0));
        uint256 c = _placeCashHold(address(0));
        MatchingEngine.Trade memory t = _trade(b, c, T1, T1);

        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(IClearingHouse.NotOperator.selector, rando));
        engine.settle(t);
    }

    function test_RevertWhen_TradeIdsMismatch() public {
        uint256 b = _placeBondHold(address(0));
        uint256 c = _placeCashHold(address(0));
        vm.expectRevert(abi.encodeWithSelector(IClearingHouse.TradeIdMismatch.selector, T1, T2));
        engine.settle(_trade(b, c, T1, T2));
    }

    /// @notice The whole permissionless thesis in one assertion: only the escrow (the leg) can
    ///         execute a hold. A random caller — even the operator EOA — cannot.
    function test_RevertWhen_NonEscrowExecutesHoldDirectly() public {
        uint256 b = _placeBondHold(address(0));
        IATSSecurity.HoldIdentifier memory id =
            IATSSecurity.HoldIdentifier({ partition: P, tokenHolder: seller, holdId: b });

        vm.prank(rando);
        vm.expectRevert(IATSErrors.IsNotEscrow.selector);
        bond.executeHoldByPartition(id, buyer, QTY);
    }

    function test_RevertWhen_NonEngineDrivesLeg() public {
        uint256 b = _placeBondHold(address(0));
        ISettlementLeg.LegInstruction memory instr = ISettlementLeg.LegInstruction({
            token: address(bond),
            from: seller,
            to: buyer,
            amount: QTY,
            partition: P,
            holdId: b,
            tradeId: T1,
            extra: ""
        });
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(HederaHoldLeg.NotEngine.selector, rando));
        holdLeg.execute(instr);
    }
}
