// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice Test double for the collateral token: a balance the test sets.
contract MockCollateral {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}
