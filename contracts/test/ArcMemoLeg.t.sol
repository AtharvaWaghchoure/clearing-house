// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ArcMemoLeg } from "../src/legs/ArcMemoLeg.sol";
import { ISettlementLeg } from "../src/interfaces/ISettlementLeg.sol";
import { IMemo } from "../src/interfaces/arc/IMemo.sol";
import { IERC20 } from "../src/interfaces/IERC20.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { MockMemo } from "./mocks/MockMemo.sol";

/// @notice Proves the Arc payment rail settles USDC buyer->seller wrapped in `Memo`, emitting a
///         Transfer FROM the payer's address and a Memo event carrying the tradeId as an indexed
///         topic — the provable-reconciliation property — behind the same ISettlementLeg interface.
contract ArcMemoLegTest is Test {
    bytes32 constant T1 = bytes32("trade-1");
    uint256 constant CASH = 1_000_000; // 1.00 USDC (6 decimals)

    MockMemo memoc;
    MockUSDC usdc;
    ArcMemoLeg leg;

    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address rando = makeAddr("rando");

    function setUp() public {
        memoc = new MockMemo();
        usdc = new MockUSDC(address(memoc)); // only the Memo mock may drive CallFrom emulation
        leg = new ArcMemoLeg(address(this), IMemo(address(memoc)), address(usdc));
        leg.setEngine(address(this)); // this test plays the MatchingEngine

        usdc.mint(buyer, CASH);
        vm.prank(buyer);
        usdc.approve(address(leg), CASH); // payer approves the LEG (Arc CallFrom effective spender)
    }

    function _instr(uint256 amount) internal view returns (ISettlementLeg.LegInstruction memory) {
        return ISettlementLeg.LegInstruction({
            token: address(usdc),
            from: buyer,
            to: seller,
            amount: amount,
            partition: bytes32(0),
            holdId: 0,
            tradeId: T1,
            extra: abi.encode("ACME 5.5% 2030", uint256(10))
        });
    }

    function test_Preflight_PassesWhenFundedAndApproved() public view {
        (bool ok, bytes1 code,) = leg.preflight(_instr(CASH));
        assertTrue(ok);
        assertEq(code, bytes1(0x01));
    }

    function test_Execute_SettlesUsdcWithMemoCarryingTradeId() public {
        ISettlementLeg.LegInstruction memory i = _instr(CASH);

        // The Memo event ties this USDC movement to the trade id via the indexed memoId topic.
        vm.expectEmit(true, true, true, false, address(memoc));
        emit IMemo.Memo(address(leg), address(usdc), bytes32(0), T1, "", 0);
        // The USDC Transfer's `from` is the payer's own address.
        vm.expectEmit(true, true, false, true, address(usdc));
        emit IERC20.Transfer(buyer, seller, CASH);

        leg.execute(i);

        assertEq(usdc.balanceOf(seller), CASH, "seller received USDC");
        assertEq(usdc.balanceOf(buyer), 0, "buyer paid");
        assertEq(usdc.allowance(buyer, address(leg)), 0, "allowance consumed");
    }

    function test_Preflight_FailsInsufficient() public view {
        (bool ok, bytes1 code,) = leg.preflight(_instr(CASH + 1));
        assertFalse(ok);
        assertEq(code, bytes1(0x54)); // INSUFFICIENT_FUNDS
    }

    function test_RevertWhen_ExecuteExceedsAllowance() public {
        // Preflight would catch this off-chain; on-chain the Memo-wrapped transfer reverts, keeping
        // the enclosing settlement atomic.
        vm.expectRevert(); // MemoFailed(allowance)
        leg.execute(_instr(CASH + 1));
    }

    function test_RevertWhen_NonEngineDrivesLeg() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(ArcMemoLeg.NotEngine.selector, rando));
        leg.execute(_instr(CASH));
    }

    function test_LegKind() public view {
        assertEq(leg.legKind(), "arc-memo");
    }
}
