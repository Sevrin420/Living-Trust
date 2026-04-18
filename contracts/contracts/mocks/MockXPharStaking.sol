// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal staking mock for tests. Accumulates a fixed reward per block.
contract MockXPharStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken_;

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _rewards;

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken_ = IERC20(_rewardToken);
    }

    function deposit(uint256 amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        _balances[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function getReward(address account, address[] calldata) external {
        uint256 reward = _rewards[account];
        if (reward > 0) {
            _rewards[account] = 0;
            rewardToken_.safeTransfer(account, reward);
        }
    }

    function earned(address account, address) external view returns (uint256) {
        return _rewards[account];
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function rewardToken() external view returns (address) {
        return address(rewardToken_);
    }

    /// @dev Test helper: credit pending rewards to an account
    function creditReward(address account, uint256 amount) external {
        _rewards[account] += amount;
    }
}
