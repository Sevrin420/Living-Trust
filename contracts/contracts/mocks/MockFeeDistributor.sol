// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Test mock for Pharaoh FeeDistributor
contract MockFeeDistributor {
    using SafeERC20 for IERC20;

    // pending rewards[owner][token]
    mapping(address => mapping(address => uint256)) private _rewards;
    address[] private _rewardTokens;

    constructor(address[] memory tokens) {
        _rewardTokens = tokens;
    }

    /// @dev Test helper: credit pending rewards
    function creditReward(address owner, address token, uint256 amount) external {
        _rewards[owner][token] += amount;
    }

    function earned(address token, address owner) external view returns (uint256) {
        return _rewards[owner][token];
    }

    function getRewardTokens() external view returns (address[] memory) {
        return _rewardTokens;
    }

    function getRewardForOwner(address owner, address[] memory tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 reward = _rewards[owner][tokens[i]];
            if (reward > 0) {
                _rewards[owner][tokens[i]] = 0;
                IERC20(tokens[i]).safeTransfer(owner, reward);
            }
        }
    }

    function getRewardForOwnerTo(address owner, address[] memory tokens, address destination) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 reward = _rewards[owner][tokens[i]];
            if (reward > 0) {
                _rewards[owner][tokens[i]] = 0;
                IERC20(tokens[i]).safeTransfer(destination, reward);
            }
        }
    }
}
