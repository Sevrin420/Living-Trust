// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pharaoh V3 Voter — voting and batch fee claiming
interface IVoter {
    /// @notice Cast votes for pools this epoch
    /// @param user     The address whose xPHAR voting power is used (vault is the user)
    /// @param _pools   Array of pool addresses to vote for
    /// @param _weights Proportional weights (need not sum to any specific number)
    function vote(
        address user,
        address[] calldata _pools,
        uint256[] calldata _weights
    ) external;

    /// @notice Claim trading fees from a set of FeeDistributors
    /// @param owner            The address whose fee rewards are being claimed (vault)
    /// @param _feeDistributors FeeDistributor contracts to claim from
    /// @param _tokens          Per-distributor list of reward token addresses to claim
    function claimIncentives(
        address owner,
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external;

    /// @notice Returns the FeeDistributor for a given gauge
    function feeDistributorForGauge(address gauge) external view returns (address);

    /// @notice Returns all pools the user voted for in a given period
    function getAllUserVotedPoolsPerPeriod(
        address user,
        uint256 period
    ) external view returns (address[] memory);

    /// @notice Current epoch period
    function getPeriod() external view returns (uint256);
}
