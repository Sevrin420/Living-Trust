// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockFeeDistributor} from "./MockFeeDistributor.sol";

/// @dev Test mock for Pharaoh Voter — routes claimIncentives to FeeDistributors
contract MockVoter {
    function vote(address, address[] calldata, uint256[] calldata) external {}

    function claimIncentives(
        address owner,
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external {
        for (uint256 i = 0; i < _feeDistributors.length; i++) {
            MockFeeDistributor(_feeDistributors[i]).getRewardForOwner(owner, _tokens[i]);
        }
    }

    function feeDistributorForGauge(address) external pure returns (address) { return address(0); }

    function getAllUserVotedPoolsPerPeriod(address, uint256) external pure returns (address[] memory) {
        return new address[](0);
    }

    function getPeriod() external view returns (uint256) {
        return block.timestamp / 1 weeks;
    }
}
