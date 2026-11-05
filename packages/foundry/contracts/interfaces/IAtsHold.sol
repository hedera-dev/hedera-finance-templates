// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice The hold slice of an ATS security token, as deployed by the v8 factory on testnet.
/// @dev Signatures verified against the business logic resolver `0.0.9212226` for the bond
///      configuration (`0x..02`, version 1). Amounts here are `uint256`; the Stablecoin Studio
///      hold facet uses `int64` for the same concept, which is why the two live in separate
///      interfaces rather than one shared one. See `IStablecoinHold`.
///
///      A hold encumbers units in place. They stay in the holder's account and are excluded
///      from `balanceOf`, which reports only the free balance -- a coverage check that reads
///      `balanceOf` sees none of the pledged collateral. Read `getHeldAmountForByPartition`.
///
///      `escrow` is the only address that may execute or release, and it needs no entry in the
///      token's control list. `to` is fixed when the hold is created: execute cannot redirect
///      the units elsewhere, so the holder commits to the destination at pledge time.
interface IAtsHold {
    struct Hold {
        uint256 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bytes data;
    }

    struct HoldIdentifier {
        bytes32 partition;
        address tokenHolder;
        uint256 holdId;
    }

    /// @notice Encumbers `_hold.amount` of the caller's units in favour of `_hold.escrow`.
    function createHoldByPartition(
        bytes32 _partition,
        Hold calldata _hold
    ) external returns (bool success_, uint256 holdId_);

    /// @notice Escrow only. Moves held units to `_to`, which must equal the hold's `to`.
    function executeHoldByPartition(
        HoldIdentifier calldata _holdIdentifier,
        address _to,
        uint256 _amount
    ) external returns (bool success_, bytes32 partition_);

    /// @notice Escrow only, before expiry. Returns held units to the holder.
    function releaseHoldByPartition(
        HoldIdentifier calldata _holdIdentifier,
        uint256 _amount
    ) external returns (bool success_);

    /// @notice Holder's own way out once the hold has expired.
    function reclaimHoldByPartition(HoldIdentifier calldata _holdIdentifier) external returns (bool success_);

    function getHeldAmountForByPartition(
        bytes32 _partition,
        address _tokenHolder
    ) external view returns (uint256 amount_);
}
