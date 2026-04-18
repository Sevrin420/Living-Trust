// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IXPharStaking} from "./interfaces/IXPharStaking.sol";

/// @notice A living trust vault that stakes xPHAR on Pharaoh Exchange and
///         forwards all yield to a designated beneficiary wallet.
///         Controlled by a trustee (controller) independent of the creator.
///
///         Auto-claim: anyone may call autoClaimYield() once per claimInterval
///         and receive a small AVAX bounty from the vault's balance.
///         Also implements Chainlink Automation's checkUpkeep/performUpkeep
///         so the vault can be registered with Chainlink for reliable execution.
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

    // ── Auto-claim state ──────────────────────────────────────────────────────
    bool public autoClaimEnabled;
    uint256 public claimInterval;   // seconds between permissionless claims
    uint256 public lastClaimAt;     // timestamp of last auto-claim
    uint256 public gasRefund;       // AVAX (wei) paid to whoever triggers the claim

    // ── Events ────────────────────────────────────────────────────────────────
    event ControllerChanged(address indexed oldController, address indexed newController);
    event YieldReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event Staked(uint256 amount, uint256 totalStaked);
    event Unstaked(uint256 amount);
    event YieldClaimed(address[] tokens, uint256[] amounts, address indexed receiver);
    event AutoClaimed(address indexed executor, uint256 refundPaid);
    event AutoClaimConfigChanged(bool enabled, uint256 interval, uint256 refund);
    event AvaxDeposited(address indexed from, uint256 amount);
    event AvaxWithdrawn(uint256 amount, address indexed to);
    event TokenRescued(address indexed token, uint256 amount, address indexed to);
    event RewardTokenAdded(address indexed token);
    event RewardTokenRemoved(uint256 indexed index, address indexed token);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotController();
    error ZeroAddress();
    error ZeroAmount();
    error AutoClaimDisabled();
    error TooEarly(uint256 nextAllowedAt);
    error IntervalTooShort();
    error AvaxTransferFailed();

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

        // Auto-claim defaults (disabled until controller enables it)
        claimInterval = 7 days;
        lastClaimAt = block.timestamp;
        gasRefund = 0.05 ether; // 0.05 AVAX default bounty
        autoClaimEnabled = false;
    }

    // ── Receive AVAX for gas funding ──────────────────────────────────────────

    receive() external payable {
        emit AvaxDeposited(msg.sender, msg.value);
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

    /// @notice Claim all accumulated yield and forward to yieldReceiver (controller only)
    function claimYield() external onlyController nonReentrant {
        _claimYield();
    }

    /// @notice Permissionless weekly auto-claim.
    ///         Caller receives gasRefund AVAX from the vault's balance as a bounty.
    ///         Can also be called by Chainlink Automation or Gelato.
    function autoClaimYield() external nonReentrant {
        if (!autoClaimEnabled) revert AutoClaimDisabled();
        uint256 nextAllowed = lastClaimAt + claimInterval;
        if (block.timestamp < nextAllowed) revert TooEarly(nextAllowed);

        lastClaimAt = block.timestamp;
        _claimYield();

        // Pay bounty to caller from vault's AVAX balance
        uint256 refund = gasRefund;
        uint256 avaxBal = address(this).balance;
        if (refund > 0 && avaxBal >= refund) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert AvaxTransferFailed();
            emit AutoClaimed(msg.sender, refund);
        } else {
            emit AutoClaimed(msg.sender, 0);
        }
    }

    // ── Chainlink Automation interface ────────────────────────────────────────
    // Register this vault at automation.chain.link to have Chainlink nodes
    // call performUpkeep() automatically. Fund the upkeep with LINK.

    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded =
            autoClaimEnabled &&
            block.timestamp >= lastClaimAt + claimInterval &&
            staking.balanceOf(address(this)) > 0;
    }

    function performUpkeep(bytes calldata) external nonReentrant {
        // Re-validate (Chainlink calls this without checking checkUpkeep first in some flows)
        if (!autoClaimEnabled) revert AutoClaimDisabled();
        uint256 nextAllowed = lastClaimAt + claimInterval;
        if (block.timestamp < nextAllowed) revert TooEarly(nextAllowed);

        lastClaimAt = block.timestamp;
        _claimYield();
        emit AutoClaimed(msg.sender, 0); // Chainlink pays its own gas via LINK
    }

    // ── Auto-claim config (controller only) ───────────────────────────────────

    function setAutoClaimEnabled(bool enabled) external onlyController {
        autoClaimEnabled = enabled;
        emit AutoClaimConfigChanged(enabled, claimInterval, gasRefund);
    }

    /// @param interval Minimum seconds between auto-claims (min 1 hour)
    function setClaimInterval(uint256 interval) external onlyController {
        if (interval < 1 hours) revert IntervalTooShort();
        claimInterval = interval;
        emit AutoClaimConfigChanged(autoClaimEnabled, interval, gasRefund);
    }

    /// @param amount AVAX (in wei) paid to the caller of autoClaimYield
    function setGasRefund(uint256 amount) external onlyController {
        gasRefund = amount;
        emit AutoClaimConfigChanged(autoClaimEnabled, claimInterval, amount);
    }

    /// @notice Withdraw AVAX from vault (controller only)
    function withdrawAvax(uint256 amount, address payable to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert AvaxTransferFailed();
        emit AvaxWithdrawn(amount, to);
    }

    // ── Config (controller only) ──────────────────────────────────────────────

    function setController(address newController) external onlyController {
        if (newController == address(0)) revert ZeroAddress();
        emit ControllerChanged(controller, newController);
        controller = newController;
    }

    function setYieldReceiver(address newReceiver) external onlyController {
        if (newReceiver == address(0)) revert ZeroAddress();
        emit YieldReceiverChanged(yieldReceiver, newReceiver);
        yieldReceiver = newReceiver;
    }

    function addRewardToken(address token) external onlyController {
        if (token == address(0)) revert ZeroAddress();
        rewardTokens.push(token);
        emit RewardTokenAdded(token);
    }

    function removeRewardToken(uint256 index) external onlyController {
        address token = rewardTokens[index];
        rewardTokens[index] = rewardTokens[rewardTokens.length - 1];
        rewardTokens.pop();
        emit RewardTokenRemoved(index, token);
    }

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

    function nextClaimAt() external view returns (uint256) {
        return lastClaimAt + claimInterval;
    }

    function avaxBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _claimYield() internal {
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
}
