// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./library/FixedPointMathLib.sol";

/**
 * @notice Interface for interacting with the main WaveFrontToken (Token.sol) contract.
 * @dev Defines functions needed by PreToken: buying initial tokens and opening the public market.
 */
interface IToken {
    /**
     * @notice Buys WaveFrontTokens using quote tokens. Used by PreToken to acquire the initial batch.
     * @param quoteRawIn Amount of quote token to spend (raw).
     * @param minTokenAmtOut Minimum amount of WaveFrontToken to receive (slippage control, set to 0 by PreToken).
     * @param deadline Transaction deadline (set to 0 by PreToken).
     * @param to Address receiving the WaveFrontTokens (PreToken contract address).
     * @param provider Fee provider address (set to address(0) by PreToken).
     * @return amountTokenOut Amount of WaveFrontToken received.
     */
    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 amountTokenOut);

    /**
     * @notice Opens the public market on the WaveFrontToken contract.
     */
    function openMarket() external;
}

/**
 * @title PreToken
 * @notice Handles the initial contribution phase (fair launch) for a WaveFrontToken.
 * @dev Collects quote tokens during a fixed duration, then uses them to buy the initial supply from the Token contract
 *      and opens its market. Contributors can then redeem their proportional share of the purchased tokens.
 * @author heesho <https://github.com/heesho>
 */
