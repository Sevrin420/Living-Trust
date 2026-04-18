// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IXPhar} from "./interfaces/IXPhar.sol";
import {IVoteModule} from "./interfaces/IVoteModule.sol";
import {IVoter} from "./interfaces/IVoter.sol";

/// @notice A living trust vault for Pharaoh Exchange V3 xPHAR.
///
/// ── Flow ──────────────────────────────────────────────────────────────────────
///  1. Vault receives xPHAR (requires Pharaoh exemptTo whitelist) or PHAR.
///  2. Controller calls stake() → deposits xPHAR into VoteModule.
///  3. Each epoch (~weekly) controller calls vote() → casts votes for pools.
///  4. Controller calls claimYield() → claims trading fees from voted pools
///     via Voter.claimIncentives() and forwards all tokens to yieldReceiver.
///
/// ── Transfer restriction ──────────────────────────────────────────────────────
///  xPHAR is non-transferable by default. Before sending xPHAR to this vault,
///  the vault address must be added to Pharaoh's exemptTo whitelist by their
///  AccessHub governance. Contact the Pharaoh team via Discord.
///
///  Alternative: deposit PHAR into the vault, then call convertPharToXPhar().
///  Note the 50% PHAR burn penalty on that path.
///
/// ── Auto-claim ────────────────────────────────────────────────────────────────
///  When enabled, anyone may call autoClaimYield() after claimInterval elapses.
///  The caller earns a small AVAX bounty paid from the vault's native balance.
///  The vault also implements checkUpkeep/performUpkeep for Chainlink Automation.
contract XPharVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutable config ──────────────────────────────────────────────────────
    IXPhar public immutable xphar;
    IVoteModule public immutable voteModule;
    IVoter public immutable voter;
    IERC20 public immutable phar;      // underlying PHAR (for optional conversion path)
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    // ── Mutable state ─────────────────────────────────────────────────────────
    address public controller;
    address public yieldReceiver;

    // Stored FeeDistributors for auto-claim (controller manages this list)
    address[] public feeDistributors;
    // Per-distributor: which tokens to claim
    mapping(address => address[]) public feeDistributorTokens;

    // ── Auto-claim state ──────────────────────────────────────────────────────
    bool public autoClaimEnabled;
    uint256 public claimInterval;   // seconds between permissionless claims
    uint256 public lastClaimAt;     // timestamp of last auto/manual claim
    uint256 public gasRefund;       // AVAX (wei) paid to auto-claim callers

    // ── Events ────────────────────────────────────────────────────────────────
    event ControllerChanged(address indexed oldController, address indexed newController);
    event YieldReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event Staked(uint256 amount, uint256 totalStaked);
    event Unstaked(uint256 amount);
    event Voted(address[] pools, uint256[] weights);
    event YieldClaimed(address indexed receiver);
    event AutoClaimed(address indexed executor, uint256 refundPaid);
    event AutoClaimConfigChanged(bool enabled, uint256 interval, uint256 refund);
    event FeeDistributorAdded(address indexed fd);
    event FeeDistributorRemoved(address indexed fd);
    event PharConverted(uint256 pharIn, uint256 xpharReceived);
    event AvaxDeposited(address indexed from, uint256 amount);
    event AvaxWithdrawn(uint256 amount, address indexed to);
    event TokenRescued(address indexed token, uint256 amount, address indexed to);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotController();
    error ZeroAddress();
    error ZeroAmount();
    error AutoClaimDisabled();
    error TooEarly(uint256 nextAllowedAt);
    error IntervalTooShort();
    error AvaxTransferFailed();
    error FeeDistributorNotFound();

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    constructor(
        address _xphar,
        address _phar,
        address _voteModule,
        address _voter,
        address _controller,
        address _yieldReceiver,
        address _creator
    ) {
        if (_xphar == address(0) || _phar == address(0)) revert ZeroAddress();
        if (_voteModule == address(0) || _voter == address(0)) revert ZeroAddress();
        if (_controller == address(0) || _yieldReceiver == address(0)) revert ZeroAddress();

        xphar = IXPhar(_xphar);
        phar = IERC20(_phar);
        voteModule = IVoteModule(_voteModule);
        voter = IVoter(_voter);
        controller = _controller;
        yieldReceiver = _yieldReceiver;
        factory = msg.sender;
        creator = _creator;
        createdAt = block.timestamp;

        // Auto-claim defaults (disabled until controller enables)
        claimInterval = 7 days;
        lastClaimAt = block.timestamp;
        gasRefund = 0.05 ether;
        autoClaimEnabled = false;
    }

    // ── Receive AVAX for gas funding ──────────────────────────────────────────

    receive() external payable {
        emit AvaxDeposited(msg.sender, msg.value);
    }

    // ── Staking operations (controller only) ──────────────────────────────────

    /// @notice Stake a specific amount of xPHAR held by this vault into VoteModule
    function stake(uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        IERC20(address(xphar)).forceApprove(address(voteModule), amount);
        voteModule.deposit(amount);
        emit Staked(amount, voteModule.balanceOf(address(this)));
    }

    /// @notice Stake the entire xPHAR balance held by this vault
    function stakeAll() external onlyController nonReentrant {
        uint256 balance = IERC20(address(xphar)).balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        IERC20(address(xphar)).forceApprove(address(voteModule), balance);
        voteModule.deposit(balance);
        emit Staked(balance, voteModule.balanceOf(address(this)));
    }

    /// @notice Unstake a specific amount of xPHAR from VoteModule
    ///         Note: VoteModule enforces a cooldown after staking (default 12h)
    function unstake(uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        voteModule.withdraw(amount);
        emit Unstaked(amount);
    }

    /// @notice Unstake the entire staked position
    function unstakeAll() external onlyController nonReentrant {
        uint256 staked = voteModule.balanceOf(address(this));
        if (staked == 0) revert ZeroAmount();
        voteModule.withdraw(staked);
        emit Unstaked(staked);
    }

    // ── Voting (controller only, each epoch ~weekly) ──────────────────────────

    /// @notice Vote for pools to earn their trading fees this epoch.
    ///         Must be called each week — votes do NOT carry over automatically.
    /// @param _pools   Pool addresses to vote for
    /// @param _weights Proportional weights (e.g. [50, 30, 20] = 50%/30%/20%)
    function vote(
        address[] calldata _pools,
        uint256[] calldata _weights
    ) external onlyController {
        voter.vote(address(this), _pools, _weights);
        emit Voted(_pools, _weights);
    }

    // ── Yield claiming ────────────────────────────────────────────────────────

    /// @notice Claim trading fees from specific FeeDistributors and forward to yieldReceiver.
    ///         Use this for one-off claims with custom distributor/token lists.
    /// @param _feeDistributors FeeDistributor contract addresses to claim from
    /// @param _tokens          Per-distributor token lists to claim
    function claimYield(
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external onlyController nonReentrant {
        _claimAndForward(_feeDistributors, _tokens);
    }

    /// @notice Claim from all stored FeeDistributors and forward yield to yieldReceiver.
    ///         Controller-triggered alternative to the permissionless auto-claim.
    function claimStoredYield() external onlyController nonReentrant {
        lastClaimAt = block.timestamp;
        _claimStoredAndForward();
    }

    /// @notice Permissionless weekly auto-claim. Caller earns a AVAX bounty.
    ///         Also callable by Chainlink Automation or Gelato via performUpkeep.
    function autoClaimYield() external nonReentrant {
        if (!autoClaimEnabled) revert AutoClaimDisabled();
        uint256 nextAllowed = lastClaimAt + claimInterval;
        if (block.timestamp < nextAllowed) revert TooEarly(nextAllowed);

        lastClaimAt = block.timestamp;
        _claimStoredAndForward();

        uint256 refund = gasRefund;
        if (refund > 0 && address(this).balance >= refund) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert AvaxTransferFailed();
            emit AutoClaimed(msg.sender, refund);
        } else {
            emit AutoClaimed(msg.sender, 0);
        }
    }

    // ── Chainlink Automation ──────────────────────────────────────────────────

    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded =
            autoClaimEnabled &&
            feeDistributors.length > 0 &&
            block.timestamp >= lastClaimAt + claimInterval &&
            voteModule.balanceOf(address(this)) > 0;
    }

    function performUpkeep(bytes calldata) external nonReentrant {
        if (!autoClaimEnabled) revert AutoClaimDisabled();
        uint256 nextAllowed = lastClaimAt + claimInterval;
        if (block.timestamp < nextAllowed) revert TooEarly(nextAllowed);
        lastClaimAt = block.timestamp;
        _claimStoredAndForward();
        emit AutoClaimed(msg.sender, 0);
    }

    // ── FeeDistributor management (controller only) ───────────────────────────

    /// @notice Add a FeeDistributor to the stored auto-claim list
    /// @param fd     FeeDistributor contract address
    /// @param tokens Reward tokens to claim from this distributor
    function addFeeDistributor(address fd, address[] calldata tokens) external onlyController {
        if (fd == address(0)) revert ZeroAddress();
        feeDistributors.push(fd);
        feeDistributorTokens[fd] = tokens;
        emit FeeDistributorAdded(fd);
    }

    /// @notice Update the token list for an existing stored FeeDistributor
    function updateFeeDistributorTokens(address fd, address[] calldata tokens) external onlyController {
        feeDistributorTokens[fd] = tokens;
    }

    /// @notice Remove a FeeDistributor from the stored list by index
    function removeFeeDistributor(uint256 index) external onlyController {
        address fd = feeDistributors[index];
        feeDistributors[index] = feeDistributors[feeDistributors.length - 1];
        feeDistributors.pop();
        delete feeDistributorTokens[fd];
        emit FeeDistributorRemoved(fd);
    }

    // ── Optional PHAR→xPHAR conversion path ──────────────────────────────────

    /// @notice Convert PHAR held by this vault into xPHAR via Pharaoh's native
    ///         mechanism. WARNING: 50% of the PHAR input is burned. Only use
    ///         this if the vault cannot receive xPHAR directly (whitelist issue).
    function convertPharToXPhar(uint256 amount) external onlyController nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 xpharBefore = IERC20(address(xphar)).balanceOf(address(this));
        phar.forceApprove(address(xphar), amount);
        xphar.convertEmissionsToken(amount);
        uint256 received = IERC20(address(xphar)).balanceOf(address(this)) - xpharBefore;
        emit PharConverted(amount, received);
    }

    // ── Auto-claim config (controller only) ───────────────────────────────────

    function setAutoClaimEnabled(bool enabled) external onlyController {
        autoClaimEnabled = enabled;
        emit AutoClaimConfigChanged(enabled, claimInterval, gasRefund);
    }

    function setClaimInterval(uint256 interval) external onlyController {
        if (interval < 1 hours) revert IntervalTooShort();
        claimInterval = interval;
        emit AutoClaimConfigChanged(autoClaimEnabled, interval, gasRefund);
    }

    function setGasRefund(uint256 amount) external onlyController {
        gasRefund = amount;
        emit AutoClaimConfigChanged(autoClaimEnabled, claimInterval, amount);
    }

    function withdrawAvax(uint256 amount, address payable to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert AvaxTransferFailed();
        emit AvaxWithdrawn(amount, to);
    }

    // ── Trustee config (controller only) ─────────────────────────────────────

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

    function rescueToken(address token, uint256 amount, address to) external onlyController nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, amount, to);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function stakedBalance() external view returns (uint256) {
        return voteModule.balanceOf(address(this));
    }

    function unstakedBalance() external view returns (uint256) {
        return IERC20(address(xphar)).balanceOf(address(this));
    }

    function avaxBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function nextClaimAt() external view returns (uint256) {
        return lastClaimAt + claimInterval;
    }

    function getFeeDistributors() external view returns (address[] memory) {
        return feeDistributors;
    }

    function getFeeDistributorTokens(address fd) external view returns (address[] memory) {
        return feeDistributorTokens[fd];
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _claimStoredAndForward() internal {
        if (feeDistributors.length == 0) return;

        address[][] memory tokenLists = new address[][](feeDistributors.length);
        for (uint256 i = 0; i < feeDistributors.length; i++) {
            tokenLists[i] = feeDistributorTokens[feeDistributors[i]];
        }

        _claimAndForward(feeDistributors, tokenLists);
    }

    function _claimAndForward(
        address[] memory _feeDistributors,
        address[][] memory _tokens
    ) internal {
        // Collect unique reward tokens before claim to know what to sweep
        // We snapshot balances before and sweep the difference to yieldReceiver
        uint256 fdLen = _feeDistributors.length;

        // Build flat unique token list for balance snapshot
        address[] memory allTokens = _flatUniqueTokens(_tokens);
        uint256[] memory balsBefore = new uint256[](allTokens.length);
        for (uint256 i = 0; i < allTokens.length; i++) {
            balsBefore[i] = IERC20(allTokens[i]).balanceOf(address(this));
        }

        // Batch claim via Voter
        voter.claimIncentives(address(this), _feeDistributors, _tokens);

        // Sweep all increases to yieldReceiver
        address receiver = yieldReceiver;
        for (uint256 i = 0; i < allTokens.length; i++) {
            uint256 received = IERC20(allTokens[i]).balanceOf(address(this)) - balsBefore[i];
            if (received > 0) {
                IERC20(allTokens[i]).safeTransfer(receiver, received);
            }
        }

        emit YieldClaimed(receiver);
    }

    /// @dev Deduplicate token addresses across multiple fee distributors
    function _flatUniqueTokens(address[][] memory tokenLists) internal pure returns (address[] memory) {
        uint256 total;
        for (uint256 i = 0; i < tokenLists.length; i++) {
            total += tokenLists[i].length;
        }

        address[] memory flat = new address[](total);
        uint256 count;
        for (uint256 i = 0; i < tokenLists.length; i++) {
            for (uint256 j = 0; j < tokenLists[i].length; j++) {
                address t = tokenLists[i][j];
                bool found;
                for (uint256 k = 0; k < count; k++) {
                    if (flat[k] == t) { found = true; break; }
                }
                if (!found) flat[count++] = t;
            }
        }

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) result[i] = flat[i];
        return result;
    }
}
