// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @notice A 2-of-3 approval gate that holds a token's compliance roles so that no single officer does.
/// @dev The EVM counterpart of a Hedera 2-of-3 threshold key. The board is granted the security token's
///      KYC, freeze, controller and pause roles at deployment; officers hold none of them. An officer
///      proposes a call, a second officer approves it, and the board makes the call in that same
///      transaction. One officer, or the same officer twice, gets nowhere.
///
///      The board forwards an arbitrary call to an arbitrary target on purpose: one contract then covers
///      freeze, unfreeze, redeem, revoke and pause without knowing what any of them mean. The desk only
///      ever proposes calls to the token it deployed, and its routes refuse any other target.
///
///      A target that reverts reverts the approval with it, so the token's own error -- `KycIsNotGranted`,
///      `AccountIsBlocked` -- is what the caller sees, and the proposal stays pending for another try.
contract OfficerBoard {
    struct Proposal {
        address target;
        bytes data;
        uint256 expiresAt;
        address proposer;
        uint8 approvals;
        bool executed;
        bool cancelled;
    }

    uint8 public constant APPROVALS_REQUIRED = 2;
    /// @notice How long a proposal can be approved for. Short on purpose: nothing is left hanging.
    uint256 public constant PROPOSAL_LIFETIME = 10 minutes;

    address[3] private _officers;
    uint256 public nextProposalId = 1;

    mapping(uint256 => Proposal) private _proposals;
    /// @notice Which officers have approved a proposal, so the desk can show who is still missing.
    mapping(uint256 => mapping(address => bool)) public approvedBy;

    event Proposed(uint256 indexed id, address indexed proposer, address target, bytes data, uint256 expiresAt);
    event Approved(uint256 indexed id, address indexed officer, uint8 approvals);
    event Executed(uint256 indexed id, address indexed target);
    event Cancelled(uint256 indexed id);

    error NotOfficer(address caller);
    error NotProposer(address caller, address proposer);
    error UnknownProposal(uint256 id);
    error AlreadySettled(uint256 id);
    error AlreadyApproved(uint256 id, address officer);
    error ProposalExpired(uint256 id, uint256 expiresAt);
    error OfficersNotDistinct();
    error CallReverted();

    /// @param officers_ Three distinct, non-zero officer addresses, fixed for the life of the board.
    constructor(address[3] memory officers_) {
        for (uint256 i = 0; i < 3; ++i) {
            if (officers_[i] == address(0)) revert OfficersNotDistinct();
            for (uint256 j = i + 1; j < 3; ++j) {
                if (officers_[i] == officers_[j]) revert OfficersNotDistinct();
            }
        }
        _officers = officers_;
    }

    modifier onlyOfficer() {
        if (!isOfficer(msg.sender)) revert NotOfficer(msg.sender);
        _;
    }

    /// @notice Records a call for a second officer to approve. The proposer's own approval is the first.
    function propose(address target, bytes calldata data) external onlyOfficer returns (uint256 id) {
        id = nextProposalId++;
        uint256 expiresAt = block.timestamp + PROPOSAL_LIFETIME;
        _proposals[id] = Proposal({
            target: target,
            data: data,
            expiresAt: expiresAt,
            proposer: msg.sender,
            approvals: 1,
            executed: false,
            cancelled: false
        });
        approvedBy[id][msg.sender] = true;
        emit Proposed(id, msg.sender, target, data, expiresAt);
        emit Approved(id, msg.sender, 1);
    }

    /// @notice The second distinct officer's approval, which makes the call.
    function approve(uint256 id) external onlyOfficer {
        Proposal storage proposal = _pending(id);
        if (approvedBy[id][msg.sender]) revert AlreadyApproved(id, msg.sender);

        approvedBy[id][msg.sender] = true;
        uint8 approvals = proposal.approvals + 1;
        proposal.approvals = approvals;
        emit Approved(id, msg.sender, approvals);

        if (approvals < APPROVALS_REQUIRED) return;

        // Set before the call: a target that re-enters finds the proposal settled. A target that reverts
        // reverts this whole transaction, so the proposal is left pending exactly as it was.
        proposal.executed = true;
        (bool ok, bytes memory returned) = proposal.target.call(proposal.data);
        if (!ok) {
            if (returned.length == 0) revert CallReverted();
            assembly {
                revert(add(returned, 0x20), mload(returned))
            }
        }
        emit Executed(id, proposal.target);
    }

    /// @notice Withdraws a proposal. Only the officer who proposed it can.
    function cancel(uint256 id) external {
        Proposal storage proposal = _pending(id);
        if (msg.sender != proposal.proposer) revert NotProposer(msg.sender, proposal.proposer);
        proposal.cancelled = true;
        emit Cancelled(id);
    }

    function isOfficer(address account) public view returns (bool) {
        return account == _officers[0] || account == _officers[1] || account == _officers[2];
    }

    function getOfficers() external view returns (address[3] memory) {
        return _officers;
    }

    /// @notice One proposal, as the desk shows it.
    function getProposal(uint256 id)
        external
        view
        returns (
            address target,
            bytes memory data,
            uint256 expiresAt,
            address proposer,
            uint8 approvals,
            bool executed,
            bool cancelled
        )
    {
        Proposal storage proposal = _proposals[id];
        if (proposal.proposer == address(0)) revert UnknownProposal(id);
        return (
            proposal.target,
            proposal.data,
            proposal.expiresAt,
            proposal.proposer,
            proposal.approvals,
            proposal.executed,
            proposal.cancelled
        );
    }

    /// @dev A proposal that exists, has not executed or been withdrawn, and has not run out of time.
    function _pending(uint256 id) private view returns (Proposal storage proposal) {
        proposal = _proposals[id];
        if (proposal.proposer == address(0)) revert UnknownProposal(id);
        if (proposal.executed || proposal.cancelled) revert AlreadySettled(id);
        if (block.timestamp > proposal.expiresAt) revert ProposalExpired(id, proposal.expiresAt);
    }
}
