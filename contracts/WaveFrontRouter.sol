// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// --- Interface: IWaveFront ---
/**
 * @notice Interface for the WaveFront NFT factory contract.
 * @dev Defines functions needed by the router to create new tokens and view token URIs.
 */
interface IWaveFront {
    function create(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner,
        address _quote,
        address _preTokenFactory,
        uint256 _reserveVirtQuote
    ) external returns (address token, address preToken, uint256 tokenId);

    function tokenURI(uint256 tokenId) external view returns (string memory);
}

// --- Interface: IToken ---
/**
 * @notice Interface for the WaveFrontToken (Token.sol) contract.
 * @dev Defines functions needed by the router to perform swaps and view token details.
 */
interface IToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function wavefront() external view returns (address);
    function wavefrontId() external view returns (uint256);

    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 tokenAmtOut);

    function sell(
        uint256 tokenAmtIn,
        uint256 minQuoteRawOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 quoteRawOut);
}

// --- Interface: IPreToken ---
/**
 * @notice Interface for the PreToken contract.
 * @dev Defines functions needed by the router to handle contributions, redemptions, and market opening.
 */
interface IPreToken {
    function endTime() external view returns (uint256);
    function ended() external view returns (bool);
    function totalQuoteRaw() external view returns (uint256);
    function totalTokenAmt() external view returns (uint256);
    function token() external view returns (address);

    function contribute(address account, uint256 amount) external;
    function redeem(address account) external;
    function openMarket() external;
}

// --- Interface: IWETH ---
/**
 * @notice Interface for Wrapped Ether (WETH) or similar ERC20 wrapper.
 * @dev Defines functions needed for wrapping/unwrapping native currency.
 */
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

// --- Contract: WaveFrontRouter ---
/**
 * @title WaveFrontRouter
 * @notice A central router for interacting with the WaveFront ecosystem (creating tokens, swapping, contributing, redeeming).
 *         Handles token approvals, WETH wrapping/unwrapping, and affiliate tracking.
 * @dev Acts as a convenient entry point for users. Uses ReentrancyGuard and Ownable patterns.
 *      Interacts with WaveFront, Token, PreToken, and quote token contracts.
 * @author heesho <https://github.com/heesho>
 */
