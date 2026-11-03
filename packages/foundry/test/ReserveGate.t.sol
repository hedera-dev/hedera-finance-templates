// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReserveGate } from "../contracts/ReserveGate.sol";
import { ReserveFeed } from "../contracts/ReserveFeed.sol";
import { MockAggregator } from "../contracts/mocks/MockAggregator.sol";
import { MockCollateral } from "../contracts/mocks/MockCollateral.sol";
import { MockAtsAsset } from "../contracts/mocks/MockAtsAsset.sol";

contract ReserveGateTest is Test {
    // $100,000 per BTC at 8 decimals; 3 collateral units (1 unit = 1 BTC); a $1,000.00 face value stored with 2.
    int256 constant PRICE = 100_000e8;
    uint256 constant RESERVE_UNITS = 3;
    uint256 constant NOMINAL = 100_000; // 1000.00
    uint256 constant NOMINAL_DECIMALS = 2;
    uint256 constant MAX_AGE = 1 days;
    // 3 * 100,000 / 1,000
    uint256 constant COVERED = 300;

    MockAggregator priceFeed;
    MockCollateral collateral;
    ReserveFeed reserveFeed;
    MockAtsAsset asset;
    ReserveGate gate;

    address owner = makeAddr("owner");
    address issuer = makeAddr("issuer");
    address stranger = makeAddr("stranger");
    address reserve = makeAddr("reserve");
    address holder = makeAddr("holder");

    function setUp() public {
        vm.warp(1_700_000_000);
        priceFeed = new MockAggregator(8, PRICE);
        collateral = new MockCollateral();
        collateral.setBalance(reserve, RESERVE_UNITS);
        reserveFeed = new ReserveFeed(address(collateral), reserve, 0);
        asset = new MockAtsAsset(NOMINAL, NOMINAL_DECIMALS);
        gate = new ReserveGate(address(asset), address(reserveFeed), address(priceFeed), MAX_AGE, owner);
        asset.grantIssuer(address(gate));
        vm.prank(owner);
        gate.setIssuer(issuer, true);
    }

    function _issue(address caller, uint256 amount) internal {
        vm.prank(caller);
        gate.issue(holder, amount);
    }

    // --- boundary arithmetic -------------------------------------------------------------------

    function test_coveredSupplyUsesOneStatedScale() public view {
        assertEq(gate.coveredSupply(), COVERED);
        assertEq(gate.headroom(), COVERED);
    }

    function test_exactlyCoveredIsAllowed() public {
        _issue(issuer, COVERED);
        assertEq(asset.totalSupply(), COVERED);
        assertEq(asset.balanceOf(holder), COVERED);
        assertEq(gate.headroom(), 0);
    }

    function test_oneUnitOverIsRefused() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ReserveGate.ReserveDoesNotCover.selector,
                uint256(3 * 100_000e18),
                uint256(301 * 1_000e18)
            )
        );
        _issue(issuer, COVERED + 1);
    }

    function test_oneUnitUnderIsAllowedAndLeavesOneOfHeadroom() public {
        _issue(issuer, COVERED - 1);
        assertEq(gate.headroom(), 1);
        _issue(issuer, 1);
        assertEq(gate.headroom(), 0);
        vm.expectRevert();
        _issue(issuer, 1);
    }

    function test_refusalIssuesNothing() public {
        _issue(issuer, 10);
        vm.expectRevert();
        _issue(issuer, COVERED);
        assertEq(asset.totalSupply(), 10);
        assertEq(asset.balanceOf(holder), 10);
    }

    function test_reserveFallingBelowSupplyRefusesAndReportsNoHeadroom() public {
        _issue(issuer, 250);
        collateral.setBalance(reserve, 2); // covers 200, supply is 250
        assertEq(gate.coveredSupply(), 200);
        assertEq(gate.headroom(), 0);
        vm.expectRevert();
        _issue(issuer, 1);
        assertEq(asset.totalSupply(), 250);
    }

    function test_priceMovingChangesCover() public {
        priceFeed.set(PRICE / 2, block.timestamp);
        assertEq(gate.coveredSupply(), 150);
        _issue(issuer, 150);
        vm.expectRevert();
        _issue(issuer, 1);
    }

    function test_differentFeedDecimalsStayInOneScale() public {
        // A 2-decimal price feed ($100,000.00) and a 6-decimal nominal value give the same cover.
        MockAggregator coarse = new MockAggregator(2, 100_000e2);
        MockAtsAsset fine = new MockAtsAsset(1_000e6, 6);
        ReserveGate other = new ReserveGate(address(fine), address(reserveFeed), address(coarse), MAX_AGE, owner);
        assertEq(other.coveredSupply(), COVERED);
    }

    function test_decimalsBeyondTheScaleAreRefused() public {
        MockAggregator wide = new MockAggregator(18, 100_000e18);
        ReserveGate other = new ReserveGate(address(asset), address(reserveFeed), address(wide), MAX_AGE, owner);
        vm.expectRevert(ReserveGate.DecimalsTooLarge.selector);
        other.coveredSupply();
    }

    // --- the two independent refusals ----------------------------------------------------------

    function test_unlistedCallerIsRefusedHoweverWellCollateralised() public {
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.NotAllowedToIssue.selector, stranger));
        _issue(stranger, 1);
        assertEq(asset.totalSupply(), 0);
    }

    function test_listedCallerIsStillRefusedBeyondTheReserve() public {
        assertTrue(gate.isAllowedToIssue(issuer));
        vm.expectRevert();
        _issue(issuer, COVERED + 1);
    }

    function test_authorisationIsCheckedBeforeTheReserve() public {
        // Over the reserve AND unlisted: the answer is about who, not how much.
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.NotAllowedToIssue.selector, stranger));
        _issue(stranger, COVERED + 1_000);
    }

    function test_txOriginDoesNotAuthorise() public {
        vm.prank(stranger, issuer); // msg.sender stranger, tx.origin a listed account
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.NotAllowedToIssue.selector, stranger));
        gate.issue(holder, 1);
    }

    function test_onlyOwnerChangesTheList() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        gate.setIssuer(stranger, true);

        vm.prank(owner);
        gate.setIssuer(issuer, false);
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.NotAllowedToIssue.selector, issuer));
        _issue(issuer, 1);
    }

    function test_zeroAmountIsRefused() public {
        vm.expectRevert(ReserveGate.ZeroAmount.selector);
        _issue(issuer, 0);
    }

    // --- the price -----------------------------------------------------------------------------

    function test_zeroPriceIsRefused() public {
        priceFeed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.PriceNotPositive.selector, int256(0)));
        _issue(issuer, 1);
        assertEq(asset.totalSupply(), 0);
    }

    function test_negativePriceIsRefused() public {
        priceFeed.set(-1, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.PriceNotPositive.selector, int256(-1)));
        _issue(issuer, 1);
    }

    function test_stalePriceIsRefused() public {
        uint256 updated = block.timestamp;
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.expectRevert(abi.encodeWithSelector(ReserveGate.PriceStale.selector, updated, MAX_AGE));
        _issue(issuer, 1);
        assertEq(asset.totalSupply(), 0);
    }

    function test_priceExactlyAtTheThresholdIsStillFresh() public {
        vm.warp(block.timestamp + MAX_AGE);
        _issue(issuer, 1);
        assertEq(asset.totalSupply(), 1);
    }

    function test_viewsRevertOnUnusablePrice() public {
        priceFeed.set(0, block.timestamp);
        vm.expectRevert();
        gate.coveredSupply();
    }

    // --- the gate is the only issuer, and the asset says so ------------------------------------

    function test_assetRefusesACallerThatIsNotTheGate() public {
        vm.expectRevert();
        vm.prank(issuer);
        asset.issue(holder, 1, "");
    }
}

