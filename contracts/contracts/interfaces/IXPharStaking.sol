// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface for Pharaoh Exchange xPHAR staking gauge
/// @dev Matches the Velodrome V2 / Pharaoh gauge interface
interface IXPharStaking {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward(address account, address[] calldata tokens) external;
    function earned(address account, address token) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function rewardToken() external view returns (address);
}
