// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IERC20
/// @notice Minimal ERC-20 surface used by the Arc payment leg (USDC on Arc is 6-decimals).
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}
