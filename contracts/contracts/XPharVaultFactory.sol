// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {XPharVault} from "./XPharVault.sol";

/// @notice Factory that deploys and tracks XPharVault instances.
///
/// Each vault stakes xPHAR in Pharaoh's auto-voting gauge, accumulates reward
/// tokens each epoch, and forwards them to a designated beneficiary wallet.
contract XPharVaultFactory {
    // ── Protocol addresses ────────────────────────────────────────────────────
    address public immutable staking;  // auto-voting xPHAR gauge
    address public immutable phar;
    address public immutable xphar;

    // ── Registry ──────────────────────────────────────────────────────────────
    VaultInfo[] public vaults;
    mapping(address => uint256[]) public vaultIdsByController;
    mapping(address => uint256[]) public vaultIdsByCreator;

    struct VaultInfo {
        address vault;
        address creator;
        address controller;
        address yieldReceiver;
        uint256 createdAt;
    }

    // ── Events ────────────────────────────────────────────────────────────────
    event VaultCreated(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed creator,
        address controller,
        address yieldReceiver
    );

    // ── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();

    constructor(address _staking, address _phar, address _xphar) {
        if (_staking == address(0) || _phar == address(0) || _xphar == address(0)) revert ZeroAddress();
        staking = _staking;
        phar = _phar;
        xphar = _xphar;
    }

    /// @notice Deploy a new XPharVault.
    /// @param controller    Trustee wallet — can deposit, harvest, and manage vault settings.
    /// @param yieldReceiver Beneficiary wallet — receives all harvested reward tokens.
    function createVault(
        address controller,
        address yieldReceiver
    ) external returns (address vault) {
        if (controller == address(0) || yieldReceiver == address(0)) revert ZeroAddress();

        XPharVault newVault = new XPharVault(
            staking,
            phar,
            xphar,
            controller,
            yieldReceiver,
            msg.sender
        );

        uint256 vaultId = vaults.length;
        vaults.push(VaultInfo({
            vault: address(newVault),
            creator: msg.sender,
            controller: controller,
            yieldReceiver: yieldReceiver,
            createdAt: block.timestamp
        }));
        vaultIdsByController[controller].push(vaultId);
        vaultIdsByCreator[msg.sender].push(vaultId);

        emit VaultCreated(vaultId, address(newVault), msg.sender, controller, yieldReceiver);
        return address(newVault);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    function getVault(uint256 id) external view returns (VaultInfo memory) {
        return vaults[id];
    }

    function getAllVaults() external view returns (VaultInfo[] memory) {
        return vaults;
    }

    function getVaultsByController(address controller) external view returns (VaultInfo[] memory) {
        uint256[] memory ids = vaultIdsByController[controller];
        VaultInfo[] memory result = new VaultInfo[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) result[i] = vaults[ids[i]];
        return result;
    }

    function getVaultsByCreator(address creator) external view returns (VaultInfo[] memory) {
        uint256[] memory ids = vaultIdsByCreator[creator];
        VaultInfo[] memory result = new VaultInfo[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) result[i] = vaults[ids[i]];
        return result;
    }
}
