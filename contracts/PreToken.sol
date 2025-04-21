// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./library/FixedPointMathLib.sol";

/**
 * @notice Interface for the Token, defining functions needed by PreToken.
 */
interface IToken {
    function buy(
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut, 
        uint256 expireTimestamp, 
        address to, 
        address provider
    ) external returns (uint256 amountTokenOut);

    function openMarket() external;
}

/**
 * @title PreToken
 * @author heesho
 * @notice Manages the initial distribution phase for a Token (Fair Launch).
 * Collects contributions in a quote token during a fixed duration.
 * After the duration, performs a single buy on the associated Token
 * to establish initial liquidity, opens the Token market, and allows contributors to redeem their share.
 */
contract PreToken is ReentrancyGuard { 
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    /// @notice Duration of the contribution phase.
    uint256 constant DURATION = 2 hours;

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    /// @notice The ERC20 token used for contributions (e.g., WETH, USDC).
    address public immutable quote;
    /// @notice The address of the associated Token being launched.
    address public immutable token;

    /// @notice Timestamp marking the end of the contribution period.
    uint256 public immutable endTimestamp;
    /// @notice Flag indicating if the pre-token phase has concluded and the main Token market is open.
    bool public ended = false;

    /// @notice Stores the total balance of Tokens received after the initial buy, used for redemption calculations.
    uint256 public totalTokenBalance; 
    /// @notice Aggregate amount of quote tokens contributed during the pre-token phase.
    uint256 public totalQuoteContributed; 
    /// @notice Tracks the amount of quote tokens contributed by each participant.
    mapping(address => uint256) public account_QuoteContributed; 

    /*----------  ERRORS ------------------------------------------------*/

    /// @notice Raised when an operation receives zero amount as input.
    error PreToken__ZeroInput();
    /// @notice Raised when trying to contribute or open the market after it has already concluded.
    error PreToken__Concluded();
    /// @notice Raised when trying to open the market or redeem before the contribution period ends.
    error PreToken__InProgress();
    /// @notice Raised when attempting to redeem without having made a contribution.
    error PreToken__NotEligible();
    /// @notice Raised if attempting division by zero during redemption calculation (means no contributions were made).
    error PreToken__NoContributions(); 

    /*----------  EVENTS ------------------------------------------------*/

    /// @notice Emitted when a user successfully contributes quote tokens.
    event PreToken__Contributed(address indexed token, address indexed account, uint256 amount);
    /// @notice Emitted when the main Token market is opened after the pre-token phase.
    event PreToken__MarketOpened(address indexed token, uint256 totalTokenBalance, uint256 totalQuoteContributed);
    /// @notice Emitted when a contributor redeems their share of Tokens.
    event PreToken__Redeemed(address indexed token, address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @notice Sets up the PreToken for a specific Token launch.
     * @param _token The address of the Token being launched.
     * @param _quote Address of the quote token for contributions.
     */
    constructor(address _token, address _quote) {
        token = _token; 
        quote = _quote; 
        endTimestamp = block.timestamp + DURATION;
    }

    /**
     * @notice Allows users to contribute quote tokens during the active pre-token phase.
     * @param account The account credited with the contribution.
     * @param amount The amount of quote tokens to contribute.
     */
    function contribute(address account, uint256 amount) external nonReentrant {
        if (amount == 0) revert PreToken__ZeroInput();
        if (ended) revert PreToken__Concluded();
        if (block.timestamp > endTimestamp) revert PreToken__Concluded(); 
        totalQuoteContributed += amount;
        account_QuoteContributed[account] += amount;
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amount);
        emit PreToken__Contributed(token, account, amount);
    }

    /**
     * @notice Concludes the pre-token phase, performs the initial buy on the Token, and enables public trading on the Token.
     * Can only be called after the endTimestamp has passed.
     */
    function openMarket() external nonReentrant { // Added nonReentrant based on usage pattern
        if (block.timestamp <= endTimestamp) revert PreToken__InProgress();
        if (ended) revert PreToken__Concluded();
        ended = true;

        // Approve the Token contract to pull the collected quote tokens for the initial buy.
        IERC20(quote).safeApprove(token, 0); // Best practice: reset approval first
        IERC20(quote).safeApprove(token, totalQuoteContributed);

        // Perform the single buy operation on the associated Token contract.
        // `minAmountTokenOut` is 0 as this is the first buy, setting the price.
        // `expireTimestamp` is 0 for no deadline.
        // `to` is this contract (PreToken) to hold the tokens for redemption.
        // `provider` is address(0) as there's no fee provider for this initial buy.
        uint256 boughtAmount = IToken(token).buy(totalQuoteContributed, 0, 0, address(this), address(0));
        
        // Record the amount of Tokens received for later redemption distribution.
        totalTokenBalance = boughtAmount; // Use return value directly
        
        // Signal the Token contract that its market is now open.
        IToken(token).openMarket();

        emit PreToken__MarketOpened(token, totalTokenBalance, totalQuoteContributed);
    }

    /**
     * @notice Allows contributors to claim their proportional share of Tokens after the market opens.
     * @param account The account redeeming their contributed amount.
     */
    function redeem(address account) external nonReentrant {
        if (!ended) revert PreToken__InProgress();
        uint256 contribution = account_QuoteContributed[account];
        if (contribution == 0) revert PreToken__NotEligible();

        account_QuoteContributed[account] = 0; // Prevent re-entrancy / double redemption
        
        if (totalQuoteContributed == 0) revert PreToken__NoContributions(); 
        
        // Calculate the user's share of the Tokens bought in openMarket.
        uint256 amountToken = totalTokenBalance.mulWadDown(contribution).divWadDown(totalQuoteContributed);
        
        IERC20(token).safeTransfer(account, amountToken); 
        emit PreToken__Redeemed(token, account, amountToken);
    }
} 