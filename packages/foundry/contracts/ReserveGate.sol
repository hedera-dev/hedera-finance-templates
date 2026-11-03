// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";

/// @notice The slice of an ATS security the gate uses.
interface IAtsAsset {
    function issue(address holder, uint256 amount, bytes calldata data) external;

    function totalSupply() external view returns (uint256);

    function getNominalValue() external view returns (uint256);

    function getNominalValueDecimals() external view returns (uint256);
}

/// @notice Holds the asset's issuer role and issues only while a reserve, priced by a feed, covers the supply.
/// @dev Two independent refusals, on two different questions:
///      1. WHO may ask: ATS sees `msg.sender == gate` whoever called the gate, so the gate keeps its own list.
///         It is checked before anything is read. `tx.origin` is never used.
///      2. HOW MUCH: the reserve's value must cover the asset's supply after the issuance. This caps the
///         amount, never the caller.
///      Guarantee, exactly: given an honestly held admin role on the asset, no issuance exceeds the reserve.
///      The gate cannot bind the admin role above it; that role can grant itself the issuer role.
///
///      Scale. Everything is compared in USD scaled by 1e18:
///        reserve value = reserveAnswer * priceAnswer * 10^(18 - reserveDecimals - priceDecimals)
///        liability     = units * nominalValue        * 10^(18 - nominalValueDecimals)
///      The reserve answer is whole collateral units at `reserveDecimals`; one unit stands for one unit of the
///      priced asset (one BTC). Both are exact integers, so the comparison has no rounding at the boundary.
contract ReserveGate is Ownable {
    uint256 private constant SCALE_DECIMALS = 18;

    IAtsAsset public immutable asset;
    AggregatorV3Interface public immutable reserveFeed;
    AggregatorV3Interface public immutable priceFeed;
    /// @notice Longest age, in seconds, the price feed's last update may have.
    uint256 public immutable maxPriceAge;

    mapping(address => bool) public isAllowedToIssue;

    event IssuerSet(address indexed account, bool allowed);
    event IssuedThroughGate(address indexed caller, address indexed holder, uint256 amount, uint256 supplyAfter);

    error NotAllowedToIssue(address caller);
    error ZeroAmount();
    error PriceNotPositive(int256 answer);
    error PriceStale(uint256 updatedAt, uint256 maxAge);
    error ReserveNegative(int256 answer);
    error DecimalsTooLarge();
    error ReserveDoesNotCover(uint256 reserveValue, uint256 liabilityAfter);

    constructor(
        address asset_,
        address reserveFeed_,
        address priceFeed_,
        uint256 maxPriceAge_,
        address initialOwner
    ) Ownable(initialOwner) {
        asset = IAtsAsset(asset_);
        reserveFeed = AggregatorV3Interface(reserveFeed_);
        priceFeed = AggregatorV3Interface(priceFeed_);
        maxPriceAge = maxPriceAge_;
    }

    /// @notice Owner decides which accounts may ask the gate to issue.
    function setIssuer(address account, bool allowed) external onlyOwner {
        isAllowedToIssue[account] = allowed;
        emit IssuerSet(account, allowed);
    }

    /// @notice Issue `amount` units to `holder` if the caller is listed and the reserve covers the new supply.
    function issue(address holder, uint256 amount) external {
        if (!isAllowedToIssue[msg.sender]) revert NotAllowedToIssue(msg.sender);
        if (amount == 0) revert ZeroAmount();

        (uint256 reserveValue, uint256 unitValue) = _reserveValueAndUnit();
        uint256 supplyAfter = asset.totalSupply() + amount;
        uint256 liabilityAfter = supplyAfter * unitValue;
        if (liabilityAfter > reserveValue) revert ReserveDoesNotCover(reserveValue, liabilityAfter);

        asset.issue(holder, amount, "");
        emit IssuedThroughGate(msg.sender, holder, amount, supplyAfter);
    }

    /// @notice The largest total supply the reserve covers right now. Reverts if the price is unusable.
    function coveredSupply() public view returns (uint256) {
        (uint256 reserveValue, uint256 unitValue) = _reserveValueAndUnit();
        return reserveValue / unitValue;
    }

    /// @notice How many more units the reserve covers; zero when at or over capacity.
    function headroom() external view returns (uint256) {
        uint256 covered = coveredSupply();
        uint256 supply = asset.totalSupply();
        return covered > supply ? covered - supply : 0;
    }

    /// @return reserveValue the reserve's value in USD scaled by 1e18
    /// @return unitValue one asset unit's face value in USD scaled by 1e18
    function _reserveValueAndUnit() internal view returns (uint256 reserveValue, uint256 unitValue) {
        (, int256 price, , uint256 priceUpdatedAt, ) = priceFeed.latestRoundData();
        if (price <= 0) revert PriceNotPositive(price);
        // An update time in the future counts as age zero rather than underflowing.
        uint256 age = priceUpdatedAt > block.timestamp ? 0 : block.timestamp - priceUpdatedAt;
        if (age > maxPriceAge) revert PriceStale(priceUpdatedAt, maxPriceAge);

        (, int256 reserveAnswer, , , ) = reserveFeed.latestRoundData();
        if (reserveAnswer < 0) revert ReserveNegative(reserveAnswer);

        uint256 feedDecimals = uint256(reserveFeed.decimals()) + uint256(priceFeed.decimals());
        uint256 nominalDecimals = asset.getNominalValueDecimals();
        if (feedDecimals > SCALE_DECIMALS || nominalDecimals > SCALE_DECIMALS) revert DecimalsTooLarge();

        reserveValue = uint256(reserveAnswer) * uint256(price) * 10 ** (SCALE_DECIMALS - feedDecimals);
        unitValue = asset.getNominalValue() * 10 ** (SCALE_DECIMALS - nominalDecimals);
    }
}
