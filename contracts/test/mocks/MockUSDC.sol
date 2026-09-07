// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IERC20 } from "../../src/interfaces/IERC20.sol";

/// @title MockUSDC
/// @notice 6-decimal ERC-20 that also emulates Arc's CallFrom precompile so the Arc payment-leg
///         test exercises the REAL approval target. `callFromExec` (callable only by the Memo mock)
///         runs arbitrary calldata on this token with a substituted effective sender — exactly what
///         the precompile does on Arc — so `transferFrom`'s spender is the leg, not the Memo contract.
contract MockUSDC is IERC20 {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice The Memo mock permitted to drive the CallFrom emulation.
    address public immutable memoEmulator;
    /// @dev Non-zero only during a callFromExec dispatch; substitutes for msg.sender then.
    address private _effectiveSender;

    constructor(address memoEmulator_) {
        memoEmulator = memoEmulator_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(_sender(), to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        address spender = _sender();
        uint256 allowed = allowance[from][spender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) allowance[from][spender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    /// @notice Arc CallFrom emulation: only the Memo mock may invoke; runs `data` on this contract
    ///         with `effectiveSender` standing in for msg.sender (matching the precompile).
    function callFromExec(address effectiveSender, bytes calldata data)
        external
        returns (bool ok, bytes memory ret)
    {
        require(msg.sender == memoEmulator, "only-memo");
        _effectiveSender = effectiveSender;
        (ok, ret) = address(this).call(data);
        _effectiveSender = address(0);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _sender() internal view returns (address) {
        return _effectiveSender == address(0) ? msg.sender : _effectiveSender;
    }
}
