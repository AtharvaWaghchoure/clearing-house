// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IATSSecurity } from "../../src/interfaces/ats/IATSSecurity.sol";
import { IATSErrors } from "../../src/interfaces/ats/IATSErrors.sol";

/// @title MockATSSecurity
/// @notice A faithful stand-in for a single Hedera ATS security/deposit token, reproducing the
///         parts of the hold + compliance flow the venue depends on — verbatim against the source
///         semantics in specs/ats-mechanism.md:
///           - create locks free balance into a hold; execute gates on `msg.sender == hold.escrow`
///           - execute enforces recipient identity/compliance/control (mirrors onlyCompliant(0,to))
///           - canTransferByPartition returns the real (code, reason) pairs (0x10 · AddressNotVerified)
///         Out of scope (irrelevant to settlement unit tests): pause, clearing mode, partitions
///         other than default, ERC-20 mirror, adjustment factors.
///
///         Admin helpers (`mint`, `setVerified`, `setBlocked`) simulate ATS issuance, the identity
///         registry, and the control list so tests can issue a bond and revoke KYC mid-flight.
contract MockATSSecurity is IATSSecurity, IATSErrors {
    // partition => holder => free (non-held) balance
    mapping(bytes32 => mapping(address => uint256)) private _available;
    // holder => partition => holdId => hold
    mapping(address => mapping(bytes32 => mapping(uint256 => Hold))) private _holds;
    // holder => partition => next holdId (pre-incremented, so live ids start at 1)
    mapping(address => mapping(bytes32 => uint256)) private _holdNonce;

    mapping(address => bool) public verified; // identity registry
    mapping(address => bool) public blocked; // control (deny) list

    string public name;

    /// @notice Emitted on identity-registry changes. The independent verifier replays these to
    ///         reconstruct "was `account` verified at block N?" — the basis of compliance auditing.
    event Verified(address indexed account, bool status);
    /// @notice Emitted on control-list changes.
    event Blocked(address indexed account, bool status);

    constructor(string memory _name) {
        name = _name;
    }

    // --- admin: simulate ATS issuance / KYC / control list ---

    function mint(bytes32 partition, address to, uint256 amount) external {
        _available[partition][to] += amount;
    }

    function setVerified(address who, bool v) external {
        verified[who] = v;
        emit Verified(who, v);
    }

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
        emit Blocked(who, b);
    }

    // --- IATSSecurity ---

    /// @inheritdoc IATSSecurity
    function balanceOfByPartition(bytes32 partition, address holder) external view returns (uint256) {
        return _available[partition][holder];
    }

    /// @inheritdoc IATSSecurity
    function createHoldByPartition(bytes32 partition, Hold calldata hold)
        external
        returns (bool success_, uint256 holdId_)
    {
        if (hold.escrow == address(0)) revert InvalidHoldAmount(); // notZeroAddress(escrow) analogue
        if (hold.amount == 0) revert InvalidHoldAmount();
        uint256 avail = _available[partition][msg.sender];
        require(avail >= hold.amount, "insufficient-available");

        _available[partition][msg.sender] = avail - hold.amount; // lock
        holdId_ = ++_holdNonce[msg.sender][partition];
        _holds[msg.sender][partition][holdId_] = hold;
        return (true, holdId_);
    }

    /// @inheritdoc IATSSecurity
    /// @dev Reproduces `_validateExecuteHold` then the `onlyIdentifiedAddresses` + `onlyCompliant`
    ///      modifiers, in the same order, with the same revert selectors.
    function executeHoldByPartition(HoldIdentifier calldata id, address to, uint256 amount)
        external
        returns (bool success_, bytes32 partition_)
    {
        Hold storage h = _holds[id.tokenHolder][id.partition][id.holdId];
        if (h.escrow == address(0)) revert WrongHoldId();

        // _validateExecuteHold
        if (blocked[id.tokenHolder]) revert AccountIsBlocked(id.tokenHolder);
        if (h.to != address(0) && to != h.to) revert InvalidDestinationAddress(h.to, to);
        if (h.expirationTimestamp != 0 && block.timestamp > h.expirationTimestamp) {
            revert HoldExpirationReached();
        }
        if (msg.sender != h.escrow) revert IsNotEscrow();

        // onlyIdentifiedAddresses(tokenHolder, to) + onlyCompliant(address(0), to, false)
        if (!verified[id.tokenHolder]) revert AddressNotVerified(id.tokenHolder);
        if (!verified[to]) revert AddressNotVerified(to);
        if (blocked[to]) revert AccountIsBlocked(to);

        if (amount == 0 || amount > h.amount) revert InvalidHoldAmount();

        // credit recipient; the amount was already removed from the holder's free balance at create
        _available[id.partition][to] += amount;
        if (amount == h.amount) {
            delete _holds[id.tokenHolder][id.partition][id.holdId];
        } else {
            h.amount -= amount;
        }
        return (true, id.partition);
    }

    /// @notice Holder reclaims a hold they placed — credits the held amount back to their free
    ///         balance and clears the hold. This is what the venue's "cancel order" calls, so a
    ///         resting order can be withdrawn without stranding the escrowed funds. Only the hold's
    ///         owner can release it (`msg.sender == tokenHolder`).
    function releaseHoldByPartition(bytes32 partition, uint256 holdId) external returns (bool success_) {
        Hold storage h = _holds[msg.sender][partition][holdId];
        if (h.escrow == address(0)) revert WrongHoldId();
        uint256 amount = h.amount;
        delete _holds[msg.sender][partition][holdId];
        _available[partition][msg.sender] += amount;
        return true;
    }

    /// @inheritdoc IATSSecurity
    /// @dev Mirrors ERC1594StorageWrapper: recipient-side identity/control first (the venue calls
    ///      this with `_from == address(0)`, so sender checks are skipped — matching
    ///      onlyCompliant(address(0), to, false)).
    function canTransferByPartition(
        address from,
        address to,
        bytes32, /* partition */
        uint256, /* value */
        bytes calldata, /* data */
        bytes calldata /* operatorData */
    ) external view returns (bool status, bytes1 code, bytes32 reason) {
        if (!verified[to]) return (false, 0x10, bytes32(AddressNotVerified.selector));
        if (blocked[to]) return (false, 0x10, bytes32(AccountIsBlocked.selector));
        if (from != address(0) && !verified[from]) return (false, 0x10, bytes32(AddressNotVerified.selector));
        if (from != address(0) && blocked[from]) return (false, 0x10, bytes32(AccountIsBlocked.selector));
        return (true, 0x01, bytes32(0));
    }

    /// @inheritdoc IATSSecurity
    function getHoldForByPartition(HoldIdentifier calldata id)
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
        )
    {
        Hold storage h = _holds[id.tokenHolder][id.partition][id.holdId];
        return (h.amount, h.expirationTimestamp, h.escrow, h.to, h.data, bytes(""), 0);
    }
}
