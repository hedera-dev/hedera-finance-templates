// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { DvpSettlement } from "../contracts/DvpSettlement.sol";
import { IAtsHold } from "../contracts/interfaces/IAtsHold.sol";
import { IStablecoinHold } from "../contracts/interfaces/IStablecoinHold.sol";
import { MockCash } from "../contracts/mocks/MockCash.sol";
import { MockSecurity } from "../contracts/mocks/MockSecurity.sol";

contract DvpSettlementTest is Test {
    MockSecurity private securityToken;
    MockCash private cashToken;
    DvpSettlement private desk;

    address private seller;
    address private buyer;
    address private unverified;
    address private stranger;

    uint256 private constant QUANTITY = 100;
    uint256 private constant PRICE = 10_000;
    uint256 private constant GRACE = 300;
    uint256 private constant HOLD_LIFETIME = 3600;

    bytes32 private constant PARTITION = bytes32(uint256(1));

    function setUp() public {
        seller = makeAddr("seller");
        buyer = makeAddr("buyer");
        unverified = makeAddr("unverified");
        stranger = makeAddr("stranger");

        securityToken = new MockSecurity(0);
        cashToken = new MockCash();
        desk = new DvpSettlement(address(securityToken), address(cashToken), GRACE);

        securityToken.issue(seller, 200);
        securityToken.grantKyc(seller);
        securityToken.grantKyc(buyer);
        // `unverified` is deliberately left without KYC on the security.

        cashToken.mint(buyer, 20_000);
        cashToken.mint(unverified, 10_000);
        cashToken.grantHoldCreator(buyer);
        cashToken.grantHoldCreator(unverified);
    }

    // ------------------------------------------------------------- the happy path

    function test_bothLegsMoveInOneCall() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);

        assertTrue(desk.isSettleable(tradeId));
        desk.settle(tradeId);

        assertEq(securityToken.balanceOf(seller), 100, "seller security");
        assertEq(securityToken.balanceOf(buyer), QUANTITY, "buyer security");
        assertEq(cashToken.balanceOf(seller), PRICE, "seller cash");
        assertEq(cashToken.balanceOf(buyer), 10_000, "buyer cash");
        assertEq(securityToken.getHeldAmountForByPartition(PARTITION, seller), 0, "security still held");
        assertEq(cashToken.getHeldAmountFor(buyer), 0, "cash still held");
    }

    function test_aPledgeEncumbersInPlaceAndMovesNothing() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);

        // Free balances fall, nothing has changed hands, and the units are still with their owners.
        assertEq(securityToken.balanceOf(seller), 100, "seller free security");
        assertEq(securityToken.totalOwned(seller), 200, "seller still owns the security");
        assertEq(securityToken.balanceOf(buyer), 0, "buyer has no security yet");
        assertEq(cashToken.balanceOf(buyer), 10_000, "buyer free cash");
        assertEq(cashToken.totalOwned(buyer), 20_000, "buyer still owns the cash");
        assertEq(cashToken.balanceOf(seller), 0, "seller has no cash yet");
    }

    // -------------------------------------------------------------- one leg short

    function test_settleNeedsTheCashLeg() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);

        assertFalse(desk.isSettleable(tradeId));
        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.CashNotPledged.selector, tradeId));
        desk.settle(tradeId);
    }

    function test_settleNeedsTheSecurityLeg() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.SecurityNotPledged.selector, tradeId));
        desk.settle(tradeId);
    }

    /// @notice The template's point: a security leg that cannot land takes the cash leg with it.
    function test_aFailedSecurityLegLeavesTheCashWhereItWas() public {
        uint256 tradeId = _propose(unverified, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), unverified);
        _pledgeCash(tradeId, unverified, PRICE, HOLD_LIFETIME, address(desk), seller);

        vm.expectRevert(abi.encodeWithSelector(MockSecurity.InvalidKycStatus.selector, unverified));
        desk.settle(tradeId);

        assertEq(cashToken.totalOwned(unverified), 10_000, "the buyer paid for nothing");
        assertEq(cashToken.balanceOf(seller), 0, "the seller was paid for a delivery that failed");
        assertEq(securityToken.totalOwned(seller), 200, "the seller still owns the security");
        // Both pledges survive the refusal, so the trade can still be cancelled or settled later.
        assertEq(securityToken.getHeldAmountForByPartition(PARTITION, seller), QUANTITY, "security pledge");
        assertEq(cashToken.getHeldAmountFor(unverified), int64(uint64(PRICE)), "cash pledge");
        assertEq(uint8(desk.getTrade(tradeId).state), uint8(DvpSettlement.State.Open), "trade state");
    }

    // ------------------------------------------------------- a pledge must be real

    function test_aPledgeToAnotherEscrowIsRefused() public {
        uint256 tradeId = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY, HOLD_LIFETIME, stranger, buyer);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.HoldEscrowMismatch.selector, address(desk), stranger));
        desk.lockSecurity(tradeId, holdId);
    }

    function test_aPledgeToAnotherDestinationIsRefused() public {
        uint256 tradeId = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY, HOLD_LIFETIME, address(desk), stranger);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.HoldDestinationMismatch.selector, buyer, stranger));
        desk.lockSecurity(tradeId, holdId);
    }

    function test_aPledgeShortOfTheTermsIsRefused() public {
        uint256 tradeId = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY - 1, HOLD_LIFETIME, address(desk), buyer);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.HoldTooSmall.selector, QUANTITY - 1, QUANTITY));
        desk.lockSecurity(tradeId, holdId);
    }

    function test_aPledgeThatExpiresTooSoonIsRefused() public {
        uint256 tradeId = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY, GRACE - 1, address(desk), buyer);

        vm.expectRevert(
            abi.encodeWithSelector(
                DvpSettlement.HoldExpiresTooSoon.selector, block.timestamp + GRACE - 1, block.timestamp + GRACE
            )
        );
        desk.lockSecurity(tradeId, holdId);
    }

    function test_aPledgeCannotBackTwoTrades() public {
        uint256 first = _propose(buyer, 0);
        uint256 second = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        desk.lockSecurity(first, holdId);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.HoldAlreadyUsed.selector, seller, holdId));
        desk.lockSecurity(second, holdId);
    }

    function test_aLegCannotBePledgedTwice() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        uint256 another = _createSecurityHold(seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.AlreadyPledged.selector, tradeId));
        desk.lockSecurity(tradeId, another);
    }

    /// @notice Anyone may submit a pledge, because the hold itself is what is checked.
    function test_aStrangerCanRecordAPledgeTheOwnerMade() public {
        uint256 tradeId = _propose(buyer, 0);
        uint256 holdId = _createSecurityHold(seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);

        vm.prank(stranger);
        desk.lockSecurity(tradeId, holdId);

        assertEq(desk.getTrade(tradeId).securityHoldId, holdId);
    }

    // ------------------------------------------------------------ time and state

    function test_settleIsRefusedBeforeTheSetTime() public {
        uint256 notBefore = block.timestamp + 600;
        uint256 tradeId = _propose(buyer, notBefore);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);

        assertFalse(desk.isSettleable(tradeId));
        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.TooEarly.selector, notBefore, block.timestamp));
        desk.settle(tradeId);

        vm.warp(notBefore);
        desk.settle(tradeId);
        assertEq(securityToken.balanceOf(buyer), QUANTITY);
    }

    function test_aSetTimeTradeNeedsAPledgeThatOutlastsIt() public {
        uint256 notBefore = block.timestamp + 600;
        uint256 tradeId = _propose(buyer, notBefore);
        // Alive for ten minutes and a bit, but the grace period runs past that.
        uint256 holdId = _createSecurityHold(seller, QUANTITY, 600 + GRACE - 1, address(desk), buyer);

        vm.expectRevert(
            abi.encodeWithSelector(
                DvpSettlement.HoldExpiresTooSoon.selector, block.timestamp + 600 + GRACE - 1, notBefore + GRACE
            )
        );
        desk.lockSecurity(tradeId, holdId);
    }

    function test_aSettledTradeCannotSettleAgain() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);
        desk.settle(tradeId);

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.WrongState.selector, DvpSettlement.State.Settled));
        desk.settle(tradeId);
    }

    function test_anUnknownTradeIsNotATrade() public {
        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.UnknownTrade.selector, uint256(99)));
        desk.settle(99);
    }

    // ---------------------------------------------------------------- cancelling

    function test_cancelReleasesBothPledges() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);
        _pledgeCash(tradeId, buyer, PRICE, HOLD_LIFETIME, address(desk), seller);

        vm.prank(buyer);
        desk.cancel(tradeId);

        assertEq(securityToken.balanceOf(seller), 200, "security free again");
        assertEq(cashToken.balanceOf(buyer), 20_000, "cash free again");
        assertEq(securityToken.getHeldAmountForByPartition(PARTITION, seller), 0, "security pledge");
        assertEq(cashToken.getHeldAmountFor(buyer), 0, "cash pledge");

        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.WrongState.selector, DvpSettlement.State.Cancelled));
        desk.settle(tradeId);
    }

    function test_cancelReleasesWhatWasPledgedAndNothingElse() public {
        uint256 tradeId = _propose(buyer, 0);
        _pledgeSecurity(tradeId, seller, QUANTITY, HOLD_LIFETIME, address(desk), buyer);

        vm.prank(seller);
        desk.cancel(tradeId);

        assertEq(securityToken.balanceOf(seller), 200, "security free again");
        assertEq(cashToken.balanceOf(buyer), 20_000, "buyer's cash untouched");
    }

    function test_onlyAPartyCanCancel() public {
        uint256 tradeId = _propose(buyer, 0);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.NotAParty.selector, stranger));
        desk.cancel(tradeId);
    }

    // ------------------------------------------------------------ the proposal

    function test_proposeRefusesTermsThatAreNotATrade() public {
        vm.startPrank(seller);
        vm.expectRevert(DvpSettlement.BadParameters.selector);
        desk.propose(address(0), QUANTITY, PRICE, 0);

        vm.expectRevert(DvpSettlement.BadParameters.selector);
        desk.propose(seller, QUANTITY, PRICE, 0);

        vm.expectRevert(DvpSettlement.BadParameters.selector);
        desk.propose(buyer, 0, PRICE, 0);

        vm.expectRevert(DvpSettlement.BadParameters.selector);
        desk.propose(buyer, QUANTITY, 0, 0);

        // A settlement time already past is no settlement time at all.
        vm.expectRevert(DvpSettlement.BadParameters.selector);
        desk.propose(buyer, QUANTITY, PRICE, block.timestamp);
        vm.stopPrank();
    }

    function test_aPriceTooLargeForTheStablecoinIsRefused() public {
        uint256 tooMuch = uint256(uint64(type(int64).max)) + 1;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(DvpSettlement.AmountTooLarge.selector, tooMuch));
        desk.propose(buyer, QUANTITY, tooMuch, 0);
    }

    // ------------------------------------------------------------------ helpers

    function _propose(address tradeBuyer, uint256 notBefore) private returns (uint256) {
        vm.prank(seller);
        return desk.propose(tradeBuyer, QUANTITY, PRICE, notBefore);
    }

    function _createSecurityHold(address holder, uint256 amount, uint256 lifetime, address escrow, address destination)
        private
        returns (uint256 holdId)
    {
        vm.prank(holder);
        (, holdId) = securityToken.createHoldByPartition(
            PARTITION,
            IAtsHold.Hold({
                amount: amount,
                expirationTimestamp: block.timestamp + lifetime,
                escrow: escrow,
                to: destination,
                data: ""
            })
        );
    }

    function _pledgeSecurity(
        uint256 tradeId,
        address holder,
        uint256 amount,
        uint256 lifetime,
        address escrow,
        address destination
    ) private {
        desk.lockSecurity(tradeId, _createSecurityHold(holder, amount, lifetime, escrow, destination));
    }

    function _pledgeCash(
        uint256 tradeId,
        address holder,
        uint256 amount,
        uint256 lifetime,
        address escrow,
        address destination
    ) private {
        vm.prank(holder);
        (, uint256 holdId) = cashToken.createHold(
            IStablecoinHold.Hold({
                amount: int64(uint64(amount)),
                expirationTimestamp: block.timestamp + lifetime,
                escrow: escrow,
                to: destination,
                data: ""
            })
        );
        desk.lockCash(tradeId, holdId);
    }
}
