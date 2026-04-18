// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pharaoh V3 VoteModule — where xPHAR is deposited for voting power
interface IVoteModule {
    function deposit(uint256 amount) external;
    function depositAll() external;
    function withdraw(uint256 amount) external;
    function withdrawAll() external;
    function delegate(address delegatee) external;
    function setAdmin(address admin) external;
    function balanceOf(address user) external view returns (uint256);
    function isDelegateFor(address caller, address owner) external view returns (bool);
    function isAdminFor(address caller, address owner) external view returns (bool);
    function getPeriod() external view returns (uint256);
}
