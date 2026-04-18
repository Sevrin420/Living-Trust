// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XPharVault} from "./XPharVault.sol";

/// @notice Factory that deploys and tracks XPharVault instances for Pharaoh V3.
///
/// ── xPHAR transfer restriction note ─────────────────────────────────────────
/// xPHAR is non-transferable by default. Each vault address must be added to
/// Pharaoh's exemptTo whitelist before users can send xPHAR to it.
/// The factory owner should request batch whitelisting from the Pharaoh team:
///   Discord: discord.gg/Pharaoh
///   Docs:    docs.pharaoh.exchange
///
/// Alternatively users can send PHAR to the vault and call convertPharToXPhar()
/// (note: 50% of PHAR input is burned by the Pharaoh protocol on that path).
contract XPharVaultFactory {
    // ── Protocol addresses (Pharaoh V3 on Avalanche C-Chain) ─────────────────
    address public immutable xphar;
    address public immutable phar;
    address public immutable voteModule;
    address public immutable voter;

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

    constructor(
        address _xphar,
        address _phar,
        address _voteModule,
        address _voter
    ) {
        if (_xphar == address(0) || _phar == address(0)) revert ZeroAddress();
        if (_voteModule == address(0) || _voter == address(0)) revert ZeroAddress();
        xphar = _xphar;
        phar = _phar;
        voteModule = _voteModule;
        voter = _voter;
    }

    /// @notice Deploy a new XPharVault.
    /// @param controller    The trustee wallet that manages vault operations
    ///                      (stakes, votes, claims). Can be the same as creator.
    /// @param yieldReceiver The beneficiary wallet that receives all claimed yield.
    ///                      Can be any address — completely separate from controller.
    function createVault(
        address controller,
        address yieldReceiver
    ) external returns (address vault) {
        if (controller == address(0) || yieldReceiver == address(0)) revert ZeroAddress();

        XPharVault newVault = new XPharVault(
            xphar,
            phar,
            voteModule,
            voter,
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
