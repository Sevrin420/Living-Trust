// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IP33} from "./interfaces/IP33.sol";

/// @notice A living trust vault that holds P33 shares (Pharaoh's auto-compounding
///         xPHAR vault), tracks the initial xPHAR principal, and each month
///         withdraws only the appreciation above that principal to a designated
///         beneficiary wallet.
///
/// ── Why P33? ──────────────────────────────────────────────────────────────────
///  P33 auto-votes each epoch and compounds all voting rewards back into xPHAR.
///  The xPHAR-per-share ratio increases over time. The vault skims the gain.
///
/// ── Flow ──────────────────────────────────────────────────────────────────────
///  1. User deposits xPHAR → P33 (standard ERC4626) → receives P33 shares.
///     (P33 shares are a normal ERC20 — no transfer restrictions.)
///  2. User sends P33 shares to this vault and calls depositP33(amount).
///     Principal is recorded as the xPHAR value of those shares at deposit time.
///  3. Monthly (or on demand): harvestGains() → withdraws xPHAR appreciation
///     above principal directly to yieldReceiver. Principal stays intact.
///  4. Principal can be withdrawn via withdrawPrincipal() at any time (controller).
///
/// ── Auto-harvest ──────────────────────────────────────────────────────────────
///  When autoHarvestEnabled, anyone may call harvestGains() after harvestInterval.
///  The caller earns a small AVAX bounty from the vault's native balance.
///  The vault also implements Chainlink Automation checkUpkeep/performUpkeep.
contract XPharVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutable config ──────────────────────────────────────────────────────
    IP33 public immutable p33;
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    // ── Mutable state ─────────────────────────────────────────────────────────
    address public controller;
    address public yieldReceiver;

    /// @notice Cumulative xPHAR principal deposited (cost basis).
    ///         Only decreases when withdrawPrincipal() is called.
    uint256 public principal;

    // ── Auto-harvest state ────────────────────────────────────────────────────
    bool public autoHarvestEnabled;
    uint256 public harvestInterval;  // seconds between permissionless harvests
    uint256 public lastHarvestAt;    // timestamp of last harvest
    uint256 public gasRefund;        // AVAX (wei) paid to harvest callers

    // ── Events ────────────────────────────────────────────────────────────────
    event ControllerChanged(address indexed oldController, address indexed newController);
    event YieldReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event Deposited(uint256 p33Shares, uint256 xpharPrincipal, uint256 totalPrincipal);
    event GainsHarvested(uint256 xpharGain, address indexed receiver);
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
        address _p33,
        address _controller,
        address _yieldReceiver,
        address _creator
    ) {
        if (_p33 == address(0)) revert ZeroAddress();
        if (_controller == address(0) || _yieldReceiver == address(0)) revert ZeroAddress();

        p33 = IP33(_p33);
        controller = _controller;
        yieldReceiver = _yieldReceiver;
        factory = msg.sender;
        creator = _creator;
        createdAt = block.timestamp;

        // Auto-harvest defaults (disabled until controller enables)
        harvestInterval = 30 days;
        lastHarvestAt = block.timestamp;
        gasRefund = 0;
        autoHarvestEnabled = false;
    }

    // ── Receive AVAX for gas bounties ─────────────────────────────────────────

    receive() external payable {
        emit AvaxDeposited(msg.sender, msg.value);
    }

    // ── Deposits ──────────────────────────────────────────────────────────────

    /// @notice Deposit P33 shares into this vault and record their xPHAR value
    ///         as principal. Call this after transferring P33 shares here.
    ///         Anyone can call this — useful for the beneficiary to add to trust.
    /// @param shares  Number of P33 shares to pull from msg.sender
    function depositP33(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();

        IERC20(address(p33)).safeTransferFrom(msg.sender, address(this), shares);

        uint256 xpharValue = p33.convertToAssets(shares);
        principal += xpharValue;

        emit Deposited(shares, xpharValue, principal);
    }

    // ── Gain harvesting ───────────────────────────────────────────────────────

    /// @notice Current xPHAR value of all P33 shares held by this vault.
    function currentValue() public view returns (uint256) {
        return p33.convertToAssets(IERC20(address(p33)).balanceOf(address(this)));
    }

    /// @notice xPHAR gains above principal available to harvest right now.
    function pendingGains() public view returns (uint256) {
        uint256 value = currentValue();
        return value > principal ? value - principal : 0;
    }

    /// @notice Withdraw appreciation above principal and send xPHAR to yieldReceiver.
    ///         Controller-only, no time restriction.
    function harvestGains() external onlyController nonReentrant {
        _harvest();
    }

    /// @notice Permissionless monthly harvest.
    ///         Caller earns gasRefund AVAX from vault balance as a bounty.
    ///         Callable by beneficiary wallet, keeper bots, or Chainlink Automation.
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

    /// @notice Withdraw `xpharAmount` worth of xPHAR from the principal.
    ///         Burns P33 shares and sends xPHAR to `to`. Reduces principal.
    function withdrawPrincipal(uint256 xpharAmount, address to)
        external
        onlyController
        nonReentrant
    {
        if (xpharAmount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        // Clamp to available principal
        uint256 withdrawable = xpharAmount <= principal ? xpharAmount : principal;
        principal -= withdrawable;

        p33.withdraw(withdrawable, to, address(this));
        emit PrincipalWithdrawn(withdrawable, to);
    }

    /// @notice Withdraw all P33 shares (principal + gains) and send xPHAR to `to`.
    ///         Resets principal to zero.
    function withdrawAll(address to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 shares = IERC20(address(p33)).balanceOf(address(this));
        if (shares == 0) revert ZeroAmount();

        principal = 0;
        p33.redeem(shares, to, address(this));
        emit PrincipalWithdrawn(0, to);
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

    function p33Balance() external view returns (uint256) {
        return IERC20(address(p33)).balanceOf(address(this));
    }

    function avaxBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function nextHarvestAt() external view returns (uint256) {
        return lastHarvestAt + harvestInterval;
    }

    /// @notice Full position summary in one call
    function positionSummary() external view returns (
        uint256 shares,
        uint256 value,
        uint256 cost,
        uint256 gains,
        uint256 ratio
    ) {
        shares = IERC20(address(p33)).balanceOf(address(this));
        value  = p33.convertToAssets(shares);
        cost   = principal;
        gains  = value > cost ? value - cost : 0;
        ratio  = p33.ratio();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _harvest() internal {
        uint256 gain = pendingGains();
        if (gain == 0) revert NoGains();

        address receiver = yieldReceiver;
        // Withdraw exactly `gain` xPHAR from P33 and send directly to beneficiary
        p33.withdraw(gain, receiver, address(this));

        emit GainsHarvested(gain, receiver);
    }
}
