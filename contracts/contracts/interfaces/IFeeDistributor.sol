// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pharaoh V3 FeeDistributor — per-pool fee accounting for xPHAR voters
interface IFeeDistributor {
    /// @notice Claimable reward for a specific token and owner
    function earned(address token, address owner) external view returns (uint256);

    /// @notice All reward tokens this distributor pays out
    function getRewardTokens() external view returns (address[] memory);

    /// @notice Claim all earned rewards for the caller and send to caller
    function getRewardForOwner(address owner, address[] memory tokens) external;

    /// @notice Claim all earned rewards and send to a specified destination
    ///         (restricted to the Voter contract internally)
    function getRewardForOwnerTo(
        address owner,
        address[] memory tokens,
        address destination
    ) external;
}
