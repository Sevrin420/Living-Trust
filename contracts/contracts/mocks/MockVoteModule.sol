// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Test mock for Pharaoh VoteModule
contract MockVoteModule {
    using SafeERC20 for IERC20;

    IERC20 public immutable xphar;
    mapping(address => uint256) private _balances;
    uint256 public totalSupply;

    constructor(address _xphar) {
        xphar = IERC20(_xphar);
    }

    function deposit(uint256 amount) external {
        xphar.safeTransferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] += amount;
        totalSupply += amount;
    }

    function depositAll() external {
        uint256 bal = xphar.balanceOf(msg.sender);
        xphar.safeTransferFrom(msg.sender, address(this), bal);
        _balances[msg.sender] += bal;
        totalSupply += bal;
    }

    function withdraw(uint256 amount) external {
        _balances[msg.sender] -= amount;
        totalSupply -= amount;
        xphar.safeTransfer(msg.sender, amount);
    }

    function withdrawAll() external {
        uint256 bal = _balances[msg.sender];
        _balances[msg.sender] = 0;
        totalSupply -= bal;
        xphar.safeTransfer(msg.sender, bal);
    }

    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function delegate(address) external {}
    function setAdmin(address) external {}
    function isDelegateFor(address, address) external pure returns (bool) { return false; }
    function isAdminFor(address, address) external pure returns (bool) { return false; }
    function getPeriod() external view returns (uint256) { return block.timestamp / 1 weeks; }
}
