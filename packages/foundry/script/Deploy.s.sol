//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { DvpSettlement } from "../contracts/DvpSettlement.sol";

/**
 * @notice Deploys a DvpSettlement from the command line, for poking at it with `cast`.
 * @dev The desk does not use this: it deploys the contract itself at setup, from this contract's Foundry
 *      artifact, against the two tokens it has just created. Set SECURITY, CASH and GRACE_SECONDS to use
 *      this script instead.
 *
 * Example: yarn deploy
 */
contract DeployScript is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        DvpSettlement settlement =
            new DvpSettlement(vm.envAddress("SECURITY"), vm.envAddress("CASH"), vm.envUint("GRACE_SECONDS"));
        deployments.push(Deployment({ name: "DvpSettlement", addr: address(settlement) }));
    }
}
