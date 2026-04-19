// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IXPharStaking} from "./interfaces/IXPharStaking.sol";
import {IXPhar} from "./interfaces/IXPhar.sol";

/// @notice A living trust vault that stakes xPHAR in Pharaoh's auto-voting gauge,
///         tracks the original xPHAR principal, and each harvest cycle forwards
///         all accumulated reward tokens to a designated beneficiary wallet.
///
/// ── Flow ──────────────────────────────────────────────────────────────────────
///  1. Deposit PHAR → vault converts to xPHAR (50% slashing via convertEmissionsToken)
///     and stakes in the auto-voting gauge.
///     OR: deposit xPHAR directly (no penalty).
///  2. The gauge votes each epoch and accumulates reward tokens.
///  3. Monthly (or on demand): harvestGains() claims rewards and sends them to yieldReceiver.
///  4. Principal (staked xPHAR) can be withdrawn at any time by the controller.
contract XPharVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutable config ──────────────────────────────────────────────────────
    IXPharStaking public immutable staking;  // auto-voting xPHAR gauge
    IXPhar public immutable xphar;
    IERC20 public immutable phar;
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    // ── Mutable state ─────────────────────────────────────────────────────────
    address public controller;
    address public yieldReceiver;

    /// @notice Cumulative xPHAR staked (cost basis). Only decreases on withdrawal.
    uint256 public principal;

    // ── Auto-harvest state ────────────────────────────────────────────────────
    bool public autoHarvestEnabled;
    uint256 public harvestInterval;  // seconds between permissionless harvests
    uint256 public lastHarvestAt;
    uint256 public gasRefund;        // AVAX (wei) paid to harvest callers

    // ── Events ────────────────────────────────────────────────────────────────
    event ControllerChanged(address indexed oldController, address indexed newController);
    event YieldReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event Deposited(uint256 xpharStaked, uint256 xpharPrincipal, uint256 totalPrincipal);
    event GainsHarvested(uint256 rewardAmount, address indexed rewardToken, address indexed receiver);
    event PrincipalWithdrawn(uint256 xpharAmount, address indexed to);
    event AutoHarvested(address indexed executor, uint256 refundPaid);
    event AutoHarvestConfigChanged(bool enabled, uint256 interval, uint256 refund);
    event AvaxDeposited(address indexed from, uint256 amount);
    event AvaxWithdrawn(uint256 amount, address indexed to);
    event TokenRescued(address indexed token, uint256 amount, address indexed to);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotController();
    error ZeroAddress();
    error ZeroAmount();
    error AutoHarvestDisabled();
    error TooEarly(uint256 nextAllowedAt);
    error IntervalTooShort();
    error AvaxTransferFailed();
    error NoGains();

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    constructor(
        address _staking,
        address _phar,
        address _xphar,
        address _controller,
        address _yieldReceiver,
        address _creator
    ) {
        if (_staking == address(0) || _phar == address(0) || _xphar == address(0)) revert ZeroAddress();
        if (_controller == address(0) || _yieldReceiver == address(0)) revert ZeroAddress();

        staking = IXPharStaking(_staking);
        phar = IERC20(_phar);
        xphar = IXPhar(_xphar);
        controller = _controller;
        yieldReceiver = _yieldReceiver;
        factory = msg.sender;
        creator = _creator;
        createdAt = block.timestamp;

        harvestInterval = 30 days;
        lastHarvestAt = block.timestamp;
        gasRefund = 0;
        autoHarvestEnabled = false;
    }

    receive() external payable {
        emit AvaxDeposited(msg.sender, msg.value);
    }

    // ── Deposits ──────────────────────────────────────────────────────────────

    /// @notice Deposit xPHAR directly: pulls from caller and stakes in the gauge.
    function depositXPhar(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        IERC20(address(xphar)).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(address(xphar)).approve(address(staking), amount);
        staking.deposit(amount);
        principal += amount;
        emit Deposited(amount, amount, principal);
    }

    /// @notice Deposit PHAR: convert to xPHAR (50% slashing penalty), then stake.
    ///         Caller must approve this vault for PHAR first.
    function depositPhar(uint256 pharAmount) external nonReentrant {
        if (pharAmount == 0) revert ZeroAmount();

        phar.safeTransferFrom(msg.sender, address(this), pharAmount);
        phar.approve(address(xphar), pharAmount);

        uint256 xpharBefore = IERC20(address(xphar)).balanceOf(address(this));
        xphar.convertEmissionsToken(pharAmount);
        uint256 xpharReceived = IERC20(address(xphar)).balanceOf(address(this)) - xpharBefore;

        if (xpharReceived == 0) revert ZeroAmount();

        IERC20(address(xphar)).approve(address(staking), xpharReceived);
        staking.deposit(xpharReceived);

        principal += xpharReceived;
        emit Deposited(xpharReceived, xpharReceived, principal);
    }

    // ── Gain harvesting ───────────────────────────────────────────────────────

    /// @notice xPHAR currently staked in the gauge by this vault.
    function stakedBalance() public view returns (uint256) {
        return staking.balanceOf(address(this));
    }

    /// @notice Reward tokens pending harvest (in the gauge's reward token).
    function pendingGains() public view returns (uint256) {
        return staking.earned(address(this), staking.rewardToken());
    }

    /// @notice Claim rewards and send to yieldReceiver. Controller-only, no time restriction.
    function harvestGains() external onlyController nonReentrant {
        _harvest();
    }

    /// @notice Permissionless harvest after harvestInterval elapses.
    ///         Caller earns gasRefund AVAX from vault balance as a bounty.
    function autoHarvestGains() external nonReentrant {
        if (!autoHarvestEnabled) revert AutoHarvestDisabled();
        uint256 nextAllowed = lastHarvestAt + harvestInterval;
        if (block.timestamp < nextAllowed) revert TooEarly(nextAllowed);

        lastHarvestAt = block.timestamp;
        _harvest();

        uint256 refund = gasRefund;
        if (refund > 0 && address(this).balance >= refund) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert AvaxTransferFailed();
            emit AutoHarvested(msg.sender, refund);
        } else {
            emit AutoHarvested(msg.sender, 0);
        }
    }

    // ── Chainlink Automation ──────────────────────────────────────────────────

    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded =
            autoHarvestEnabled &&
            block.timestamp >= lastHarvestAt + harvestInterval &&
            pendingGains() > 0;
    }

    function performUpkeep(bytes calldata) external nonReentrant {
        if (!autoHarvestEnabled) revert AutoHarvestDisabled();
        if (block.timestamp < lastHarvestAt + harvestInterval)
            revert TooEarly(lastHarvestAt + harvestInterval);
        lastHarvestAt = block.timestamp;
        _harvest();
        emit AutoHarvested(msg.sender, 0);
    }

    // ── Principal management (controller only) ────────────────────────────────

    /// @notice Unstake `xpharAmount` from the gauge and send xPHAR to `to`.
    function withdrawPrincipal(uint256 xpharAmount, address to)
        external
        onlyController
        nonReentrant
    {
        if (xpharAmount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        uint256 withdrawable = xpharAmount <= principal ? xpharAmount : principal;
        principal -= withdrawable;

        staking.withdraw(withdrawable);
        IERC20(address(xphar)).safeTransfer(to, withdrawable);
        emit PrincipalWithdrawn(withdrawable, to);
    }

    /// @notice Unstake all xPHAR and send to `to`. Resets principal to zero.
    function withdrawAll(address to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 staked = staking.balanceOf(address(this));
        if (staked == 0) revert ZeroAmount();

        principal = 0;
        staking.withdraw(staked);
        IERC20(address(xphar)).safeTransfer(to, staked);
        emit PrincipalWithdrawn(staked, to);
    }

    // ── Auto-harvest config (controller only) ─────────────────────────────────

    function setAutoHarvestEnabled(bool enabled) external onlyController {
        autoHarvestEnabled = enabled;
        emit AutoHarvestConfigChanged(enabled, harvestInterval, gasRefund);
    }

    /// @param interval Minimum seconds between auto-harvests (min 1 day)
    function setHarvestInterval(uint256 interval) external onlyController {
        if (interval < 1 days) revert IntervalTooShort();
        harvestInterval = interval;
        emit AutoHarvestConfigChanged(autoHarvestEnabled, interval, gasRefund);
    }

    function setGasRefund(uint256 amount) external onlyController {
        gasRefund = amount;
        emit AutoHarvestConfigChanged(autoHarvestEnabled, harvestInterval, amount);
    }

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

    function rescueToken(address token, uint256 amount, address to)
        external
        onlyController
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, amount, to);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function avaxBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function nextHarvestAt() external view returns (uint256) {
        return lastHarvestAt + harvestInterval;
    }

    /// @notice Full position summary in one call
    function positionSummary() external view returns (
        uint256 staked,
        uint256 pending,
        uint256 cost,
        address rewardTok
    ) {
        staked    = staking.balanceOf(address(this));
        cost      = principal;
        rewardTok = staking.rewardToken();
        pending   = staking.earned(address(this), rewardTok);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _harvest() internal {
        address rewardTok = staking.rewardToken();
        uint256 before = IERC20(rewardTok).balanceOf(address(this));

        address[] memory tokens = new address[](1);
        tokens[0] = rewardTok;
        staking.getReward(address(this), tokens);

        uint256 gained = IERC20(rewardTok).balanceOf(address(this)) - before;
        if (gained == 0) revert NoGains();

        address receiver = yieldReceiver;
        IERC20(rewardTok).safeTransfer(receiver, gained);
        emit GainsHarvested(gained, rewardTok, receiver);
    }
}