contract ReserveFeedTest is Test {
    MockCollateral collateral;
    ReserveFeed feed;
    address reserve = makeAddr("reserve");

    function setUp() public {
        vm.warp(1_700_000_000);
        collateral = new MockCollateral();
        feed = new ReserveFeed(address(collateral), reserve, 0);
    }

    function test_reportsTheLiveBalanceAtEightDecimals() public {
        collateral.setBalance(reserve, 3);
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        assertEq(feed.decimals(), 8);
        assertEq(answer, 3e8);
        assertEq(updatedAt, block.timestamp);
    }

    function test_followsTheBalanceWithNoSetter() public {
        collateral.setBalance(reserve, 3);
        collateral.setBalance(reserve, 1);
        (, int256 answer, , , ) = feed.latestRoundData();
        assertEq(answer, 1e8);
        vm.warp(block.timestamp + 100);
        (, , , uint256 updatedAt, ) = feed.latestRoundData();
        assertEq(updatedAt, block.timestamp);
    }

    function test_otherAddressesDoNotCount() public {
        collateral.setBalance(makeAddr("other"), 99);
        (, int256 answer, , , ) = feed.latestRoundData();
        assertEq(answer, 0);
    }

    function test_collateralDecimalsAreScaledNotAssumed() public {
        ReserveFeed six = new ReserveFeed(address(collateral), reserve, 6);
        collateral.setBalance(reserve, 2_500_000); // 2.5 units at 6 decimals
        (, int256 answer, , , ) = six.latestRoundData();
        assertEq(answer, 2.5e8);
    }
}
