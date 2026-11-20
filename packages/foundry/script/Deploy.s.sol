//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { OfficerBoard } from "../contracts/OfficerBoard.sol";

/**
 * @notice Deploys an OfficerBoard from the command line, for poking at it with `cast`.
 * @dev The desk does not use this: it deploys the board itself at setup, from this contract's
 *      Foundry artifact, so that the three officer keys it just created are the board's officers.
 *      Set OFFICER_1, OFFICER_2 and OFFICER_3 to use this script instead.
 *
 * Example: yarn deploy
 */
contract DeployScript is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        address[3] memory officers =
            [vm.envAddress("OFFICER_1"), vm.envAddress("OFFICER_2"), vm.envAddress("OFFICER_3")];
        OfficerBoard board = new OfficerBoard(officers);
        deployments.push(Deployment({ name: "OfficerBoard", addr: address(board) }));
    }
}