contract PreToken is ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /**
     * @notice Duration of the contribution period.
     */
    uint256 constant DURATION = 2 hours;

    /**
     * @notice Address of the quote token used for contributions. Immutable.
     */
    address public immutable quote;
    /**
     * @notice Address of the associated WaveFrontToken (Token.sol) contract. Immutable.
     */
    address public immutable token;
    /**
     * @notice Unix timestamp when the contribution period automatically ends. Immutable.
     */
    uint256 public immutable endTime;

    /**
     * @notice Flag indicating whether the contribution period has ended and the market opening process has run.
     */
    bool public ended = false;
    /**
     * @notice Total amount of WaveFrontToken purchased after the contribution period. Units: tokens (18 dec).
     */
    uint256 public totalTokenAmt;
    /**
     * @notice Total amount of quote tokens contributed during the sale. Units: raw (quote decimals).
     */
    uint256 public totalQuoteRaw;
    /**
     * @notice Mapping from contributor address to their contributed quote token amount. Units: raw (quote decimals).
     */
    mapping(address => uint256) public account_QuoteRaw;

    /**
     * @notice Error: Input amount cannot be zero.
     * @custom:error Input amount for contribution was zero.
     */
    error PreToken__ZeroInput();
    /**
     * @notice Error: Contribution period has ended or `openMarket` has been called.
     * @custom:error The contribution period is closed.
     */
    error PreToken__Closed();
    /**
     * @notice Error: Action attempted before the contribution period has ended.
     * @custom:error The contribution period is still open.
     */
    error PreToken__Open();
    /**
     * @notice Error: Account has no contribution to redeem.
     * @custom:error The specified account did not contribute or has already redeemed.
     */
    error PreToken__NothingToRedeem();

    /**
     * @notice Emitted when a user contributes quote tokens.
     * @param who The address initiating the contribution (`msg.sender`).
     * @param to The address receiving the contribution credit.
     * @param quoteRaw The amount of quote tokens contributed (raw).
     */
    event PreToken__Contributed(address indexed who, address indexed to, uint256 quoteRaw);
    /**
     * @notice Emitted when the market opening process is completed.
     * @param totalTokenAmt Total amount of WaveFrontToken purchased.
     * @param totalQuoteRaw Total amount of quote tokens used for the purchase.
     */
    event PreToken__MarketOpened(uint256 totalTokenAmt, uint256 totalQuoteRaw);
    /**
     * @notice Emitted when a contributor redeems their share of WaveFrontTokens.
     * @param who The address initiating the redemption (`msg.sender`).
     * @param to The address receiving the redeemed tokens.
     * @param tokenAmt The amount of WaveFrontToken redeemed.
     */
    event PreToken__Redeemed(address indexed who, address indexed to, uint256 tokenAmt);

    /**
     * @notice Sets immutable variables and the end time for contributions.
     * @param _token Address of the associated WaveFrontToken (Token.sol).
     * @param _quote Address of the quote token.
     */
    constructor(address _token, address _quote) {
        token = _token;
        quote = _quote;
        endTime = block.timestamp + DURATION;
    }

    /**
     * @notice Allows users to contribute quote tokens during the active contribution period.
     * @dev Reverts if amount is zero, or if the contribution period is over (`ended` or `block.timestamp > endTime`).
     *      Updates contribution totals and transfers quote tokens from the caller.
     * @param to The address to credit the contribution to.
     * @param quoteRaw The amount of quote tokens to contribute (raw).
     */
    function contribute(address to, uint256 quoteRaw) external nonReentrant {
        if (quoteRaw == 0) revert PreToken__ZeroInput();
        if (ended || block.timestamp > endTime) revert PreToken__Closed();

        totalQuoteRaw += quoteRaw;
        account_QuoteRaw[to] += quoteRaw;

        emit PreToken__Contributed(msg.sender, to, quoteRaw);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRaw);
    }

    /**
     * @notice Ends the contribution period, buys WaveFrontTokens, and opens the public market on the Token contract.
     * @dev Can only be called after `endTime`. Reverts if already ended (`ended == true`).
     *      Approves the Token contract to spend collected quote tokens, calls `IToken.buy` to purchase tokens,
     *      stores the total purchased amount, and calls `IToken.openMarket`.
     */
    function openMarket() external nonReentrant {
        // Ensure contribution period time has passed
        if (block.timestamp <= endTime) revert PreToken__Open();
        // Ensure this function hasn't run already
        if (ended) revert PreToken__Closed();
        ended = true;

        // Approve the Token contract to pull the collected quote tokens
        IERC20(quote).safeApprove(token, 0); // Reset approval first
        IERC20(quote).safeApprove(token, totalQuoteRaw);

        // Buy WaveFrontTokens with all collected quote tokens
        totalTokenAmt = IToken(token).buy(totalQuoteRaw, 0, 0, address(this), address(0));

        emit PreToken__MarketOpened(totalTokenAmt, totalQuoteRaw);
        // Signal the Token contract to open its public market
        IToken(token).openMarket();
    }

    /**
     * @notice Allows a contributor to redeem their proportional share of the purchased WaveFrontTokens.
     * @dev Can only be called after `openMarket` has successfully run (`ended == true`).
     *      Reverts if the account has no contribution (`account_QuoteRaw[account] == 0`).
     *      Calculates the token amount based on the contributor's share of total quote contributed.
     *      Transfers the calculated tokens to the contributor and resets their contribution balance.
     * @param account The address whose contribution share is being redeemed.
     */
    function redeem(address account) external nonReentrant {
        // Ensure market opening process has completed
        if (!ended) revert PreToken__Open();
        uint256 quoteRaw = account_QuoteRaw[account];
        // Ensure the account contributed
        if (quoteRaw == 0) revert PreToken__NothingToRedeem();

        // Prevent re-entrancy / double-redeem by zeroing out contribution first
        account_QuoteRaw[account] = 0;
        // Calculate proportional share: userTokens = totalTokens * userQuote / totalQuote
        // Use mulDivDown for safety against precision issues/rounding errors in favor of the protocol.
        uint256 tokenAmt = totalTokenAmt.mulDivDown(quoteRaw, totalQuoteRaw);

        emit PreToken__Redeemed(msg.sender, account, tokenAmt);
        // Transfer the redeemed tokens from this contract to the recipient
        IERC20(token).safeTransfer(account, tokenAmt);
    }

}