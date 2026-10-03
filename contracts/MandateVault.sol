// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MandateVault
/// @notice Scoped, vetoable payments for autonomous agents.
///
/// A human (the *owner*) funds a **mandate**: a budget an agent key may spend, bounded by a
/// per-purchase cap, an expiry, and an optional merchant allowlist. The agent never touches
/// funds directly. Each purchase becomes a **pending payment** that settles only after a
/// *veto window*. Until then the owner can veto it and the money returns to the mandate.
///
/// The worst case for a compromised or misbehaving agent is bounded by the budget, the cap,
/// and the window, and the owner can revoke the mandate or rotate the agent key at any time.
contract MandateVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Pending,
        Released,
        Vetoed
    }

    struct Mandate {
        address owner;
        address agent;
        IERC20 token;
        uint128 budget; // total escrowed for this mandate (spent + reserved + available)
        uint128 spent; // settled to merchants
        uint128 reserved; // locked in pending payments
        uint128 perTxCap;
        uint64 vetoWindow; // seconds a payment waits before it can settle
        uint64 expiry; // unix seconds; agent cannot spend after this
        bool revoked;
        bool allowlistOnly;
        string purpose;
    }

    struct Payment {
        uint256 mandateId;
        address merchant;
        uint128 amount;
        uint64 createdAt;
        uint64 releaseAt;
        Status status;
        string memo;
    }

    struct MerchantStats {
        uint64 released;
        uint64 vetoed;
        uint128 volume;
    }

    uint256 public constant MAX_MEMO_BYTES = 280;
    uint256 public constant MAX_PURPOSE_BYTES = 140;
    uint64 public constant MIN_WINDOW = 1 minutes;
    uint64 public constant MAX_WINDOW = 7 days;

    uint256 public mandateCount;
    uint256 public paymentCount;

    mapping(uint256 => Mandate) private _mandates;
    mapping(uint256 => Payment) private _payments;
    mapping(uint256 => mapping(address => bool)) public merchantAllowed;
    mapping(address => MerchantStats) public merchantStats;

    mapping(address => uint256[]) private _mandatesByOwner;
    mapping(address => uint256[]) private _mandatesByAgent;
    mapping(uint256 => uint256[]) private _paymentsByMandate;
    mapping(address => uint256[]) private _paymentsByMerchant;

    event MandateCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed agent,
        address token,
        uint256 budget,
        uint256 perTxCap,
        uint64 vetoWindow,
        uint64 expiry,
        bool allowlistOnly,
        string purpose
    );
    event MandateToppedUp(uint256 indexed id, uint256 amount, uint256 newBudget);
    event MandateRevoked(uint256 indexed id, uint256 refunded);
    event AgentRotated(uint256 indexed id, address indexed oldAgent, address indexed newAgent);
    event MerchantSet(uint256 indexed id, address indexed merchant, bool allowed);
    event PaymentProposed(
        uint256 indexed paymentId,
        uint256 indexed mandateId,
        address indexed merchant,
        uint256 amount,
        uint64 releaseAt,
        string memo
    );
    event PaymentReleased(uint256 indexed paymentId, address indexed merchant, uint256 amount, bool early);
    event PaymentVetoed(uint256 indexed paymentId, uint256 indexed mandateId, uint256 amount);

    error NotOwner();
    error NotAgent();
    error BadParams();
    error MandateInactive();
    error OverCap();
    error OverBudget();
    error MerchantNotAllowed();
    error NotPending();
    error WindowClosed();
    error WindowOpen();
    error TextTooLong();

    modifier onlyOwner(uint256 id) {
        if (_mandates[id].owner != msg.sender) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // Owner actions
    // ---------------------------------------------------------------------

    /// @notice Create and fund a mandate. Caller must have approved `budget` of `token` first.
    function createMandate(
        address agent,
        IERC20 token,
        uint128 budget,
        uint128 perTxCap,
        uint64 vetoWindow,
        uint64 expiry,
        string calldata purpose,
        address[] calldata merchants
    ) external nonReentrant returns (uint256 id) {
        if (
            agent == address(0) || address(token) == address(0) || budget == 0 || perTxCap == 0 || perTxCap > budget
                || vetoWindow < MIN_WINDOW || vetoWindow > MAX_WINDOW || expiry <= block.timestamp
        ) revert BadParams();
        if (bytes(purpose).length > MAX_PURPOSE_BYTES) revert TextTooLong();

        id = ++mandateCount;
        Mandate storage m = _mandates[id];
        m.owner = msg.sender;
        m.agent = agent;
        m.token = token;
        m.budget = budget;
        m.perTxCap = perTxCap;
        m.vetoWindow = vetoWindow;
        m.expiry = expiry;
        m.allowlistOnly = merchants.length > 0;
        m.purpose = purpose;

        _mandatesByOwner[msg.sender].push(id);
        _mandatesByAgent[agent].push(id);

        for (uint256 i; i < merchants.length; ++i) {
            merchantAllowed[id][merchants[i]] = true;
            emit MerchantSet(id, merchants[i], true);
        }

        token.safeTransferFrom(msg.sender, address(this), budget);
        emit MandateCreated(
            id, msg.sender, agent, address(token), budget, perTxCap, vetoWindow, expiry, m.allowlistOnly, purpose
        );
    }

    function topUp(uint256 id, uint128 amount) external nonReentrant onlyOwner(id) {
        Mandate storage m = _mandates[id];
        if (m.revoked) revert MandateInactive();
        m.budget += amount;
        m.token.safeTransferFrom(msg.sender, address(this), amount);
        emit MandateToppedUp(id, amount, m.budget);
    }

    /// @notice Allow or remove a merchant. Enabling any merchant turns the allowlist on.
    function setMerchant(uint256 id, address merchant, bool allowed) external onlyOwner(id) {
        merchantAllowed[id][merchant] = allowed;
        if (allowed) _mandates[id].allowlistOnly = true;
        emit MerchantSet(id, merchant, allowed);
    }

    /// @notice Swap the agent key, e.g. after a suspected leak. Pending payments stay vetoable.
    function rotateAgent(uint256 id, address newAgent) external onlyOwner(id) {
        if (newAgent == address(0)) revert BadParams();
        Mandate storage m = _mandates[id];
        address old = m.agent;
        m.agent = newAgent;
        _mandatesByAgent[newAgent].push(id);
        emit AgentRotated(id, old, newAgent);
    }

    /// @notice Stop all new spending and refund everything not already locked in a pending
    /// payment. Pending payments stay vetoable; vetoed funds are refunded straight to the owner.
    function revoke(uint256 id) external nonReentrant onlyOwner(id) {
        Mandate storage m = _mandates[id];
        if (m.revoked) revert MandateInactive();
        m.revoked = true;
        uint128 refund = m.budget - m.spent - m.reserved;
        m.budget -= refund;
        if (refund > 0) m.token.safeTransfer(m.owner, refund);
        emit MandateRevoked(id, refund);
    }

    /// @notice Veto a pending payment inside its window. Funds return to the mandate
    /// (or to the owner if the mandate was revoked).
    function veto(uint256 paymentId) external nonReentrant {
        Payment storage p = _payments[paymentId];
        Mandate storage m = _mandates[p.mandateId];
        if (m.owner != msg.sender) revert NotOwner();
        if (p.status != Status.Pending) revert NotPending();
        if (block.timestamp >= p.releaseAt) revert WindowClosed();

        p.status = Status.Vetoed;
        m.reserved -= p.amount;
        merchantStats[p.merchant].vetoed++;

        if (m.revoked) {
            m.budget -= p.amount;
            m.token.safeTransfer(m.owner, p.amount);
        }
        emit PaymentVetoed(paymentId, p.mandateId, p.amount);
    }

    /// @notice Owner fast-forwards a payment they are happy with.
    function approve(uint256 paymentId) external nonReentrant {
        Payment storage p = _payments[paymentId];
        if (_mandates[p.mandateId].owner != msg.sender) revert NotOwner();
        _settle(paymentId, true);
    }

    // ---------------------------------------------------------------------
    // Agent action
    // ---------------------------------------------------------------------

    /// @notice Propose a payment. Reserves the amount and starts the veto window.
    function spend(uint256 id, address merchant, uint128 amount, string calldata memo)
        external
        nonReentrant
        returns (uint256 paymentId)
    {
        Mandate storage m = _mandates[id];
        if (m.agent != msg.sender) revert NotAgent();
        if (m.revoked || block.timestamp >= m.expiry) revert MandateInactive();
        if (merchant == address(0) || amount == 0) revert BadParams();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert TextTooLong();
        if (amount > m.perTxCap) revert OverCap();
        if (amount > m.budget - m.spent - m.reserved) revert OverBudget();
        if (m.allowlistOnly && !merchantAllowed[id][merchant]) revert MerchantNotAllowed();

        m.reserved += amount;
        paymentId = ++paymentCount;
        uint64 releaseAt = uint64(block.timestamp) + m.vetoWindow;
        _payments[paymentId] = Payment({
            mandateId: id,
            merchant: merchant,
            amount: amount,
            createdAt: uint64(block.timestamp),
            releaseAt: releaseAt,
            status: Status.Pending,
            memo: memo
        });
        _paymentsByMandate[id].push(paymentId);
        _paymentsByMerchant[merchant].push(paymentId);
        emit PaymentProposed(paymentId, id, merchant, amount, releaseAt, memo);
    }

    // ---------------------------------------------------------------------
    // Settlement (permissionless)
    // ---------------------------------------------------------------------

    /// @notice Pay the merchant once the window has elapsed. Anyone may call.
    function release(uint256 paymentId) external nonReentrant {
        _settle(paymentId, false);
    }

    function _settle(uint256 paymentId, bool early) internal {
        Payment storage p = _payments[paymentId];
        if (p.status != Status.Pending) revert NotPending();
        if (!early && block.timestamp < p.releaseAt) revert WindowOpen();

        Mandate storage m = _mandates[p.mandateId];
        p.status = Status.Released;
        m.reserved -= p.amount;
        m.spent += p.amount;

        MerchantStats storage s = merchantStats[p.merchant];
        s.released++;
        s.volume += p.amount;

        m.token.safeTransfer(p.merchant, p.amount);
        emit PaymentReleased(paymentId, p.merchant, p.amount, early);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getMandate(uint256 id) external view returns (Mandate memory) {
        return _mandates[id];
    }

    function getPayment(uint256 id) external view returns (Payment memory) {
        return _payments[id];
    }

    function available(uint256 id) external view returns (uint256) {
        Mandate storage m = _mandates[id];
        return m.budget - m.spent - m.reserved;
    }

    function mandatesOfOwner(address a) external view returns (uint256[] memory) {
        return _mandatesByOwner[a];
    }

    function mandatesOfAgent(address a) external view returns (uint256[] memory) {
        return _mandatesByAgent[a];
    }

    function paymentsOfMandate(uint256 id) external view returns (uint256[] memory) {
        return _paymentsByMandate[id];
    }

    function paymentsOfMerchant(address a) external view returns (uint256[] memory) {
        return _paymentsByMerchant[a];
    }
}
