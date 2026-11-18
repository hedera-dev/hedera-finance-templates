// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test double for the stablecoin's HTS token: 2 decimals, like the Studio's.
contract MockCash is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") { }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
