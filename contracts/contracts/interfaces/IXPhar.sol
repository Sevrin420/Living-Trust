// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Pharaoh V3 xPHAR token
///
/// xPHAR is non-transferable by default. Transfer exemptions are managed by
/// AccessHub governance. To receive xPHAR, the destination address must be on
/// the exemptTo whitelist (VoteModule is already whitelisted). To send xPHAR
/// from a contract, the sender must be on the exempt whitelist.
///
/// Vaults created by XPharVaultFactory need to be added to the exemptTo
/// whitelist via Pharaoh governance before they can receive xPHAR from users.
/// In the interim, users can send PHAR and the vault calls convertEmissionsToken.
interface IXPhar is IERC20 {
    /// @notice Convert PHAR → xPHAR. A 50% slashing penalty applies to the
    ///         PHAR input (the other 50% is burned, deflationary design).
    ///         Call this only if the vault cannot receive xPHAR directly.
    function convertEmissionsToken(uint256 amount) external;

    /// @notice Check if an address can SEND xPHAR without restriction
    function isExempt(address account) external view returns (bool);

    /// @notice Check if an address can RECEIVE xPHAR
    function isExemptTo(address account) external view returns (bool);
}
