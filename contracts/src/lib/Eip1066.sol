// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title Eip1066
/// @notice The subset of EIP-1066 status bytes the venue reasons about. Values match the ATS
///         `constants/eip1066.sol` exactly so on-chain codes round-trip. See specs/ats-mechanism.md.
library Eip1066 {
    bytes1 internal constant SUCCESS = 0x01; // Transfer allowed
    bytes1 internal constant DISALLOWED_OR_STOP = 0x10; // KYC not verified / blocked / invalid KYC
    bytes1 internal constant REVOKED_OR_BANNED = 0x16; // wallet recovered
    bytes1 internal constant UNAVAILABLE = 0x40; // clearing activated
    bytes1 internal constant PAUSED = 0x42; // token paused
    bytes1 internal constant INSUFFICIENT_FUNDS = 0x54; // not enough balance
}
