// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title Owned
/// @notice Minimal single-owner access control. Kept dependency-free on purpose so the
///         settlement contracts have no external imports beyond the ATS interface.
abstract contract Owned {
    address public owner;

    error NotOwner(address caller);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "owner=0");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
