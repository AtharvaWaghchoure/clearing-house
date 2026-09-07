// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IATSSecurity
/// @notice The exact slice of the Hedera Asset Tokenization Studio (ERC-1400/3643 diamond) that
///         CLEARING HOUSE calls. Signatures are copied verbatim from
///         `hashgraph/asset-tokenization-studio`:
///           - facets/holdByPartition/IHoldByPartition.sol
///           - facets/complianceByPartition/IComplianceByPartition.sol
///           - facets/hold/IHoldTypes.sol
///         so this interface is ABI-compatible with the live BLR/Factory deployment. The full
///         mechanism (escrow gating, compliance-inside-execute, clearing exclusion) is documented
///         in specs/ats-mechanism.md.
interface IATSSecurity {
    /// @dev `escrow` is the ONLY address allowed to execute; `to == address(0)` = open recipient
    ///      (the escrow chooses the destination at execute time — what makes an order book possible).
    struct Hold {
        uint256 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bytes data;
    }

    /// @dev Three-tuple locating a hold inside partitioned storage.
    struct HoldIdentifier {
        bytes32 partition;
        address tokenHolder;
        uint256 holdId;
    }

    /// @notice Holder places a hold over its own partitioned balance (clearing must be disabled).
    function createHoldByPartition(bytes32 _partition, Hold calldata _hold)
        external
        returns (bool success_, uint256 holdId_);

    /// @notice Escrow moves the held tokens to `_to`. Reverts unless `msg.sender == hold.escrow`
    ///         and the recipient passes identity + compliance + control-list checks (all enforced
    ///         inside this call — this is the DvP compliance guarantee).
    function executeHoldByPartition(HoldIdentifier calldata _holdIdentifier, address _to, uint256 _amount)
        external
        returns (bool success_, bytes32 partition_);

    /// @notice Read-only transfer eligibility. `code` is an EIP-1066 byte; `reason` is the ATS
    ///         error selector (e.g. AddressNotVerified) explaining a non-success code.
    function canTransferByPartition(
        address _from,
        address _to,
        bytes32 _partition,
        uint256 _value,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external view returns (bool status, bytes1 code, bytes32 reason);

    /// @notice Available (non-held) partitioned balance of `_tokenHolder`.
    function balanceOfByPartition(bytes32 _partition, address _tokenHolder) external view returns (uint256);

    /// @notice Reads back a hold's stored fields (thirdPartyType returned as its uint8 value).
    function getHoldForByPartition(HoldIdentifier calldata _holdIdentifier)
        external
        view
        returns (
            uint256 amount_,
            uint256 expirationTimestamp_,
            address escrow_,
            address destination_,
            bytes memory data_,
            bytes memory operatorData_,
            uint8 thirdPartyType_
        );
}
