// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { OfficerBoard } from "../contracts/OfficerBoard.sol";

/// @notice Stands in for the security token: a flag only the board may set, and a call that refuses.
contract MockToken {
    error KycIsNotGranted();

    address public immutable board;
    bool public frozen;

    error AccountHasNoRole(address account);

    constructor(address board_) {
        board = board_;
    }

    function setAddressFrozen(bool status) external {
        if (msg.sender != board) revert AccountHasNoRole(msg.sender);
        frozen = status;
    }

    function refuse() external pure {
        revert KycIsNotGranted();
    }

    function refuseWithoutReason() external pure {
        assembly {
            revert(0, 0)
        }
    }
}

contract OfficerBoardTest is Test {
    OfficerBoard private board;
    MockToken private token;

    address private officer1 = makeAddr("officer1");
    address private officer2 = makeAddr("officer2");
    address private officer3 = makeAddr("officer3");
    address private outsider = makeAddr("outsider");

    function setUp() public {
        board = new OfficerBoard([officer1, officer2, officer3]);
        token = new MockToken(address(board));
    }

    function freezeCall() private pure returns (bytes memory) {
        return abi.encodeCall(MockToken.setAddressFrozen, (true));
    }

    function test_twoOfficersCarryTheOrder() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());
        assertFalse(token.frozen(), "one officer must not be enough");

        vm.prank(officer2);
        board.approve(id);

        assertTrue(token.frozen());
        (,,,, uint8 approvals, bool executed,) = board.getProposal(id);
        assertEq(approvals, 2);
        assertTrue(executed);
    }

    function test_oneOfficerCannotActAlone() public {
        // Directly on the token: the board holds the role, the officer does not.
        vm.prank(officer1);
        vm.expectRevert(abi.encodeWithSelector(MockToken.AccountHasNoRole.selector, officer1));
        token.setAddressFrozen(true);

        // Through the board: a proposal with one approval executes nothing.
        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());
        (,,,, uint8 approvals, bool executed,) = board.getProposal(id);
        assertEq(approvals, 1);
        assertFalse(executed);
        assertFalse(token.frozen());
    }

    function test_sameOfficerCannotApproveTwice() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());

        vm.prank(officer1);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.AlreadyApproved.selector, id, officer1));
        board.approve(id);

        assertFalse(token.frozen());
    }

    function test_outsiderCanNeitherProposeNorApprove() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.NotOfficer.selector, outsider));
        board.propose(address(token), freezeCall());

        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.NotOfficer.selector, outsider));
        board.approve(id);
    }

    function test_onlyTheProposerCanCancel() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());

        vm.prank(officer2);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.NotProposer.selector, officer2, officer1));
        board.cancel(id);

        vm.prank(officer1);
        board.cancel(id);

        vm.prank(officer2);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.AlreadySettled.selector, id));
        board.approve(id);
    }

    function test_expiredProposalCannotBeApproved() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), freezeCall());
        (,, uint256 expiresAt,,,,) = board.getProposal(id);

        vm.warp(expiresAt + 1);
        vm.prank(officer2);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.ProposalExpired.selector, id, expiresAt));
        board.approve(id);

        assertFalse(token.frozen());
    }

    function test_targetsRefusalRevertsTheApprovalAndLeavesItPending() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), abi.encodeCall(MockToken.refuse, ()));

        vm.prank(officer2);
        vm.expectRevert(MockToken.KycIsNotGranted.selector);
        board.approve(id);

        // The approval reverted as a whole, so the proposal is exactly as it was.
        (,,,, uint8 approvals, bool executed,) = board.getProposal(id);
        assertEq(approvals, 1);
        assertFalse(executed);
        assertFalse(board.approvedBy(id, officer2));
    }

    function test_targetWithoutAReasonStillRefuses() public {
        vm.prank(officer1);
        uint256 id = board.propose(address(token), abi.encodeCall(MockToken.refuseWithoutReason, ()));

        vm.prank(officer2);
        vm.expectRevert(OfficerBoard.CallReverted.selector);
        board.approve(id);
    }

    function test_officersMustBeThreeDistinctAddresses() public {
        vm.expectRevert(OfficerBoard.OfficersNotDistinct.selector);
        new OfficerBoard([officer1, officer2, officer1]);

        vm.expectRevert(OfficerBoard.OfficersNotDistinct.selector);
        new OfficerBoard([officer1, address(0), officer3]);
    }

    function test_unknownProposalIsNotAPendingOne() public {
        vm.prank(officer1);
        vm.expectRevert(abi.encodeWithSelector(OfficerBoard.UnknownProposal.selector, uint256(42)));
        board.approve(42);
    }
}
