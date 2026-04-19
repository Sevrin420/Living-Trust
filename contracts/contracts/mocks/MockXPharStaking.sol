// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock xPHAR auto-voting gauge for testing.
///         Tracks staked balances and lets tests set arbitrary earned amounts.
contract MockXPharStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable xpharToken;   // staked asset
    IERC20 public immutable reward;       // reward token (e.g. PHAR)

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _earned;

    constructor(address _xphar, address _reward) {
        xpharToken = IERC20(_xphar);
        reward = IERC20(_reward);
    }

    function rewardToken() external view returns (address) {
        return address(reward);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function earned(address account, address) external view returns (uint256) {
        return _earned[account];
    }

    function deposit(uint256 amount) external {
        xpharToken.safeTransferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        _balances[msg.sender] -= amount;
        xpharToken.safeTransfer(msg.sender, amount);
    }

    function getReward(address account, address[] calldata) external {
        uint256 amount = _earned[account];
        _earned[account] = 0;
        if (amount > 0) reward.safeTransfer(account, amount);
    }

    /// @dev Test helper — fund this contract with reward tokens and set earned for an account.
    function setEarned(address account, uint256 amount) external {
        _earned[account] = amount;
    }
}
