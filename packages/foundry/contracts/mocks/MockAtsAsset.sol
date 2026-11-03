// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice Test double for an ATS security: issuer-role gated `issue`, a supply, and nominal-value terms.
contract MockAtsAsset {
    uint256 public totalSupply;
    uint256 public getNominalValue;
    uint256 public getNominalValueDecimals;
    mapping(address => bool) public isIssuer;
    mapping(address => uint256) public balanceOf;

    error AccountHasNoRole(address account, bytes32 role);

    bytes32 internal constant ROLE_ISSUER = 0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f;

    constructor(uint256 nominalValue, uint256 nominalValueDecimals) {
        getNominalValue = nominalValue;
        getNominalValueDecimals = nominalValueDecimals;
    }

    function grantIssuer(address account) external {
        isIssuer[account] = true;
    }

    function issue(address holder, uint256 amount, bytes calldata) external {
        if (!isIssuer[msg.sender]) revert AccountHasNoRole(msg.sender, ROLE_ISSUER);
        totalSupply += amount;
        balanceOf[holder] += amount;
    }
}
