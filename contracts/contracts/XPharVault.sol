// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IXPharStaking} from "./interfaces/IXPharStaking.sol";

/// @notice A living trust vault that stakes xPHAR on Pharaoh Exchange and
///         forwards all yield to a designated beneficiary wallet.
///         Controlled by a trustee (controller) independent of the creator.
contract XPharVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutable config ──────────────────────────────────────────────────────
    IERC20 public immutable xphar;
    IXPharStaking public immutable staking;
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    // ── Mutable state ─────────────────────────────────────────────────────────
    address public controller;
    address public yieldReceiver;
    address[] public rewardTokens;

    // ── Events ────────────────────────────────────────────────────────────────
    event ControllerChanged(address indexed oldController, address indexed newController);
    event YieldReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event Staked(uint256 amount, uint256 totalStaked);
    event Unstaked(uint256 amount);
    event YieldClaimed(address[] tokens, uint256[] amounts, address indexed receiver);
    event TokenRescued(address indexed token, uint256 amount, address indexed to);
    event RewardTokenAdded(address indexed token);
    event RewardTokenRemoved(uint256 indexed index, address indexed token);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotController();
    error ZeroAddress();
    error ZeroAmount();

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    constructor(
        address _xphar,
        address _staking,
        address _controller,
        address _yieldReceiver,
        address[] memory _rewardTokens,
        address _creator
    ) {
        if (_xphar == address(0) || _staking == address(0)) revert ZeroAddress();
        if (_controller == address(0) || _yieldReceiver == address(0)) revert ZeroAddress();

        xphar = IERC20(_xphar);
        staking = IXPharStaking(_staking);
        controller = _controller;
        yieldReceiver = _yieldReceiver;
        rewardTokens = _rewardTokens;
        factory = msg.sender;
        creator = _creator;
        createdAt = block.timestamp;
    }

    // ── Staking operations (controller only) ──────────────────────────────────

    /// @notice Stake a specific amount of xPHAR currently held by this contract
    function stake(uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        xphar.forceApprove(address(staking), amount);
        staking.deposit(amount);
        emit Staked(amount, staking.balanceOf(address(this)));
    }

    /// @notice Stake the entire xPHAR balance held by this contract
    function stakeAll() external onlyController nonReentrant {
        uint256 balance = xphar.balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        xphar.forceApprove(address(staking), balance);
        staking.deposit(balance);
        emit Staked(balance, staking.balanceOf(address(this)));
    }

    /// @notice Unstake a specific amount of xPHAR from the staking contract
    function unstake(uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        staking.withdraw(amount);
        emit Unstaked(amount);
    }

    /// @notice Unstake the entire staked position
    function unstakeAll() external onlyController nonReentrant {
        uint256 staked = staking.balanceOf(address(this));
        if (staked == 0) revert ZeroAmount();
        staking.withdraw(staked);
        emit Unstaked(staked);
    }

    // ── Yield claiming ────────────────────────────────────────────────────────

    /// @notice Claim all accumulated yield and forward to yieldReceiver
    function claimYield() external onlyController nonReentrant {
        staking.getReward(address(this), rewardTokens);

        uint256 len = rewardTokens.length;
        uint256[] memory amounts = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            uint256 balance = IERC20(rewardTokens[i]).balanceOf(address(this));
            if (balance > 0) {
                IERC20(rewardTokens[i]).safeTransfer(yieldReceiver, balance);
                amounts[i] = balance;
            }
        }

        emit YieldClaimed(rewardTokens, amounts, yieldReceiver);
    }

    // ── Config (controller only) ──────────────────────────────────────────────

    /// @notice Transfer the controller role to a new trustee
    function setController(address newController) external onlyController {
        if (newController == address(0)) revert ZeroAddress();
        emit ControllerChanged(controller, newController);
        controller = newController;
    }

    /// @notice Update the yield beneficiary address
    function setYieldReceiver(address newReceiver) external onlyController {
        if (newReceiver == address(0)) revert ZeroAddress();
        emit YieldReceiverChanged(yieldReceiver, newReceiver);
        yieldReceiver = newReceiver;
    }

    /// @notice Add a reward token that will be swept during claimYield
    function addRewardToken(address token) external onlyController {
        if (token == address(0)) revert ZeroAddress();
        rewardTokens.push(token);
        emit RewardTokenAdded(token);
    }

    /// @notice Remove a reward token by index
    function removeRewardToken(uint256 index) external onlyController {
        address token = rewardTokens[index];
        rewardTokens[index] = rewardTokens[rewardTokens.length - 1];
        rewardTokens.pop();
        emit RewardTokenRemoved(index, token);
    }

    /// @notice Rescue any ERC20 held in this contract (use unstake() before rescuing xPHAR)
    function rescueToken(address token, uint256 amount, address to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, amount, to);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function stakedBalance() external view returns (uint256) {
        return staking.balanceOf(address(this));
    }

    function unstakedBalance() external view returns (uint256) {
        return xphar.balanceOf(address(this));
    }

    function claimableYield(address token) external view returns (uint256) {
        return staking.earned(address(this), token);
    }

    function getRewardTokens() external view returns (address[] memory) {
        return rewardTokens;
    }
}
