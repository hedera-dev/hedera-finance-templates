// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { BillPriceFeed } from "../contracts/BillPriceFeed.sol";

contract BillPriceFeedTest is Test {
    uint256 constant FACE = 1000e8;
    BillPriceFeed feed;

    function setUp() public {
        vm.warp(1_000_000);
        feed = new BillPriceFeed(FACE, block.timestamp + 91, 1, 500, address(this));
    }

    function test_runningExamplePrice() public view {
        assertEq(feed.daysRemaining(), 91);
        // 1000 x (1 - 0.05 x 91/360) = 987.36111111
        assertEq(feed.price(), 98_736_111_111);
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        assertEq(answer, 98_736_111_111);
        assertEq(updatedAt, block.timestamp);
    }

    function test_priceAccretesTowardParWithTheClock() public {
        uint256 before_ = feed.price();
        vm.warp(block.timestamp + 10);
        assertEq(feed.daysRemaining(), 81);
        assertGt(feed.price(), before_);
    }

    function test_maturedBillPricesAtPar() public {
        vm.warp(block.timestamp + 500);
        assertEq(feed.daysRemaining(), 0);
        assertEq(feed.price(), FACE);
    }

    function test_productionClockFloorsToWholeDays() public {
        BillPriceFeed prod = new BillPriceFeed(FACE, block.timestamp + 91 days, 86_400, 500, address(this));
        assertEq(prod.daysRemaining(), 91);
        vm.warp(block.timestamp + 1 days + 5);
        assertEq(prod.daysRemaining(), 89); // 90 days minus 5 seconds floors to 89
    }

    function test_shockMovesThePrice() public {
        feed.setDiscountRate(1200);
        // 1000 x (1 - 0.12 x 91/360) = 969.66666666
        assertEq(feed.price(), 96_966_666_666);
    }

    function test_impossibleRatePricesAtZero() public {
        feed.setDiscountRate(1_000_000);
        assertEq(feed.price(), 0);
    }

    function test_pinFreezesUpdatedAtAndZeroUnpins() public {
        feed.pinUpdatedAt(block.timestamp - 1_000);
        (,,, uint256 updatedAt,) = feed.latestRoundData();
        assertEq(updatedAt, block.timestamp - 1_000);
        feed.pinUpdatedAt(0);
        (,,, updatedAt,) = feed.latestRoundData();
        assertEq(updatedAt, block.timestamp);
    }

    function test_onlyTheOwnerPublishes() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        feed.setDiscountRate(1);
        vm.prank(address(0xBAD));
        vm.expectRevert();
        feed.pinUpdatedAt(1);
    }

    function test_hasNoSetterForThePrice() public view {
        assertEq(feed.decimals(), 8);
    }
}