contract WaveFrontRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // --- State Variables ---
    /**
     * @notice Address of the main WaveFront NFT factory contract. Immutable.
     */
    address public immutable wavefront;
    /**
     * @notice Address of the PreToken factory contract. Immutable.
     */
    address public immutable preTokenFactory;

    /**
     * @notice Mapping from user address to their designated affiliate address. Set once per user.
     */
    mapping(address => address) public referrals;

    // --- Events ---
    /**
     * @notice Emitted when a new WaveFrontToken is created via the router.
     * @param name Token name.
     * @param symbol Token symbol.
     * @param uri WaveFront NFT URI.
     * @param creator Address that initiated the creation (`msg.sender`).
     * @param quote Address of the quote token.
     * @param token Address of the newly deployed WaveFrontToken.
     * @param preToken Address of the newly deployed PreToken.
     * @param tokenId ID of the corresponding WaveFront NFT.
     * @param initialVirtualQuote Initial virtual quote reserve provided (raw).
     */
    event WaveFrontRouter__Created(
        string name,
        string symbol,
        string uri,
        address indexed creator,
        address quote,
        address token,
        address preToken,
        uint256 tokenId,
        uint256 initialVirtualQuote
    );
    /**
     * @notice Emitted on a successful buy swap via the router.
     * @param token Address of the WaveFrontToken purchased.
     * @param quote Address of the quote token used.
     * @param account Address performing the buy (`msg.sender`).
     * @param affiliate Affiliate address associated with the buyer (if any).
     * @param amountQuoteIn Amount of quote token spent (raw).
     * @param amountTokenOut Amount of WaveFrontToken received.
     */
    event WaveFrontRouter__Buy(address indexed token, address quote, address indexed account, address indexed affiliate, uint256 amountQuoteIn, uint256 amountTokenOut);
    /**
     * @notice Emitted on a successful sell swap via the router.
     * @param token Address of the WaveFrontToken sold.
     * @param quote Address of the quote token received.
     * @param account Address performing the sell (`msg.sender`).
     * @param affiliate Affiliate address associated with the seller (if any).
     * @param amountTokenIn Amount of WaveFrontToken sold.
     * @param amountQuoteOut Amount of quote token received (raw).
     */
    event WaveFrontRouter__Sell(address indexed token, address quote, address indexed account, address indexed affiliate, uint256 amountTokenIn, uint256 amountQuoteOut);
    /**
     * @notice Emitted the first time an affiliate is set for a user account.
     * @param account The user account address.
     * @param affiliate The designated affiliate address.
     */
    event WaveFrontRouter__AffiliateSet(address indexed account, address indexed affiliate);
    /**
     * @notice Emitted when a user contributes to a PreToken via the router.
     * @param token Address of the corresponding WaveFrontToken.
     * @param quote Address of the quote token used.
     * @param account Address performing the contribution (`msg.sender`).
     * @param amountQuote Amount of quote token contributed (raw).
     */
    event WaveFrontRouter__Contribute(address indexed token, address quote, address indexed account, uint256 amountQuote);
    /**
     * @notice Emitted when a user redeems their PreToken contribution via the router.
     * @param token Address of the corresponding WaveFrontToken.
     * @param account Address performing the redemption (`msg.sender`).
     */
    event WaveFrontRouter__Redeem(address indexed token, address indexed account);
    /**
     * @notice Emitted when the router automatically triggers the opening of a PreToken market.
     * @param token Address of the corresponding WaveFrontToken.
     * @param preToken Address of the PreToken whose market was opened.
     */
    event WaveFrontRouter__MarketOpened(address indexed token, address preToken);

    constructor(address _wavefront, address _preTokenFactory) {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
    }

    /**
     * @notice Creates a new WaveFrontToken instance by calling the main WaveFront factory.
     * @param name Name for the new token.
     * @param symbol Symbol for the new token.
     * @param uri Metadata URI for the associated WaveFront NFT.
     * @param quote Address of the quote token for the AMM.
     * @param reserveVirtQuote Initial virtual quote reserve amount (raw).
     * @return token Address of the newly deployed WaveFrontToken.
     * @return preToken Address of the newly deployed PreToken.
     * @return tokenId ID of the new WaveFront NFT representing the launch.
     */
    function createWaveFrontToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address quote,
        uint256 reserveVirtQuote
    ) external nonReentrant returns (address token, address preToken, uint256 tokenId) {
        (token, preToken, tokenId) = IWaveFront(wavefront).create(
            name,
            symbol,
            uri,
            msg.sender,
            quote,
            preTokenFactory,
            reserveVirtQuote
        );

        emit WaveFrontRouter__Created(name, symbol, uri, msg.sender, quote, token, preToken, tokenId, reserveVirtQuote);
    }

    /**
     * @notice Buys WaveFrontTokens using native currency (e.g., ETH). Wraps ETH to WETH (quote).
     * @dev Requires the quote token address (`IToken(token).quote()`) to be a WETH implementation. Uses `nonReentrant`.
     * @param token The address of the WaveFrontToken to buy.
     * @param affiliate The affiliate address to associate with this user (if not already set).
     * @param minAmountTokenOut Minimum amount of WaveFrontToken to receive (slippage control).
     * @param expireTimestamp Transaction deadline timestamp.
     */
    function buyWithNative(
        address token,
        address affiliate,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        _setAffiliate(affiliate);

        address quote = IToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        _safeApprove(quote, token, msg.value);

        uint256 amountTokenOut = IToken(token).buy(msg.value, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Buy(token, quote, msg.sender, affiliate, msg.value, amountTokenOut);
    }

    /**
     * @notice Buys WaveFrontTokens using a pre-approved quote token. Uses `nonReentrant`.
     * @param token The address of the WaveFrontToken to buy.
     * @param affiliate The affiliate address to associate with this user (if not already set).
     * @param amountQuoteIn The amount of quote token to spend (raw).
     * @param minAmountTokenOut Minimum amount of WaveFrontToken to receive (slippage control).
     * @param expireTimestamp Transaction deadline timestamp.
     */
    function buyWithQuote(
        address token,
        address affiliate,
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external nonReentrant {
         require(amountQuoteIn > 0, "Router: Quote amount required");
        _setAffiliate(affiliate);

        address quote = IToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        _safeApprove(quote, token, amountQuoteIn);

        uint256 amountTokenOut = IToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Buy(token, quote, msg.sender, affiliate, amountQuoteIn, amountTokenOut);
    }

    /**
     * @notice Sells WaveFrontTokens for native currency (e.g., ETH). Unwraps WETH (quote). Uses `nonReentrant`.
     * @dev Requires the quote token address (`IToken(token).quote()`) to be a WETH implementation.
     * @param token The address of the WaveFrontToken to sell.
     * @param affiliate The affiliate address to associate with this user (if not already set).
     * @param amountTokenIn The amount of WaveFrontToken to sell.
     * @param minAmountQuoteOut Minimum amount of quote token (WETH) to receive (raw, slippage control).
     * @param expireTimestamp Transaction deadline timestamp.
     */
    function sellToNative(
        address token,
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);

        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        address quote = IToken(token).quote();
        IWETH(quote).withdraw(amountQuoteOut);
        (bool success, ) = msg.sender.call{value: amountQuoteOut}("");
        require(success, "Router: Failed to send ETH");

        emit WaveFrontRouter__Sell(token, quote, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }

    /**
     * @notice Sells WaveFrontTokens for the quote token. Uses `nonReentrant`.
     * @param token The address of the WaveFrontToken to sell.
     * @param affiliate The affiliate address to associate with this user (if not already set).
     * @param amountTokenIn The amount of WaveFrontToken to sell.
     * @param minAmountQuoteOut Minimum amount of quote token to receive (raw, slippage control).
     * @param expireTimestamp Transaction deadline timestamp.
     */
    function sellToQuote(
        address token,
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        address quote = IToken(token).quote();
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Sell(token, quote, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }

    /**
     * @notice Contributes native currency to a PreToken sale. Wraps ETH to WETH (quote). Uses `nonReentrant`.
     * @dev Requires the quote token address (`IToken(token).quote()`) to be a WETH implementation.
     *      Checks if the contribution period end time has passed and triggers market opening if needed.
     * @param token The address of the WaveFrontToken associated with the PreToken.
     */
    function contributeWithNative(address token) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        address preTokenAddr = IToken(token).preToken();

        address quote = IToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        _safeApprove(quote, preTokenAddr, msg.value);

        IPreToken(preTokenAddr).contribute(msg.sender, msg.value);

        emit WaveFrontRouter__Contribute(token, quote, msg.sender, msg.value);
        _checkAndOpenMarket(preTokenAddr);
    }

    /**
     * @notice Contributes quote tokens to a PreToken sale. Uses `nonReentrant`.
     * @dev Checks if the contribution period end time has passed and triggers market opening if needed.
     * @param token The address of the WaveFrontToken associated with the PreToken.
     * @param amountQuoteIn The amount of quote token to contribute (raw).
     */
    function contributeWithQuote(address token, uint256 amountQuoteIn) external nonReentrant {
        require(amountQuoteIn > 0, "Router: Quote amount required");
        address preTokenAddr = IToken(token).preToken();

        address quote = IToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);   
        _safeApprove(quote, preTokenAddr, amountQuoteIn);

        IPreToken(preTokenAddr).contribute(msg.sender, amountQuoteIn);

        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Contribute(token, quote, msg.sender, amountQuoteIn);
        _checkAndOpenMarket(preTokenAddr);
    }

    /**
     * @notice Redeems a user's contributed tokens from a PreToken sale. Uses `nonReentrant`.
     * @dev Checks if the contribution period end time has passed and triggers market opening if needed.
     *      Requires the PreToken market to have been opened (`ended == true`).
     * @param token The address of the WaveFrontToken associated with the PreToken.
     */
    function redeem(address token) external nonReentrant {
        address preTokenAddr = IToken(token).preToken();
        _checkAndOpenMarket(preTokenAddr);

        require(IPreToken(preTokenAddr).ended(), "Router: Market not open yet");
        IPreToken(preTokenAddr).redeem(msg.sender);

        emit WaveFrontRouter__Redeem(token, msg.sender);
    }

    /**
     * @dev Internal function to set the affiliate for `msg.sender` if not already set. Emits event.
     * @param affiliate The proposed affiliate address.
     */
    function _setAffiliate(address affiliate) internal {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }
    }

    /**
     * @dev Internal utility function to safely approve a token spender. Resets approval to 0 first.
     * @param token The address of the ERC20 token.
     * @param spender The address to approve.
     * @param amount The amount to approve.
     */
    function _safeApprove(address token, address spender, uint256 amount) internal {
        IERC20(token).safeApprove(spender, 0);
        IERC20(token).safeApprove(spender, amount);
    }

    /**
     * @dev Internal function to check if a PreToken's contribution period has ended and trigger market opening if so.
     * @param preTokenAddr The address of the PreToken contract to check.
     */
    function _checkAndOpenMarket(address preTokenAddr) internal {
        IPreToken preToken = IPreToken(preTokenAddr);
        if (block.timestamp > preToken.endTime() && !preToken.ended()) {
            preToken.openMarket();
            emit WaveFrontRouter__MarketOpened(IPreToken(preTokenAddr).token(), preTokenAddr);
        }
    }

    /**
     * @notice Allows the router to receive native currency (e.g., for WETH unwrapping in `sellToNative`).
     */
    receive() external payable {}

    /**
     * @notice Owner function to withdraw any accidentally sent ERC20 tokens from the router contract. Only callable by owner.
     * @param _token The address of the ERC20 token to withdraw.
     * @param _to The address to send the withdrawn tokens to.
     */
    function withdrawStuckTokens(address _token, address _to) external onlyOwner {
        require(_to != address(0), "Router: Invalid recipient");
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Router: No balance");
        IERC20(_token).safeTransfer(_to, balance);
    }

     /**
      * @notice Owner function to withdraw any accidentally sent native currency from the router contract. Only callable by owner.
      * @param _to The address to send the withdrawn native currency to.
      */
     function withdrawStuckNative(address payable _to) external onlyOwner {
         require(_to != address(0), "Router: Invalid recipient");
         uint256 balance = address(this).balance;
         require(balance > 0, "Router: No balance");
         (bool success, ) = _to.call{value: balance}("");
         require(success, "Router: Failed to send ETH");
     }
}