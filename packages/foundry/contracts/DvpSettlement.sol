// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IAtsHold } from "./interfaces/IAtsHold.sol";
import { IStablecoinHold } from "./interfaces/IStablecoinHold.sol";

/// @notice Delivery-versus-payment settlement for an ATS security against a Stablecoin Studio stablecoin,
///         with neither leg ever leaving its owner's account until both move at once.
/// @dev The contract takes no custody and holds no role on either token. Each side pledges its leg with a
///      hold naming this contract as escrow and the counterparty as destination; this contract can then do
///      exactly two things with that hold -- execute it to the destination the pledging party fixed, or
///      release it back to them. It cannot redirect either leg, and it cannot touch anything unpledged.
///
///      Both pledges are read back from their token and checked. Nothing here trusts what a caller says
///      about a hold, which is why recording one needs no permission: the party whose units they are has
///      already committed them by creating the hold.
///
///      The two tokens speak different types for the same idea -- ATS amounts are `uint256`, Stablecoin
///      Studio amounts are `int64` -- so every crossing is a checked conversion.
contract DvpSettlement {
    enum State {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct Trade {
        address seller;
        address buyer;
        uint256 quantity; // security units
        uint256 price; // cash units
        /// @dev 0 means "as soon as both legs are pledged".
        uint256 notBefore;
        /// @dev 0 means the leg is not pledged. Both tokens number holds from 1.
        uint256 securityHoldId;
        uint256 cashHoldId;
        State state;
    }

    /// @dev ATS's default partition.
    bytes32 public constant PARTITION = bytes32(uint256(1));
    int64 private constant INT64_MAX = type(int64).max;

    IAtsHold public immutable security;
    /// @notice The stablecoin *proxy*: holds live there, while the units themselves are HTS.
    IStablecoinHold public immutable cash;
    /// @notice Seconds a pledge must outlast its trade's settlement time by, so that the pledging party's
    ///         own way out -- reclaiming once the hold expires -- never opens while the trade is live.
    uint256 public immutable graceSeconds;

    uint256 public nextTradeId = 1;
    mapping(uint256 => Trade) private _trades;
    /// @notice A hold already recorded against a trade, so one pledge cannot back two trades.
    mapping(address => mapping(uint256 => bool)) public securityHoldUsed;
    mapping(address => mapping(uint256 => bool)) public cashHoldUsed;

    event TradeProposed(
        uint256 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        uint256 quantity,
        uint256 price,
        uint256 notBefore
    );
    event SecurityPledged(uint256 indexed tradeId, uint256 holdId);
    event CashPledged(uint256 indexed tradeId, uint256 holdId);
    event TradeSettled(uint256 indexed tradeId, uint256 quantity, uint256 price);
    event TradeCancelled(uint256 indexed tradeId, address indexed by);

    error BadParameters();
    error UnknownTrade(uint256 tradeId);
    error WrongState(State state);
    error NotAParty(address caller);
    error AlreadyPledged(uint256 tradeId);
    error SecurityNotPledged(uint256 tradeId);
    error CashNotPledged(uint256 tradeId);
    error TooEarly(uint256 notBefore, uint256 nowTime);
    error HoldEscrowMismatch(address expected, address actual);
    error HoldDestinationMismatch(address expected, address actual);
    error HoldTooSmall(uint256 held, uint256 required);
    error HoldExpiresTooSoon(uint256 expiry, uint256 required);
    error HoldAlreadyUsed(address pledger, uint256 holdId);
    error AmountTooLarge(uint256 amount);
    error ExecuteFailed();
    error ReleaseFailed();

    constructor(address security_, address cash_, uint256 graceSeconds_) {
        if (security_ == address(0) || cash_ == address(0)) revert BadParameters();
        security = IAtsHold(security_);
        cash = IStablecoinHold(cash_);
        graceSeconds = graceSeconds_;
    }

    // ------------------------------------------------------------------ views

    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return _trades[tradeId];
    }

    /// @notice Whether `settle` would be accepted right now, without sending anything.
    function isSettleable(uint256 tradeId) external view returns (bool) {
        Trade storage t = _trades[tradeId];
        return t.state == State.Open && t.securityHoldId != 0 && t.cashHoldId != 0 && block.timestamp >= t.notBefore;
    }

    // ----------------------------------------------------------------- trades

    /// @notice The seller records the terms. Nothing moves and nothing is pledged yet.
    function propose(address buyer, uint256 quantity, uint256 price, uint256 notBefore)
        external
        returns (uint256 tradeId)
    {
        if (buyer == address(0) || buyer == msg.sender || quantity == 0 || price == 0) revert BadParameters();
        // A settlement time in the past would be no time at all; 0 means "as soon as both legs are in".
        if (notBefore != 0 && notBefore <= block.timestamp) revert BadParameters();
        _toInt64(price);

        tradeId = nextTradeId++;
        _trades[tradeId] = Trade({
            seller: msg.sender,
            buyer: buyer,
            quantity: quantity,
            price: price,
            notBefore: notBefore,
            securityHoldId: 0,
            cashHoldId: 0,
            state: State.Open
        });
        emit TradeProposed(tradeId, msg.sender, buyer, quantity, price, notBefore);
    }

    /// @notice Records the seller's pledge of the security. Permissionless: the hold is the proof, and it is
    ///         read back from the token here rather than taken on trust.
    function lockSecurity(uint256 tradeId, uint256 holdId) external {
        Trade storage t = _openTrade(tradeId);
        if (t.securityHoldId != 0) revert AlreadyPledged(tradeId);
        if (securityHoldUsed[t.seller][holdId]) revert HoldAlreadyUsed(t.seller, holdId);

        (uint256 amount, uint256 expiry, address escrow, address destination,,,) = security.getHoldForByPartition(
            IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: t.seller, holdId: holdId })
        );
        _checkHold(escrow, destination, t.buyer, amount, t.quantity, expiry, t.notBefore);

        securityHoldUsed[t.seller][holdId] = true;
        t.securityHoldId = holdId;
        emit SecurityPledged(tradeId, holdId);
    }

    /// @notice Records the buyer's pledge of the cash, on the same terms.
    function lockCash(uint256 tradeId, uint256 holdId) external {
        Trade storage t = _openTrade(tradeId);
        if (t.cashHoldId != 0) revert AlreadyPledged(tradeId);
        if (cashHoldUsed[t.buyer][holdId]) revert HoldAlreadyUsed(t.buyer, holdId);

        (int64 amount, uint256 expiry, address escrow, address destination,,) =
            cash.getHoldFor(IStablecoinHold.HoldIdentifier({ tokenHolder: t.buyer, holdId: holdId }));
        // A negative held amount is not a shortfall this contract should try to interpret.
        if (amount < 0) revert HoldTooSmall(0, t.price);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 pledged = uint256(uint64(amount)); // non-negative, checked on the line above
        _checkHold(escrow, destination, t.seller, pledged, t.price, expiry, t.notBefore);

        cashHoldUsed[t.buyer][holdId] = true;
        t.cashHoldId = holdId;
        emit CashPledged(tradeId, holdId);
    }

    /// @notice Executes both holds in this one call. Anyone may press it: the terms and both destinations
    ///         were fixed by the parties themselves. If either leg will not land, the whole call reverts
    ///         with that token's own error and both pledges are still in place.
    function settle(uint256 tradeId) external {
        Trade storage t = _openTrade(tradeId);
        if (t.securityHoldId == 0) revert SecurityNotPledged(tradeId);
        if (t.cashHoldId == 0) revert CashNotPledged(tradeId);
        if (block.timestamp < t.notBefore) revert TooEarly(t.notBefore, block.timestamp);

        // Settled before either token is called, so a token that calls back finds a finished trade.
        t.state = State.Settled;

        (bool delivered,) = security.executeHoldByPartition(
            IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: t.seller, holdId: t.securityHoldId }),
            t.buyer,
            t.quantity
        );
        if (!delivered) revert ExecuteFailed();

        bool paid = cash.executeHold(
            IStablecoinHold.HoldIdentifier({ tokenHolder: t.buyer, holdId: t.cashHoldId }), t.seller, _toInt64(t.price)
        );
        if (!paid) revert ExecuteFailed();

        emit TradeSettled(tradeId, t.quantity, t.price);
    }

    /// @notice Either party, before settlement. Releases whichever legs are pledged, each back to the party
    ///         that pledged it.
    function cancel(uint256 tradeId) external {
        Trade storage t = _openTrade(tradeId);
        if (msg.sender != t.seller && msg.sender != t.buyer) revert NotAParty(msg.sender);

        t.state = State.Cancelled;

        if (t.securityHoldId != 0) {
            bool released = security.releaseHoldByPartition(
                IAtsHold.HoldIdentifier({ partition: PARTITION, tokenHolder: t.seller, holdId: t.securityHoldId }),
                t.quantity
            );
            if (!released) revert ReleaseFailed();
        }
        if (t.cashHoldId != 0) {
            bool released = cash.releaseHold(
                IStablecoinHold.HoldIdentifier({ tokenHolder: t.buyer, holdId: t.cashHoldId }), _toInt64(t.price)
            );
            if (!released) revert ReleaseFailed();
        }
        emit TradeCancelled(tradeId, msg.sender);
    }

    // -------------------------------------------------------------- internals

    function _openTrade(uint256 tradeId) private view returns (Trade storage t) {
        t = _trades[tradeId];
        if (t.state == State.None) revert UnknownTrade(tradeId);
        if (t.state != State.Open) revert WrongState(t.state);
    }

    /// @dev The four things that make a hold a pledge this trade can rely on. `required` is the settlement
    ///      time the hold has to outlast, which for an immediate trade is now.
    function _checkHold(
        address escrow,
        address destination,
        address counterparty,
        uint256 amount,
        uint256 needed,
        uint256 expiry,
        uint256 notBefore
    ) private view {
        if (escrow != address(this)) revert HoldEscrowMismatch(address(this), escrow);
        if (destination != counterparty) revert HoldDestinationMismatch(counterparty, destination);
        if (amount < needed) revert HoldTooSmall(amount, needed);
        uint256 settleBy = notBefore > block.timestamp ? notBefore : block.timestamp;
        uint256 required = settleBy + graceSeconds;
        if (expiry < required) revert HoldExpiresTooSoon(expiry, required);
    }

    /// @dev The one place a `uint256` becomes the `int64` the stablecoin speaks. It reverts rather than
    ///      wrapping, so a price too large to express is refused instead of settling for something else.
    function _toInt64(uint256 amount) private pure returns (int64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        if (amount > uint256(uint64(INT64_MAX))) revert AmountTooLarge(amount); // INT64_MAX is positive
        // forge-lint: disable-next-line(unsafe-typecast)
        return int64(uint64(amount)); // in range, checked on the line above
    }
}
