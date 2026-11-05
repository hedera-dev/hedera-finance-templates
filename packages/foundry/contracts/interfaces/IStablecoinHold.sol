// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice The hold slice of a Stablecoin Studio stablecoin proxy.
/// @dev Signatures verified against the business logic resolver `0.0.6349477` for the stablecoin
///      configuration (`0x..02`, version 1). Amounts are `int64`, not `uint256`: the ATS leg and
///      this one meet in the same contract, so every crossing is a checked conversion.
///
///      These functions live on the stablecoin *proxy*. Token movement does not: `transfer` is
///      not registered on the proxy, and value moves through the HTS token address returned by
///      `getTokenAddress()` using its ERC-20 facade.
///
///      Creating a hold here is gated by `_HOLD_CREATOR_ROLE`
///      (0xa0edc074322e33cf8b82b4182ff2827f0fef9412190f0e8417c2669a1e8747e4), unlike the ATS
///      bond, where a holder may encumber their own units freely.
interface IStablecoinHold {
    struct Hold {
        int64 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bytes data;
    }

    struct HoldIdentifier {
        address tokenHolder;
        uint256 holdId;
    }

    function createHold(Hold calldata _hold) external returns (bool success_, uint256 holdId_);

    function executeHold(
        HoldIdentifier calldata _holdIdentifier,
        address _to,
        int64 _amount
    ) external returns (bool success_);

    function releaseHold(HoldIdentifier calldata _holdIdentifier, int64 _amount) external returns (bool success_);

    function reclaimHold(HoldIdentifier calldata _holdIdentifier) external returns (bool success_);

    function getHeldAmountFor(address _tokenHolder) external view returns (int64 amount_);
}
