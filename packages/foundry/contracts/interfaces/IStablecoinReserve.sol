// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice The reserve and cash-in slices of a Stablecoin Studio stablecoin proxy.
/// @dev Verified registered on the testnet resolver `0.0.6349477`, stablecoin configuration
///      version 1: `mint(address,int64)` resolves to the cash-in facet, and the three reserve
///      functions below to the reserve facet. `mint(address,uint256)` is not registered.
///
///      The reserve refuses minting beyond what the feed reports, which is proof of reserve
///      applied to the cash leg. `updateReserveAddress` is callable after creation, so a feed
///      can be swapped for a broken one at runtime.
///
///      The deployed version has NO staleness threshold: `getUpdatedAtThreshold()` and
///      `updateUpdatedAtThreshold(uint256)` are both unregistered, although they exist in the
///      project's source. Refusing a stale answer is therefore this template's own job, not
///      something the stablecoin does for us.
interface IStablecoinReserve {
    function mint(address _account, int64 _amount) external returns (bool);

    function getReserveAddress() external view returns (address);

    function getReserveAmount() external view returns (int256 amount_, uint256 updatedAt_);

    function updateReserveAddress(address _newAddress) external;
}
