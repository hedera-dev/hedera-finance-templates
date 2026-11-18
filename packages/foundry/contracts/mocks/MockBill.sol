// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IAtsHold } from "../interfaces/IAtsHold.sol";

/// @notice Test double for an ATS bond, reproducing the hold behaviour the spike observed on testnet:
///         held units leave `balanceOf` but stay in the holder's account, only the escrow may execute or
///         release, the destination cannot be redirected, and the holder may reclaim only after expiry.
contract MockBill {
    struct StoredHold {
        uint256 amount;
        uint256 expirationTimestamp;
        address escrow;
        address to;
        bool exists;
    }

    uint8 public decimals;
    mapping(address => uint256) private _total; // free + held
    mapping(address => uint256) private _held;
    mapping(address => mapping(uint256 => StoredHold)) public holds;
    mapping(address => uint256) public holdCount;

    error IsNotEscrow();
    error InvalidDestinationAddress(address expected, address given);
    error HoldExpired();
    error HoldNotExpired();
    error InsufficientBalance();
    error NoSuchHold();

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function issue(address holder, uint256 amount) external {
        _total[holder] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _total[account] - _held[account];
    }

    function totalOwned(address account) external view returns (uint256) {
        return _total[account];
    }

    function getHeldAmountForByPartition(bytes32, address holder) external view returns (uint256) {
        return _held[holder];
    }

    function createHoldByPartition(bytes32, IAtsHold.Hold calldata hold) external returns (bool, uint256 holdId) {
        if (_total[msg.sender] - _held[msg.sender] < hold.amount) revert InsufficientBalance();
        holdId = ++holdCount[msg.sender];
        holds[msg.sender][holdId] = StoredHold(hold.amount, hold.expirationTimestamp, hold.escrow, hold.to, true);
        _held[msg.sender] += hold.amount;
        return (true, holdId);
    }

    function getHoldForByPartition(IAtsHold.HoldIdentifier calldata id)
        external
        view
        returns (uint256, uint256, address, address, bytes memory, bytes memory, uint8)
    {
        StoredHold memory h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert NoSuchHold();
        return (h.amount, h.expirationTimestamp, h.escrow, h.to, "", "", 0);
    }

    function executeHoldByPartition(IAtsHold.HoldIdentifier calldata id, address to, uint256 amount)
        external
        returns (bool, bytes32)
    {
        StoredHold storage h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert NoSuchHold();
        if (msg.sender != h.escrow) revert IsNotEscrow();
        if (block.timestamp > h.expirationTimestamp) revert HoldExpired();
        if (to != h.to) revert InvalidDestinationAddress(h.to, to);
        h.amount -= amount;
        _held[id.tokenHolder] -= amount;
        _total[id.tokenHolder] -= amount;
        _total[to] += amount;
        return (true, id.partition);
    }

    function releaseHoldByPartition(IAtsHold.HoldIdentifier calldata id, uint256 amount) external returns (bool) {
        StoredHold storage h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert NoSuchHold();
        if (msg.sender != h.escrow) revert IsNotEscrow();
        if (block.timestamp > h.expirationTimestamp) revert HoldExpired();
        h.amount -= amount;
        _held[id.tokenHolder] -= amount;
        return true;
    }

    function reclaimHoldByPartition(IAtsHold.HoldIdentifier calldata id) external returns (bool) {
        StoredHold storage h = holds[id.tokenHolder][id.holdId];
        if (!h.exists) revert NoSuchHold();
        if (block.timestamp <= h.expirationTimestamp) revert HoldNotExpired();
        _held[id.tokenHolder] -= h.amount;
        h.amount = 0;
        return true;
    }
}
