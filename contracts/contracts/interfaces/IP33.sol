// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pharaoh V3 P33 — canonical ERC4626 xPHAR auto-compounding vault.
///         Deposits xPHAR, receives P33 shares. P33 auto-votes each epoch
///         and compounds all voting rewards back into xPHAR, causing the
///         xPHAR-per-share ratio to increase over time.
///
///         P33 is a standard ERC20 — no transfer restrictions.
///         xPHAR IS transfer-restricted; deposit xPHAR into P33 directly
///         first, then send the resulting P33 shares to this vault.
interface IP33 {
    // ── ERC4626 core ──────────────────────────────────────────────────────────

    /// @notice Deposit xPHAR, receive P33 shares sent to `receiver`
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Withdraw exactly `assets` xPHAR; burns shares from `owner`, sends xPHAR to `receiver`
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 sharesBurned);

    /// @notice Redeem exact `shares`; burns from `owner`, sends xPHAR to `receiver`
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    /// @notice How many xPHAR `shares` are currently worth
    function convertToAssets(uint256 shares) external view returns (uint256);

    /// @notice How many P33 shares `assets` xPHAR would buy right now
    function convertToShares(uint256 assets) external view returns (uint256);

    /// @notice Max xPHAR withdrawable for `owner` right now (respects cooldown)
    function maxWithdraw(address owner) external view returns (uint256);

    /// @notice Preview how many shares would be burned for a `withdraw(assets)` call
    function previewWithdraw(uint256 assets) external view returns (uint256);

    // ── ERC20 ─────────────────────────────────────────────────────────────────
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    // ── P33-specific ──────────────────────────────────────────────────────────

    /// @notice Trigger compounding for the current epoch (callable by anyone)
    function compound() external;

    /// @notice Unlock the current period so withdrawals/deposits are allowed
    function unlock() external;

    /// @notice Whether the current period is unlocked for operations
    function isUnlocked() external view returns (bool);

    /// @notice Whether a withdrawal cooldown is currently active
    function isCooldownActive() external view returns (bool);

    /// @notice The xPHAR-per-share ratio (appreciation indicator)
    function ratio() external view returns (uint256);
}
