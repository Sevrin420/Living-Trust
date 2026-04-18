// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock xPHAR token for testing.
///         convertEmissionsToken pulls PHAR from caller and mints xPHAR at 50%
///         (matching the real xPHAR 50% slashing penalty).
contract MockXPhar is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable phar;

    constructor(address _phar) ERC20("xPHAR", "xPHAR") {
        phar = IERC20(_phar);
    }

    /// @notice Pulls `amount` PHAR from caller (requires approval), mints amount/2 xPHAR.
    function convertEmissionsToken(uint256 amount) external {
        phar.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount / 2);
    }

    function isExempt(address) external pure returns (bool) { return true; }
    function isExemptTo(address) external pure returns (bool) { return true; }
}
