// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IATSErrors
/// @notice The ATS revert selectors the venue surfaces as EIP-1066 `reason` values. Names/args
///         mirror `hashgraph/asset-tokenization-studio` so `.selector` matches the real chain.
///         The mock and the tests both import these to stay byte-identical to production.
interface IATSErrors {
    /// @notice Recipient (or sender) is not verified in the identity registry (KYC revoked).
    error AddressNotVerified(address account);
    /// @notice Account is on the control (deny) list.
    error AccountIsBlocked(address account);
    /// @notice KYC status flag is not valid for the account.
    error InvalidKycStatus(address account);
    /// @notice Caller of executeHoldByPartition is not the hold's recorded escrow.
    error IsNotEscrow();
    /// @notice Execute recipient does not match the hold's bound destination.
    error InvalidDestinationAddress(address holdDestination, address to);
    /// @notice The hold has passed its expiration timestamp.
    error HoldExpirationReached();
    /// @notice The (partition, holder, holdId) triple does not resolve to a live hold.
    error WrongHoldId();
    /// @notice Requested hold amount is zero or exceeds the hold balance.
    error InvalidHoldAmount();
}
