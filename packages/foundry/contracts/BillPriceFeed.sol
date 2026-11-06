// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";

/// @notice A Treasury bill's price, computed rather than typed in, behind Chainlink's interface.
/// @dev price = face x (1 - rate x daysRemaining / 360), with 8 decimals. Hedera carries no Treasury price
///      feed, so this app deploys one; a real feed is a drop-in replacement because both implement
///      `AggregatorV3Interface`. There is deliberately no setter for the price: a price a desk can type in
///      proves nothing, and the pull to par has to be arithmetic.
///
///      The demo clock lives here and nowhere else: `secondsPerDay` is 1 in the demo and 86400 in production.
contract BillPriceFeed is AggregatorV3Interface, Ownable {
    uint8 public constant decimals = 8;
    /// @dev Bank-discount convention: a 360-day year, with the rate in basis points.
    uint256 public constant YEAR_BPS = 360 * 10_000;

    /// @notice Face value per bill, in 8-decimal US dollars.
    uint256 public immutable faceValue;
    uint256 public immutable secondsPerDay;
    uint256 public maturityTimestamp;
    uint256 public discountRateBps;
    /// @notice When non-zero, `latestRoundData` reports this as `updatedAt` instead of the block time.
    uint256 public pinnedUpdatedAt;

    event DiscountRateSet(uint256 rateBps);
    event UpdatedAtPinned(uint256 updatedAt);
    event MaturitySet(uint256 maturityTimestamp);

    error ZeroValue();

    constructor(
        uint256 faceValue_,
        uint256 maturityTimestamp_,
        uint256 secondsPerDay_,
        uint256 discountRateBps_,
        address owner_
    ) Ownable(owner_) {
        if (faceValue_ == 0 || secondsPerDay_ == 0) revert ZeroValue();
        faceValue = faceValue_;
        maturityTimestamp = maturityTimestamp_;
        secondsPerDay = secondsPerDay_;
        discountRateBps = discountRateBps_;
    }

    /// @notice Whole days left to maturity on the demo clock; 0 once the bill has matured.
    function daysRemaining() public view returns (uint256) {
        if (block.timestamp >= maturityTimestamp) return 0;
        return (maturityTimestamp - block.timestamp) / secondsPerDay;
    }

    /// @notice The price per bill, 8 decimals. A matured bill prices at par; a rate so high that the discount
    ///         would exceed the face prices at zero, which a consumer must treat as unusable.
    function price() public view returns (uint256) {
        uint256 discount = discountRateBps * daysRemaining();
        if (discount >= YEAR_BPS) return 0;
        return (faceValue * (YEAR_BPS - discount)) / YEAR_BPS;
    }

    function setDiscountRate(uint256 rateBps) external onlyOwner {
        discountRateBps = rateBps;
        emit DiscountRateSet(rateBps);
    }

    /// @notice Freezes the reported `updatedAt` to a chosen past time, for the staleness simulation. 0 unpins.
    function pinUpdatedAt(uint256 updatedAt) external onlyOwner {
        pinnedUpdatedAt = updatedAt;
        emit UpdatedAtPinned(updatedAt);
    }

    /// @notice Re-anchors the bill's life. A demo bill matures in 91 seconds; this lets the desk start the
    ///         clock when it is ready rather than when the feed happened to be deployed.
    function setMaturityTimestamp(uint256 maturityTimestamp_) external onlyOwner {
        maturityTimestamp = maturityTimestamp_;
        emit MaturitySet(maturityTimestamp_);
    }

    function description() external pure returns (string memory) {
        return "T-Bill / USD (computed from a discount rate)";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80) external view returns (uint80, int256, uint256, uint256, uint80) {
        return _round();
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return _round();
    }

    function _round() private view returns (uint80, int256, uint256, uint256, uint80) {
        uint256 updatedAt = pinnedUpdatedAt == 0 ? block.timestamp : pinnedUpdatedAt;
        return (1, int256(price()), updatedAt, updatedAt, 1);
    }
}
