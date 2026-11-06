// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { BillRepo } from "../contracts/BillRepo.sol";
import { IAtsHold } from "../contracts/interfaces/IAtsHold.sol";
import { MockBill } from "../contracts/mocks/MockBill.sol";
import { MockCash } from "../contracts/mocks/MockCash.sol";
import { MockAggregator } from "../contracts/mocks/MockAggregator.sol";

/// Runs the repo contract against a mock bill, a mock stablecoin and `MockAggregator`: no network.
/// Amounts: stablecoin has 2 decimals ($9,600 = 960_000), prices have 8 (the running example's price is
/// 987.36111111 = 98_736_111_111), the bill has 0.
contract BillRepoTest is Test {
    uint256 constant PRICE_EXAMPLE = 98_736_111_111; // 1000 x (1 - 0.05 x 91/360)
    uint256 constant PAR = 1000e8;
    uint256 constant HAIRCUT = 200;
    uint256 constant THRESHOLD = 9900;
    uint256 constant MAX_AGE = 300;
    uint256 constant GRACE = 3600;
    uint256 constant TERM_DAYS = 30;
    uint256 constant RATE = 480;
    uint256 constant BILLS = 10;

    MockBill bill;
    MockCash cash;
    MockAggregator feed;
    BillRepo repo;
    address lender;
    address borrower = makeAddr("borrower");
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.warp(1_700_000_000);
        lender = address(this);
        bill = new MockBill(0);
        cash = new MockCash();
        feed = new MockAggregator(8, int256(PRICE_EXAMPLE));
        repo = new BillRepo(
            address(bill),
            makeAddr("stablecoinProxy"),
            address(cash),
            address(feed),
            HAIRCUT,
            THRESHOLD,
            MAX_AGE,
            GRACE,
            1
        );
        bill.issue(borrower, BILLS);
        cash.mint(lender, 100_000_00);
        cash.mint(borrower, 200_00); // a little cash for the interest
    }

    // ------------------------------------------------------------ helpers

    function _pledge(address escrow, address to, uint256 expiry, uint256 amount) internal returns (uint256 holdId) {
        bytes32 partition = repo.PARTITION(); // read first: a prank applies to the very next call
        vm.prank(borrower);
        (, holdId) = bill.createHoldByPartition(
            partition, IAtsHold.Hold({ amount: amount, expirationTimestamp: expiry, escrow: escrow, to: to, data: "" })
        );
    }

    function _goodExpiry() internal view returns (uint256) {
        return block.timestamp + TERM_DAYS + GRACE + 1_000;
    }

    function _pledgeGood() internal returns (uint256) {
        return _pledge(address(repo), lender, _goodExpiry(), BILLS);
    }

    function _open(uint256 holdId, uint256 principal) internal returns (uint256 loanId) {
        cash.approve(address(repo), principal);
        loanId = repo.openLoan(borrower, holdId, BILLS, principal, RATE, TERM_DAYS);
    }

    function _setPrice(uint256 price) internal {
        feed.set(int256(price), block.timestamp);
    }

    function _openExample() internal returns (uint256 loanId) {
        loanId = _open(_pledgeGood(), 960_000);
    }

    function _approveAndRepay(uint256 loanId) internal {
        (,, uint256 debt) = repo.debtOf(loanId);
        vm.startPrank(borrower);
        cash.approve(address(repo), debt);
        repo.repay(loanId);
        vm.stopPrank();
    }

    // ------------------------------------------------- the running example

    function test_runningExampleNumbers() public {
        uint256 holdId = _pledgeGood();
        (uint256 price, uint256 value8, uint256 capacity8) = repo.validateOpen(borrower, holdId, BILLS, 960_000, 30);
        assertEq(price, PRICE_EXAMPLE);
        assertEq(value8 / 1e6, 987_361); // $9,873.61 of collateral
        assertEq(capacity8 / 1e6, 967_613); // $9,676.13..: capacity after the 2% haircut
        uint256 loanId = _open(holdId, 960_000);

        BillRepo.Position memory p = repo.position(loanId);
        assertEq(p.ltvBps, 9723); // 97.23%
        assertEq(p.liquidationPrice8 / 1e6, 969_69); // $969.69.. per bill, which the page rounds to $969.70
        assertTrue(p.priceUsable);
        assertEq(uint8(p.state), uint8(BillRepo.LoanState.Open));
    }

    function test_interestOverTheTermIs3840() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + 30);
        (uint256 principal, uint256 interest, uint256 debt) = repo.debtOf(loanId);
        assertEq(principal, 960_000);
        assertEq(interest, 3_840); // $38.40
        assertEq(debt, 963_840); // $9,638.40
        vm.warp(block.timestamp + 500); // interest stops at the term
        (, interest,) = repo.debtOf(loanId);
        assertEq(interest, 3_840);
    }

    function test_collateralNeverMoves() public {
        uint256 loanId = _openExample();
        assertEq(bill.totalOwned(borrower), BILLS);
        assertEq(bill.balanceOf(borrower), 0);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
        assertEq(bill.totalOwned(address(repo)), 0);
        assertEq(cash.balanceOf(address(repo)), 0);
        assertEq(repo.getLoan(loanId).collateral, BILLS);
    }

    function test_openMovesTheCash() public {
        uint256 lenderBefore = cash.balanceOf(lender);
        uint256 borrowerBefore = cash.balanceOf(borrower);
        _openExample();
        assertEq(cash.balanceOf(lender), lenderBefore - 960_000);
        assertEq(cash.balanceOf(borrower), borrowerBefore + 960_000);
    }

    // ------------------------------------------------------- capacity

    function test_capacityExactlyMet() public {
        _setPrice(PAR); // value $10,000, capacity $9,800.00 = 980_000
        uint256 holdId = _pledgeGood();
        uint256 loanId = _open(holdId, 980_000);
        assertEq(repo.getLoan(loanId).principal, 980_000);
    }

    function test_capacityOneUnitOverIsRefused() public {
        _setPrice(PAR);
        uint256 holdId = _pledgeGood();
        cash.approve(address(repo), 980_001);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.ExceedsCapacity.selector, 980_001e6, 980_000e6));
        repo.openLoan(borrower, holdId, BILLS, 980_001, RATE, TERM_DAYS);
    }

    function test_capacityOneUnitUnderIsAccepted() public {
        _setPrice(PAR);
        uint256 holdId = _pledgeGood();
        uint256 loanId = _open(holdId, 979_999);
        assertEq(repo.getLoan(loanId).principal, 979_999);
    }

    function test_refusalMovesNoCashAndLeavesTheHold() public {
        _setPrice(PAR);
        uint256 holdId = _pledgeGood();
        uint256 lenderBefore = cash.balanceOf(lender);
        uint256 borrowerBefore = cash.balanceOf(borrower);
        cash.approve(address(repo), 2_000_000);
        vm.expectRevert();
        repo.openLoan(borrower, holdId, BILLS, 2_000_000, RATE, TERM_DAYS);
        _assertUntouched(holdId, lenderBefore, borrowerBefore);
    }

    function _assertUntouched(uint256 holdId, uint256 lenderBefore, uint256 borrowerBefore) internal view {
        assertEq(cash.balanceOf(lender), lenderBefore);
        assertEq(cash.balanceOf(borrower), borrowerBefore);
        (uint256 amount,, address escrow, address to,,,) = bill.getHoldForByPartition(
            IAtsHold.HoldIdentifier({ partition: repo.PARTITION(), tokenHolder: borrower, holdId: holdId })
        );
        assertEq(amount, BILLS);
        assertEq(escrow, address(repo));
        assertEq(to, lender);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
        assertEq(repo.nextLoanId(), 1);
    }

    // ------------------------------------------------------------ LTV boundary

    function _openAtPriceThenSet(uint256 openPrice, uint256 principal, uint256 laterPrice)
        internal
        returns (uint256 loanId)
    {
        _setPrice(openPrice);
        loanId = _open(_pledgeGood(), principal);
        _setPrice(laterPrice);
    }

    /// The price at which $9,900 of debt against 10 bills sits at `bps` (rounded down).
    function _priceForLtv(uint256 bps) internal pure returns (uint256) {
        uint256 debt8 = 9900e8;
        return (debt8 * 10_000) / (bps * BILLS);
    }

    function test_ltvExactlyAtTheThresholdIsLiquidatable() public {
        // $9,900 of debt against exactly $10,000 of collateral is 99.00%.
        uint256 loanId = _openAtPriceThenSet(1100e8, 990_000, PAR);
        assertEq(repo.position(loanId).ltvBps, 9900);
        repo.liquidate(loanId);
        assertEq(uint8(repo.getLoan(loanId).state), uint8(BillRepo.LoanState.Liquidated));
    }

    function test_ltvOneBasisPointBelowIsNotLiquidatable() public {
        uint256 loanId = _openAtPriceThenSet(1100e8, 990_000, _priceForLtv(9899) + 1);
        assertEq(repo.position(loanId).ltvBps, 9899);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotLiquidatable.selector, 9899, THRESHOLD));
        repo.liquidate(loanId);
    }

    function test_ltvOneBasisPointAboveIsLiquidatable() public {
        uint256 loanId = _openAtPriceThenSet(1100e8, 990_000, _priceForLtv(9901));
        assertGe(repo.position(loanId).ltvBps, 9901);
        repo.liquidate(loanId);
        assertEq(uint8(repo.getLoan(loanId).state), uint8(BillRepo.LoanState.Liquidated));
    }

    function test_liquidationPriceAgreesWithTheContractsLtv() public {
        uint256 loanId = _openExample();
        uint256 liquidationPrice = repo.position(loanId).liquidationPrice8;

        _setPrice(liquidationPrice); // the highest price at which the loan is liquidatable
        assertGe(repo.position(loanId).ltvBps, THRESHOLD);

        _setPrice(liquidationPrice + 1);
        vm.expectRevert();
        repo.liquidate(loanId);

        _setPrice(liquidationPrice);
        repo.liquidate(loanId);
    }

    function test_liquidationPriceRisesAsInterestAccrues() public {
        uint256 loanId = _openExample();
        uint256 before_ = repo.position(loanId).liquidationPrice8;
        vm.warp(block.timestamp + 15);
        assertGt(repo.position(loanId).liquidationPrice8, before_);
    }

    // ---------------------------------------------------------- liquidation

    function test_priceLiquidationSendsTheBillsToTheLenderOnly() public {
        uint256 loanId = _openExample();
        _setPrice(96_000_000_000); // a $960 bill
        vm.prank(stranger); // permissionless
        repo.liquidate(loanId);
        assertEq(bill.totalOwned(lender), BILLS);
        assertEq(bill.totalOwned(borrower), 0);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), 0);
    }

    function test_termLiquidationNeedsNoPrice() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + TERM_DAYS);
        feed.set(0, 0); // a zero price, last updated at the epoch
        repo.liquidate(loanId);
        assertEq(bill.totalOwned(lender), BILLS);
    }

    function test_termLiquidationSucceedsOnAStalePriceWhilePriceLiquidationIsRefused() public {
        uint256 loanId = _openExample();
        _setPrice(90_000_000_000);
        feed.set(90_000_000_000, block.timestamp - MAX_AGE - 1); // would be liquidatable, but stale
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceStale.selector, block.timestamp - MAX_AGE - 1, MAX_AGE));
        repo.liquidate(loanId);

        vm.warp(block.timestamp + TERM_DAYS);
        repo.liquidate(loanId);
        assertEq(bill.totalOwned(lender), BILLS);
    }

    function test_priceLiquidationRefusedOnAZeroPrice() public {
        uint256 loanId = _openExample();
        feed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceInvalid.selector, int256(0)));
        repo.liquidate(loanId);
        feed.set(-5, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceInvalid.selector, int256(-5)));
        repo.liquidate(loanId);
    }

    function test_cannotLiquidateBeforeTheTermAtAHealthyPrice() public {
        uint256 loanId = _openExample();
        vm.expectRevert();
        repo.liquidate(loanId);
        assertEq(bill.totalOwned(borrower), BILLS);
    }

    function test_cannotLiquidateTwiceOrAfterRepayment() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + TERM_DAYS);
        repo.liquidate(loanId);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.WrongState.selector, BillRepo.LoanState.Liquidated));
        repo.liquidate(loanId);
    }

    // ------------------------------------------------------------ stale and zero

    function test_staleOrZeroPriceBlocksBorrowing() public {
        uint256 holdId = _pledgeGood();
        cash.approve(address(repo), 960_000);

        feed.set(int256(PRICE_EXAMPLE), block.timestamp - MAX_AGE - 1);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceStale.selector, block.timestamp - MAX_AGE - 1, MAX_AGE));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);

        feed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceInvalid.selector, int256(0)));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
        assertEq(repo.nextLoanId(), 1);
    }

    function test_positionReportsAnUnreadableFeedAsUnusableNotAsAPrice() public {
        uint256 loanId = _openExample();
        feed.set(int256(PRICE_EXAMPLE), block.timestamp - MAX_AGE - 1);
        assertFalse(repo.position(loanId).priceUsable);
        feed.set(0, block.timestamp);
        BillRepo.Position memory p = repo.position(loanId);
        assertFalse(p.priceUsable);
        assertEq(p.value8, 0);
    }

    // ------------------------------------------------------ verifying the hold

    function test_holdWithTheWrongEscrowIsRefused() public {
        uint256 holdId = _pledge(lender, lender, _goodExpiry(), BILLS); // escrow is the lender, not the repo
        uint256 lenderBefore = cash.balanceOf(lender);
        uint256 borrowerBefore = cash.balanceOf(borrower);
        cash.approve(address(repo), 960_000);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.HoldEscrowMismatch.selector, address(repo), lender));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
        assertEq(cash.balanceOf(lender), lenderBefore);
        assertEq(cash.balanceOf(borrower), borrowerBefore);
        // From outside the pledge looks right: the bills are held and out of the free balance.
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
    }

    function test_holdWithTheWrongDestinationIsRefused() public {
        uint256 holdId = _pledge(address(repo), stranger, _goodExpiry(), BILLS);
        cash.approve(address(repo), 960_000);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.HoldDestinationMismatch.selector, lender, stranger));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
        assertEq(cash.balanceOf(borrower), 200_00);
    }

    function test_holdSmallerThanTheCollateralClaimedIsRefused() public {
        uint256 holdId = _pledge(address(repo), lender, _goodExpiry(), 5);
        cash.approve(address(repo), 960_000);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.HoldTooSmall.selector, 5, BILLS));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
    }

    function test_holdThatExpiresMidTermIsRefused() public {
        uint256 expiry = block.timestamp + TERM_DAYS + GRACE - 1; // one second short of term plus grace
        uint256 holdId = _pledge(address(repo), lender, expiry, BILLS);
        cash.approve(address(repo), 960_000);
        vm.expectRevert(
            abi.encodeWithSelector(BillRepo.HoldExpiresTooSoon.selector, expiry, block.timestamp + TERM_DAYS + GRACE)
        );
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
        assertEq(cash.balanceOf(borrower), 200_00);
    }

    function test_holdExpiringExactlyAtTermPlusGraceIsAccepted() public {
        uint256 holdId = _pledge(address(repo), lender, block.timestamp + TERM_DAYS + GRACE, BILLS);
        assertEq(_open(holdId, 960_000), 1);
    }

    function test_aHoldCannotSecureTwoLoans() public {
        uint256 holdId = _pledgeGood();
        _open(holdId, 100_000);
        cash.approve(address(repo), 100_000);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.HoldAlreadyUsed.selector, borrower, holdId));
        repo.openLoan(borrower, holdId, BILLS, 100_000, RATE, TERM_DAYS);
    }

    function test_unknownHoldIsRefused() public {
        cash.approve(address(repo), 960_000);
        vm.expectRevert();
        repo.openLoan(borrower, 99, BILLS, 960_000, RATE, TERM_DAYS);
    }

    function test_validateOpenGivesTheSameRefusalAsOpenLoan() public {
        uint256 holdId = _pledge(lender, lender, _goodExpiry(), BILLS);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.HoldEscrowMismatch.selector, address(repo), lender));
        repo.validateOpen(borrower, holdId, BILLS, 960_000, 30);
    }

    // ----------------------------------------------------------- access control

    function test_onlyTheLenderOpens() public {
        uint256 holdId = _pledgeGood();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotLender.selector, stranger));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotLender.selector, borrower));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
    }

    function test_onlyTheBorrowerRepaysOrTopsUp() public {
        uint256 loanId = _openExample();
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotBorrower.selector, lender));
        repo.repay(loanId);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotBorrower.selector, stranger));
        repo.topUp(loanId, 1);
    }

    function test_txOriginIsNeverAuthority() public {
        uint256 holdId = _pledgeGood();
        cash.approve(address(repo), 960_000);
        vm.prank(stranger, lender); // msg.sender is a stranger, tx.origin is the lender
        vm.expectRevert(abi.encodeWithSelector(BillRepo.NotLender.selector, stranger));
        repo.openLoan(borrower, holdId, BILLS, 960_000, RATE, TERM_DAYS);
    }

    // ------------------------------------------------------------------ repay

    function test_repayReleasesTheHoldAndPaysTheLender() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + 10);
        (,, uint256 debt) = repo.debtOf(loanId);
        uint256 lenderBefore = cash.balanceOf(lender);

        _approveAndRepay(loanId);

        assertEq(cash.balanceOf(lender), lenderBefore + debt);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), 0);
        assertEq(bill.balanceOf(borrower), BILLS);
        assertEq(uint8(repo.getLoan(loanId).state), uint8(BillRepo.LoanState.Repaid));
    }

    function test_repayTheBorrowerCannotFundIsRefusedAndTheHoldStays() public {
        uint256 loanId = _openExample();
        uint256 spendable = cash.balanceOf(borrower);
        vm.prank(borrower);
        cash.transfer(stranger, spendable); // spend the cash away
        vm.startPrank(borrower);
        cash.approve(address(repo), 963_840);
        vm.expectRevert();
        repo.repay(loanId);
        vm.stopPrank();
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
        assertEq(uint8(repo.getLoan(loanId).state), uint8(BillRepo.LoanState.Open));
    }

    function test_repayWithoutAllowanceIsRefusedAndTheHoldStays() public {
        uint256 loanId = _openExample();
        vm.prank(borrower);
        vm.expectRevert();
        repo.repay(loanId);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
    }

    function test_repayAfterTheHoldExpiredIsRefusedAndMovesNoCash() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + TERM_DAYS + GRACE + 2_000);
        (,, uint256 debt) = repo.debtOf(loanId);
        uint256 lenderBefore = cash.balanceOf(lender);
        vm.startPrank(borrower);
        cash.approve(address(repo), debt);
        vm.expectRevert(MockBill.HoldExpired.selector);
        repo.repay(loanId);
        vm.stopPrank();
        assertEq(cash.balanceOf(lender), lenderBefore);
    }

    // ------------------------------------------------------------------- cure

    function test_topUpLowersTheDebtAndCuresTheLtv() public {
        uint256 loanId = _openAtPriceThenSet(1100e8, 990_000, 100_100_000_000); // LTV a hair under 99%
        _setPrice(PAR - 5e8); // $995: LTV 99.5%
        assertGe(repo.position(loanId).ltvBps, THRESHOLD);

        vm.startPrank(borrower);
        cash.approve(address(repo), 100_00);
        repo.topUp(loanId, 100_00);
        vm.stopPrank();

        BillRepo.Position memory p = repo.position(loanId);
        assertEq(p.principal, 980_000);
        assertLt(p.ltvBps, THRESHOLD);
        vm.expectRevert();
        repo.liquidate(loanId);
    }

    function test_topUpKeepsTheInterestEarnedSoFar() public {
        uint256 loanId = _openExample();
        vm.warp(block.timestamp + 15);
        (, uint256 interestBefore,) = repo.debtOf(loanId);
        assertEq(interestBefore, 1_920);

        vm.startPrank(borrower);
        cash.approve(address(repo), 480_000);
        repo.topUp(loanId, 480_000);
        vm.stopPrank();

        (uint256 principal, uint256 interest, uint256 debt) = repo.debtOf(loanId);
        assertEq(principal, 480_000);
        assertEq(interest, 1_920);
        assertEq(debt, 481_920);

        vm.warp(block.timestamp + 15); // the rest of the term accrues on half the principal
        (, interest,) = repo.debtOf(loanId);
        assertEq(interest, 1_920 + 1_920 / 2);
    }

    function test_topUpOnAStalePriceIsRefused() public {
        uint256 loanId = _openExample();
        feed.set(int256(PRICE_EXAMPLE), block.timestamp - MAX_AGE - 1);
        vm.startPrank(borrower);
        cash.approve(address(repo), 100_00);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.PriceStale.selector, block.timestamp - MAX_AGE - 1, MAX_AGE));
        repo.topUp(loanId, 100_00);
        vm.stopPrank();
        assertEq(repo.getLoan(loanId).principal, 960_000);
    }

    function test_topUpMoreThanThePrincipalIsRefused() public {
        uint256 loanId = _openExample();
        vm.startPrank(borrower);
        cash.approve(address(repo), 1_000_000);
        vm.expectRevert(abi.encodeWithSelector(BillRepo.AmountTooLarge.selector, 960_001, 960_000));
        repo.topUp(loanId, 960_001);
        vm.stopPrank();
    }

    // ------------------------------------- what the bill itself guarantees

    function test_escrowCannotRedirectTheHoldAndOnlyTheEscrowMayAct() public {
        uint256 holdId = _pledgeGood();
        IAtsHold.HoldIdentifier memory id = IAtsHold.HoldIdentifier(repo.PARTITION(), borrower, holdId);

        vm.prank(address(repo));
        vm.expectRevert(abi.encodeWithSelector(MockBill.InvalidDestinationAddress.selector, lender, stranger));
        bill.executeHoldByPartition(id, stranger, BILLS);

        vm.prank(borrower);
        vm.expectRevert(MockBill.IsNotEscrow.selector);
        bill.releaseHoldByPartition(id, BILLS);
        vm.expectRevert(MockBill.IsNotEscrow.selector);
        bill.executeHoldByPartition(id, lender, BILLS);

        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
    }

    function test_borrowerCannotReclaimBeforeExpiryAndCanAfter() public {
        uint256 holdId = _pledgeGood();
        IAtsHold.HoldIdentifier memory id = IAtsHold.HoldIdentifier(repo.PARTITION(), borrower, holdId);
        vm.prank(borrower);
        vm.expectRevert(MockBill.HoldNotExpired.selector);
        bill.reclaimHoldByPartition(id);

        vm.warp(_goodExpiry() + 1);
        vm.prank(borrower);
        bill.reclaimHoldByPartition(id);
        assertEq(bill.balanceOf(borrower), BILLS);
    }

    function test_heldBillsAreNotInTheFreeBalance() public {
        assertEq(bill.balanceOf(borrower), BILLS);
        _pledgeGood();
        assertEq(bill.balanceOf(borrower), 0);
        assertEq(bill.getHeldAmountForByPartition(repo.PARTITION(), borrower), BILLS);
        assertEq(bill.totalOwned(borrower), BILLS);
    }

    // ------------------------------------------------------------- constructor

    function test_constructorRefusesABillWithDecimals() public {
        MockBill wrong = new MockBill(2);
        vm.expectRevert(BillRepo.BadParameters.selector);
        new BillRepo(address(wrong), address(0xA), address(cash), address(feed), HAIRCUT, THRESHOLD, MAX_AGE, GRACE, 1);
    }

    function test_constructorRefusesAThresholdBelowTheBorrowingLimit() public {
        vm.expectRevert(BillRepo.BadParameters.selector);
        new BillRepo(address(bill), address(0xA), address(cash), address(feed), HAIRCUT, 9700, MAX_AGE, GRACE, 1);
    }

    function test_cashScaleIsReadFromTheTokenNotAssumed() public view {
        assertEq(repo.cashScale(), 1e6);
        assertEq(repo.feedDecimals(), 8);
    }

    function test_aFeedWithOtherDecimalsIsNormalised() public {
        MockAggregator feed18 = new MockAggregator(18, int256(PAR * 1e10));
        BillRepo repo18 = new BillRepo(
            address(bill), address(0xA), address(cash), address(feed18), HAIRCUT, THRESHOLD, MAX_AGE, GRACE, 1
        );
        assertEq(repo18.price8(), PAR);
    }
}
