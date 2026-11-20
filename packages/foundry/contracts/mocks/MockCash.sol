// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IStablecoinHold } from "../interfaces/IStablecoinHold.sol";

/// @notice Test double for a Stablecoin Studio stablecoin: 2 decimals like the Studio's, holds in `int64`,
///         and creating one gated by the hold-creator role. Held units leave `balanceOf` and stay with the
///         holder, as on the security; only the escrow may execute or release.
/// @dev The real Studio keeps the hold functions on the proxy and the units on an HTS token at another
///      address. One contract stands in for both here: the settlement contract never reads a balance, only
///      holds, so the split makes no difference to what is being tested.
contract MockCash is ERC20 {
    struct StoredHold {
        int64 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bool exists;
    }

    mapping(address => int64) private _held;
    mapping(address => bool) public holdCreator;
    mapping(address => mapping(uint256 => StoredHold)) public holds;
    mapping(address => uint256) public holdCount;

    error IsNotEscrow();
    error InvalidDestination(address expected, address provided);
    error HoldExpired(uint256 expirationTime);
    error HoldNotExpired(uint256 expirationTime);
    error HoldNotFound(address tokenHolder, uint256 holdId);
    error InsufficientHoldAmount(int64 required, int64 available);
    error NotHoldCreator(address account);

    constructor() ERC20("Mock USD", "mUSD") { }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function grantHoldCreator(address account) external {
        holdCreator[account] = true;
    }

    /// @dev Free balance: what the holder can still move. Held units are excluded, as on the security.
    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account) - uint256(uint64(_held[account]));
    }

    function totalOwned(address account) external view returns (uint256) {
        return super.balanceOf(account);
    }

    function getHeldAmountFor(address tokenHolder) external view returns (int64) {
        return _held[tokenHolder];
    }

    function createHold(IStablecoinHold.Hold calldata hold) external returns (bool, uint256 holdId) {
        if (!holdCreator[msg.sender]) revert NotHoldCreator(msg.sender);
        int64 free = int64(uint64(balanceOf(msg.sender)));
        if (free < hold.amount) revert InsufficientHoldAmount(hold.amount, free);
        holdId = ++holdCount[msg.sender];
        holds[msg.sender][holdId] = StoredHold(hold.amount, hold.expirationTimestamp, hold.escrow, hold.to, true);
        _held[msg.sender] += hold.amount;
        return (true, holdId);
    }

    function getHoldFor(IStablecoinHold.HoldIdentifier calldata id)
        external
        view
        returns (int64, uint256, address, address, bytes memory, bytes memory)
    {
        StoredHold memory h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert HoldNotFound(id.tokenHolder, id.holdId);
        return (h.amount, h.expirationTimestamp, h.escrow, h.to, "", "");
    }

    function executeHold(IStablecoinHold.HoldIdentifier calldata id, address to, int64 amount) external returns (bool) {
        StoredHold storage h = _escrowHold(id);
        if (to != h.to) revert InvalidDestination(h.to, to);
        h.amount -= amount;
        _held[id.tokenHolder] -= amount;
        _transfer(id.tokenHolder, to, uint256(uint64(amount)));
        return true;
    }

    function releaseHold(IStablecoinHold.HoldIdentifier calldata id, int64 amount) external returns (bool) {
        StoredHold storage h = _escrowHold(id);
        h.amount -= amount;
        _held[id.tokenHolder] -= amount;
        return true;
    }

    function reclaimHold(IStablecoinHold.HoldIdentifier calldata id) external returns (bool) {
        StoredHold storage h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert HoldNotFound(id.tokenHolder, id.holdId);
        if (block.timestamp <= h.expirationTimestamp) revert HoldNotExpired(h.expirationTimestamp);
        _held[id.tokenHolder] -= h.amount;
        h.amount = 0;
        return true;
    }

    /// @dev `_transfer` would see the held units as spendable, so the ERC-20 side is told the free balance.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && balanceOf(from) < value) {
            revert ERC20InsufficientBalance(from, balanceOf(from), value);
        }
        super._update(from, to, value);
    }

    function _escrowHold(IStablecoinHold.HoldIdentifier calldata id) private view returns (StoredHold storage h) {
        h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert HoldNotFound(id.tokenHolder, id.holdId);
        if (msg.sender != h.escrow) revert IsNotEscrow();
        if (block.timestamp > h.expirationTimestamp) revert HoldExpired(h.expirationTimestamp);
    }
}
