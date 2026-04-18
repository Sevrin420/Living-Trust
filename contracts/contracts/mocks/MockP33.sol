// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock P33 (ERC4626-like xPHAR auto-compounding vault) for testing.
contract MockP33 is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset; // xPHAR
    uint256 private _ratio = 1e18; // xPHAR per share, starts 1:1

    constructor(address xphar) ERC20("Mock P33", "mP33") {
        asset = IERC20(xphar);
    }

    /// @notice Test helper: set the xPHAR-per-share ratio to simulate yield accrual.
    function setRatio(uint256 newRatio) external {
        _ratio = newRatio;
    }

    function ratio() external view returns (uint256) {
        return _ratio;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares * _ratio / 1e18;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return assets * 1e18 / _ratio;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 sharesBurned) {
        sharesBurned = convertToShares(assets);
        if (owner != msg.sender) _spendAllowance(owner, msg.sender, sharesBurned);
        _burn(owner, sharesBurned);
        asset.safeTransfer(receiver, assets);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        assets = convertToAssets(shares);
        if (owner != msg.sender) _spendAllowance(owner, msg.sender, shares);
        _burn(owner, shares);
        asset.safeTransfer(receiver, assets);
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return convertToAssets(balanceOf(owner));
    }

    function previewWithdraw(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    function compound() external {}
    function unlock() external {}
    function isUnlocked() external pure returns (bool) { return true; }
    function isCooldownActive() external pure returns (bool) { return false; }
}
