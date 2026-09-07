// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IClearingHouse
/// @notice Events and errors emitted by the MatchingEngine. The `SettlementReceipt` is the
///         canonical record the independent verifier reconstructs compliance from — it shares no
///         code with the venue, only this event's ABI and public chain data.
interface IClearingHouse {
    /// @notice One atomic delivery-versus-payment settlement cleared.
    /// @param tradeId   venue trade id (equal on both legs)
    /// @param bondToken ATS security diamond that was delivered
    /// @param seller    delivered the bond, received the cash
    /// @param buyer     received the bond, paid the cash
    /// @param quantity  bond units delivered
    /// @param cashToken payment asset (ATS deposit token on Hedera, USDC on Arc)
    /// @param cashAmount cash units paid
    /// @param bondCode  EIP-1066 code returned by the bond pre-flight at settle time (0x01)
    /// @param cashCode  EIP-1066 code returned by the cash pre-flight at settle time (0x01)
    event SettlementReceipt(
        bytes32 indexed tradeId,
        address indexed bondToken,
        address indexed seller,
        address buyer,
        uint256 quantity,
        address cashToken,
        uint256 cashAmount,
        bytes1 bondCode,
        bytes1 cashCode
    );

    /// @notice A leg failed compliance pre-flight; the whole settlement reverts with this.
    /// @param leg    0 = delivery/bond, 1 = payment/cash
    /// @param code   EIP-1066 status byte
    /// @param reason ATS error selector (e.g. AddressNotVerified.selector) padded into bytes32
    error LegNotCompliant(uint8 leg, bytes1 code, bytes32 reason);

    /// @notice A required settlement leg has not been configured.
    error LegNotRegistered(uint8 leg);

    /// @notice Caller is not the venue operator.
    error NotOperator(address caller);

    /// @notice The two legs carry different trade ids.
    error TradeIdMismatch(bytes32 bondTradeId, bytes32 cashTradeId);
}
