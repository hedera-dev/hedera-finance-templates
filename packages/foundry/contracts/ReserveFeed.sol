// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";

interface IBalanceOf {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice A proof-of-reserve feed that reports the live balance of a collateral token held by one address.
/// @dev There is no setter and no stored amount: a reserve that its operator can type in proves nothing.
///      `updatedAt` is the current block time because the balance is read in the same call. A real Chainlink
///      proof-of-reserve feed is a drop-in replacement, which is why this implements the same interface.
contract ReserveFeed is AggregatorV3Interface {
    uint8 public constant FEED_DECIMALS = 8;

    IBalanceOf public immutable collateral;
    address public immutable reserve;
    uint8 public immutable collateralDecimals;

    error CollateralDecimalsTooLarge(uint8 decimals);

    constructor(address collateral_, address reserve_, uint8 collateralDecimals_) {
        if (collateralDecimals_ > FEED_DECIMALS) revert CollateralDecimalsTooLarge(collateralDecimals_);
        collateral = IBalanceOf(collateral_);
        reserve = reserve_;
        collateralDecimals = collateralDecimals_;
    }

    function decimals() external pure returns (uint8) {
        return FEED_DECIMALS;
    }

    function description() external pure returns (string memory) {
        return "Collateral held by the reserve address";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80
    ) external view returns (uint80, int256, uint256, uint256, uint80) {
        return _round();
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return _round();
    }

    function _round() private view returns (uint80, int256, uint256, uint256, uint80) {
        // Whole collateral units, scaled to 8 decimals: a 0-decimal balance of 3 reports 3e8.
        uint256 scaled = collateral.balanceOf(reserve) * 10 ** (FEED_DECIMALS - collateralDecimals);
        return (1, int256(scaled), block.timestamp, block.timestamp, 1);
    }
}
