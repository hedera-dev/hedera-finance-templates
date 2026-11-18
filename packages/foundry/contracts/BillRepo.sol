// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { IAtsHold } from "./interfaces/IAtsHold.sol";

/// @notice A repo of an ATS Treasury bill for a Stablecoin Studio stablecoin, with the bill never moving.
/// @dev The collateral stays in the borrower's account, encumbered by an ATS hold that names THIS contract as
///      escrow and the lender as destination. The contract takes no custody and holds no role on the bill:
///      it can only release the hold back to the borrower, or execute it to the one destination the
///      borrower fixed when pledging.
///
///      Cash moves only against a hold this contract has read back from the bill. All comparisons are made
///      in 8-decimal US dollars: `price x quantity` is already there (the bill has 0 decimals) and the
///      stablecoin debt is scaled up by `10 ** (8 - cashDecimals)`.
///
///      Day counts use 360, the bank-discount convention. `secondsPerDay` is the demo clock and is the
///      same knob the price feed uses.
contract BillRepo is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LoanState {
        None,
        Open,
        Repaid,
        Liquidated
    }

    struct Loan {
        address borrower;
        address lender;
        uint256 collateral; // whole bills
        uint256 holdId;
        uint256 principal; // stablecoin units
        uint256 accrued; // interest already crystallised by a part repayment, stablecoin units
        uint256 accruedDay; // the day index `accrued` runs up to
        uint256 repoRateBps;
        uint256 openedAt;
        uint256 termDays;
        uint256 openPrice8; // the bill's price when the loan opened
        LoanState state;
    }

    struct Position {
        LoanState state;
        int256 rawPrice;
        uint256 updatedAt;
        bool priceUsable;
        uint256 value8;
        uint256 principal;
        uint256 interest;
        uint256 debt;
        uint256 ltvBps;
        uint256 liquidationPrice8;
        uint256 termRemainingDays;
        bool termElapsed;
    }

    uint256 public constant BPS = 10_000;
    uint256 private constant YEAR_BPS = 360 * 10_000;
    uint256 public constant MAX_REPO_RATE_BPS = 5_000;
    /// @dev ATS's default partition.
    bytes32 public constant PARTITION = bytes32(uint256(1));

    IAtsHold public immutable bill;
    address public immutable stablecoinProxy;
    IERC20 public immutable cash;
    AggregatorV3Interface public immutable feed;
    address public immutable lender;
    uint256 public immutable haircutBps;
    uint256 public immutable liquidationThresholdBps;
    uint256 public immutable maxPriceAge;
    /// @notice Real seconds a hold must outlast the loan term by, so the borrower's own way out
    ///         (`reclaimHoldByPartition`, open once the hold expires) never opens while a loan is live.
    uint256 public immutable graceSeconds;
    uint256 public immutable secondsPerDay;
    uint8 public immutable feedDecimals;
    uint256 public immutable cashScale;

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) private _loans;
    mapping(address => mapping(uint256 => bool)) public holdInUse;

    event LoanOpened(
        uint256 indexed loanId, address indexed borrower, uint256 collateral, uint256 holdId, uint256 principal
    );
    event LoanRepaid(uint256 indexed loanId, uint256 paid);
    event LoanToppedUp(uint256 indexed loanId, uint256 amount, uint256 principalAfter);
    event LoanLiquidated(uint256 indexed loanId, bool byTerm);

    error NotLender(address caller);
    error NotBorrower(address caller);
    error UnknownLoan(uint256 loanId);
    error WrongState(LoanState state);
    error ZeroAmount();
    error BadParameters();
    error AmountTooLarge(uint256 amount, uint256 maximum);
    error HoldEscrowMismatch(address expected, address actual);
    error HoldDestinationMismatch(address expected, address actual);
    error HoldTooSmall(uint256 held, uint256 required);
    error HoldExpiresTooSoon(uint256 expiry, uint256 required);
    error HoldAlreadyUsed(address borrower, uint256 holdId);
    error ExceedsCapacity(uint256 requested8, uint256 capacity8);
    error PriceInvalid(int256 answer);
    error PriceStale(uint256 updatedAt, uint256 maxAge);
    error NotLiquidatable(uint256 ltvBps, uint256 thresholdBps);
    error ReleaseFailed();
    error ExecuteFailed();

    constructor(
        address bill_,
        address stablecoinProxy_,
        address cash_,
        address feed_,
        uint256 haircutBps_,
        uint256 liquidationThresholdBps_,
        uint256 maxPriceAge_,
        uint256 graceSeconds_,
        uint256 secondsPerDay_
    ) {
        // The threshold sits above the borrowing limit (1 - haircut), or a loan could open already liquidatable.
        if (
            bill_ == address(0) || cash_ == address(0) || feed_ == address(0) || secondsPerDay_ == 0
                || haircutBps_ >= BPS || liquidationThresholdBps_ < BPS - haircutBps_ || liquidationThresholdBps_ > BPS
        ) revert BadParameters();
        uint8 cashDecimals = IERC20Metadata(cash_).decimals();
        uint8 feedDecimals_ = AggregatorV3Interface(feed_).decimals();
        // Whole bills only, and the scales must be expressible in 8 decimals: a mistake here silently lends
        // orders of magnitude more than the collateral covers.
        if (IERC20Metadata(bill_).decimals() != 0 || cashDecimals > 8 || feedDecimals_ > 18) revert BadParameters();

        bill = IAtsHold(bill_);
        stablecoinProxy = stablecoinProxy_;
        cash = IERC20(cash_);
        feed = AggregatorV3Interface(feed_);
        lender = msg.sender;
        haircutBps = haircutBps_;
        liquidationThresholdBps = liquidationThresholdBps_;
        maxPriceAge = maxPriceAge_;
        graceSeconds = graceSeconds_;
        secondsPerDay = secondsPerDay_;
        feedDecimals = feedDecimals_;
        cashScale = 10 ** (8 - cashDecimals);
    }

    // ------------------------------------------------------------------ views

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    /// @notice The price per bill in 8 decimals, or the reason it cannot be trusted. Reverts on a zero or
    ///         negative answer and on a stale one.
    function price8() public view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        return _usablePrice(answer, updatedAt);
    }

    /// @notice Every pre-flight check `openLoan` makes except the lender check and the cash movement.
    ///         Reverts with the same error `openLoan` would, so a page can show the refusal before it is sent.
    function validateOpen(
        address borrower,
        uint256 holdId,
        uint256 collateral,
        uint256 principalUnits,
        uint256 termDays
    ) public view returns (uint256 price, uint256 value8, uint256 capacity8) {
        if (collateral == 0 || principalUnits == 0 || termDays == 0 || borrower == address(0)) {
            revert ZeroAmount();
        }
        // The price comes first: a price nobody can stand behind refuses new credit whatever else is true.
        price = price8();
        if (holdInUse[borrower][holdId]) revert HoldAlreadyUsed(borrower, holdId);
        _verifyHold(borrower, holdId, collateral, termDays);

        value8 = price * collateral;
        capacity8 = (value8 * (BPS - haircutBps)) / BPS;
        uint256 requested8 = principalUnits * cashScale;
        if (requested8 > capacity8) revert ExceedsCapacity(requested8, capacity8);
    }

    /// @notice Principal, interest and total debt in stablecoin units, as of now.
    function debtOf(uint256 loanId) public view returns (uint256 principal, uint256 interest, uint256 debt) {
        Loan storage l = _loans[loanId];
        principal = l.principal;
        interest = l.accrued + _interestSince(l);
        debt = principal + interest;
    }

    /// @notice The loan's state in one call. Never reverts because of the feed: a feed that cannot be read
    ///         comes back as `priceUsable == false`, not as a price.
    function position(uint256 loanId) external view returns (Position memory p) {
        Loan storage l = _loans[loanId];
        p.state = l.state;
        if (l.state == LoanState.None) return p;
        (p.principal, p.interest, p.debt) = debtOf(loanId);
        p.termElapsed = block.timestamp >= l.openedAt + l.termDays * secondsPerDay;
        p.termRemainingDays = p.termElapsed ? 0 : _daysCeil(l.openedAt + l.termDays * secondsPerDay - block.timestamp);

        try feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            p.rawPrice = answer;
            p.updatedAt = updatedAt;
            p.priceUsable = answer > 0 && updatedAt <= block.timestamp && block.timestamp - updatedAt <= maxPriceAge;
            if (answer > 0) {
                uint256 normalised = _normalise(uint256(answer));
                p.value8 = normalised * l.collateral;
                p.liquidationPrice8 = (p.debt * cashScale * BPS) / (liquidationThresholdBps * l.collateral);
                // Rounded up for display, so a position never reads healthier than it is; the liquidation test
                // below compares exactly and does not use this figure.
                p.ltvBps = p.value8 == 0 ? type(uint256).max : _ceilDiv(p.debt * cashScale * BPS, p.value8);
            }
        } catch { }
    }

    // ------------------------------------------------------------- the loan

    /// @notice Lender only: it is their cash that moves. One transaction: read the hold, check it, then move
    ///         the cash. There is no moment at which the loan exists unsecured.
    function openLoan(
        address borrower,
        uint256 holdId,
        uint256 collateral,
        uint256 principalUnits,
        uint256 repoRateBps,
        uint256 termDays
    ) external nonReentrant returns (uint256 loanId) {
        if (msg.sender != lender) revert NotLender(msg.sender);
        if (repoRateBps > MAX_REPO_RATE_BPS) revert BadParameters();
        (uint256 price,,) = validateOpen(borrower, holdId, collateral, principalUnits, termDays);

        loanId = nextLoanId++;
        holdInUse[borrower][holdId] = true;
        _loans[loanId] = Loan({
            borrower: borrower,
            lender: msg.sender,
            collateral: collateral,
            holdId: holdId,
            principal: principalUnits,
            accrued: 0,
            accruedDay: 0,
            repoRateBps: repoRateBps,
            openedAt: block.timestamp,
            termDays: termDays,
            openPrice8: price,
            state: LoanState.Open
        });

        cash.safeTransferFrom(msg.sender, borrower, principalUnits);
        emit LoanOpened(loanId, borrower, collateral, holdId, principalUnits);
    }

    /// @notice Borrower only. Pulls principal plus interest, pushes it to the lender and releases the hold.
    ///         Either both legs happen or neither does.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage l = _openLoan(loanId);
        if (msg.sender != l.borrower) revert NotBorrower(msg.sender);
        (,, uint256 debt) = debtOf(loanId);
        l.state = LoanState.Repaid;

        cash.safeTransferFrom(l.borrower, l.lender, debt);
        bool released = bill.releaseHoldByPartition(
            IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: l.borrower, holdId: l.holdId }), l.collateral
        );
        if (!released) revert ReleaseFailed();
        emit LoanRepaid(loanId, debt);
    }

    /// @notice Borrower only. Repays part of the principal, which lowers the debt and the LTV. Refused on a
    ///         price nobody can stand behind, like any new credit decision.
    function topUp(uint256 loanId, uint256 amountUnits) external nonReentrant {
        Loan storage l = _openLoan(loanId);
        if (msg.sender != l.borrower) revert NotBorrower(msg.sender);
        if (amountUnits == 0) revert ZeroAmount();
        if (amountUnits > l.principal) revert AmountTooLarge(amountUnits, l.principal);
        price8();

        // Interest earned so far is kept; from here it accrues on the smaller principal.
        l.accrued += _interestSince(l);
        l.accruedDay = _dayIndex(l);
        l.principal -= amountUnits;

        cash.safeTransferFrom(l.borrower, l.lender, amountUnits);
        emit LoanToppedUp(loanId, amountUnits, l.principal);
    }

    /// @notice Permissionless: both triggers are objective and on-chain. After the term it reads NO price, so it
    ///         works whatever the feed is doing; before the term it needs a trusted price at or above the
    ///         liquidation threshold. The only destination is the one the borrower fixed at pledge time.
    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage l = _openLoan(loanId);
        bool byTerm = block.timestamp >= l.openedAt + l.termDays * secondsPerDay;
        if (!byTerm) {
            uint256 value8 = price8() * l.collateral;
            (,, uint256 debt) = debtOf(loanId);
            uint256 debt8 = debt * cashScale;
            if (debt8 * BPS < liquidationThresholdBps * value8) {
                revert NotLiquidatable(_ceilDiv(debt8 * BPS, value8), liquidationThresholdBps);
            }
        }
        l.state = LoanState.Liquidated;

        (bool ok,) = bill.executeHoldByPartition(
            IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: l.borrower, holdId: l.holdId }),
            l.lender,
            l.collateral
        );
        if (!ok) revert ExecuteFailed();
        emit LoanLiquidated(loanId, byTerm);
    }

    // ------------------------------------------------------------- internals

    function _openLoan(uint256 loanId) private view returns (Loan storage l) {
        l = _loans[loanId];
        if (l.state == LoanState.None) revert UnknownLoan(loanId);
        if (l.state != LoanState.Open) revert WrongState(l.state);
    }

    /// @dev Reads the hold back from the bill. Nothing here trusts what the caller says about it.
    function _verifyHold(address borrower, uint256 holdId, uint256 collateral, uint256 termDays) private view {
        (uint256 amount, uint256 expiry, address escrow, address destination,,,) = bill.getHoldForByPartition(
            IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: borrower, holdId: holdId })
        );
        if (escrow != address(this)) revert HoldEscrowMismatch(address(this), escrow);
        if (destination != lender) revert HoldDestinationMismatch(lender, destination);
        if (amount < collateral) revert HoldTooSmall(amount, collateral);
        uint256 required = block.timestamp + termDays * secondsPerDay + graceSeconds;
        if (expiry < required) revert HoldExpiresTooSoon(expiry, required);
    }

    function _usablePrice(int256 answer, uint256 updatedAt) private view returns (uint256) {
        if (answer <= 0) revert PriceInvalid(answer);
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) {
            revert PriceStale(updatedAt, maxPriceAge);
        }
        return _normalise(uint256(answer));
    }

    function _normalise(uint256 answer) private view returns (uint256) {
        if (feedDecimals == 8) return answer;
        if (feedDecimals < 8) return answer * 10 ** (8 - feedDecimals);
        return answer / 10 ** (feedDecimals - 8);
    }

    /// @dev Whole demo days elapsed, capped at the term: interest stops accruing when the term ends.
    function _dayIndex(Loan storage l) private view returns (uint256) {
        uint256 elapsedDays = (block.timestamp - l.openedAt) / secondsPerDay;
        return elapsedDays > l.termDays ? l.termDays : elapsedDays;
    }

    function _interestSince(Loan storage l) private view returns (uint256) {
        if (l.state != LoanState.Open) return 0;
        return (l.principal * l.repoRateBps * (_dayIndex(l) - l.accruedDay)) / YEAR_BPS;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function _daysCeil(uint256 seconds_) private view returns (uint256) {
        return (seconds_ + secondsPerDay - 1) / secondsPerDay;
    }
}
