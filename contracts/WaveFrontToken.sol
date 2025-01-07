// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./library/FixedPointMathLib.sol";

/**
 * @title WaveFrontToken
 * @author heesho
 *
 * The WaveFrontToken (WFT) contract is designed for creating a new type of ERC20 token governed 
 * by a bonding curve. The bonding curve lives in the token and ensures liquidity at all price ranges 
 * with a constant product, facilitating dynamic pricing based on market demand. WaveFrontTokens are initially
 * launched via the WaveFrontPreToken contract to ensure a bot-resistant and fair distribution. Once launched, 
 * WaveFrontTokens can be traded or used as collateral for borrowing.
 *
 * WaveFrontToken: 
 * The primary asset with a built-in bonding curve, enabling buy/sell transactions
 * with price adjustments based on supply. A virtual bonding curve is used with a constant product
 * formula (XY = K). The WFT can be bought, sold, allows for liqduition free borrowing against held 
 * WFTs and fee accumulation for WFT holders. It also uses a bonding curve shift to adjust the 
 * reserves based on the maxSupply of WFT. Buy and sell transactions incur a 2% fee, divided among
 * the protocol treasury (12.5%), status holder (12.5%), creator (12.5%), a provider (12.5% optional),
 * For buys the remainder (50%) is used to shift the bonding curve (increasing the quote reserves). 
 * For sells the remainder (50%) is used to shift the bonding curve (decreasing the WFT reserves). 
 * Both cases increase the floor price, market price, and borrowing capacity of the WFT. The WFT
 * The WFT does not need to be deposited to borrow against it, this can be done from the user's wallet. 
 * Borrowing however will not let the user transfer the WFT if the collateral requirement is not met.

 * PreWaveFrontToken: 
 * Manages the initial distribution phase, collecting quote tokens (e.g., wETH, USDC, etc.) and
 * transitioning to the open market phase for the WFT, ensuring a fair launch. Everyone
 * that participates in the preWFT phase receives WFTs at the same price.
 *
 */

contract PreWaveFrontToken is ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant DURATION = 1800; // Duration in seconds for the pre-market phase

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable quote; // Address of the quote token (e.g., wETH, USDC, etc.)
    address public immutable token; // Address of the wavefront token deployed

    uint256 public immutable endTimestamp; // Timestamp when the pre-market phase ends
    bool public ended = false; // Flag indicating if the pre-market phase has ended

    uint256 public totalTokenBalance; // Total balance of the wavefront tokens distributed after pre-market
    uint256 public totalQuoteContributed; // Total quote tokens contributed during the pre-market phase
    mapping(address => uint256) public account_QuoteContributed; // Quote tokens contributed by each account

    /*----------  ERRORS ------------------------------------------------*/

    error PreWaveFrontToken__ZeroInput();
    error PreWaveFrontToken__Concluded();
    error PreWaveFrontToken__InProgress();
    error PreWaveFrontToken__NotEligible();

    /*----------  EVENTS ------------------------------------------------*/

    event PreWaveFrontToken__Contributed(address indexed token, address indexed account, uint256 amount);
    event PreWaveFrontToken__MarketOpened(address indexed token, uint256 totalTokenBalance, uint256 totalQuoteContributed);
    event PreWaveFrontToken__Redeemed(address indexed token, address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the PreWaveFrontToken contract.
     * @param _quote Address of the quote token, typically a stablecoin or native cryptocurrency like wETH, USDC, etc.
     */
    constructor(address _quote) {
        quote = _quote;
        token = msg.sender;
        endTimestamp = block.timestamp + DURATION;
    }

    /**
     * @dev Allows users to contribute quote tokens during the pre-market phase.
     * @param account The account making the contribution.      
     * @param amount The amount of quote tokens to contribute.
     */
    function contribute(address account, uint256 amount) external nonReentrant {
        if (amount == 0) revert PreWaveFrontToken__ZeroInput();
        if (ended) revert PreWaveFrontToken__Concluded();
        totalQuoteContributed += amount;
        account_QuoteContributed[account] += amount;
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amount);
        emit PreWaveFrontToken__Contributed(token, account, amount);
    }

    /**
     * @dev Opens the market for the WaveFrontToken, ending the pre-market phase.
     * Can only be called after the pre-market phase duration has ended.
     */
    function openMarket() external {
        if (endTimestamp > block.timestamp) revert PreWaveFrontToken__InProgress();
        if (ended) revert PreWaveFrontToken__Concluded();
        ended = true;
        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, totalQuoteContributed);
        WaveFrontToken(token).buy(totalQuoteContributed, 0, 0, address(this), address(0));
        totalTokenBalance = IERC20(token).balanceOf(address(this));
        WaveFrontToken(token).openMarket();
        emit PreWaveFrontToken__MarketOpened(token, totalTokenBalance, totalQuoteContributed);
    }

    /**
     * @dev Allows users who contributed during the pre-market phase to redeem their new WaveFrontTokens.
     * @param account The account redeeming its contribution for new WaveFrontTokens.
     */
    function redeem(address account) external nonReentrant {
        if (!ended) revert PreWaveFrontToken__InProgress();
        uint256 contribution = account_QuoteContributed[account];
        if (contribution == 0) revert PreWaveFrontToken__NotEligible();
        account_QuoteContributed[account] = 0;
        uint256 amountToken = totalTokenBalance.mulWadDown(contribution).divWadDown(totalQuoteContributed);
        IERC20(token).safeTransfer(account, amountToken);
        emit PreWaveFrontToken__Redeemed(token, account, amountToken);
    }
    
}

contract WaveFrontToken is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard, Ownable {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18; // Precision for math
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; // Initial supply of the WaveFrontToken
    uint256 public constant FEE = 100; // 1% fee rate for buy/sell operations
    uint256 public constant FEE_AMOUNT = 1500; // Additional fee parameters for ditributing to stakeholders
    uint256 public constant DIVISOR = 10000; // Divisor for fee calculations

    /*----------  STATE VARIABLES  --------------------------------------*/

    // token state
    address public immutable factory; // Address of the factory contract
    address public immutable quote; // Address of the quote token (e.g., wETH, USDC, etc.)
    address public immutable preToken; // Address of the PreWaveFrontToken contract
    uint256 public maxSupply = INITIAL_SUPPLY; // Maximum supply of the WFT, can only decrease
    bool public open = false; // Flag indicating if the market is open, only the preToken can open it
    string public uri; // URI for the metadata

    // bonding curve state
    uint256 public reserveRealQuote; // real quote reserve of the token
    uint256 public reserveVirtQuote; // virtual quote reserve of the token
    uint256 public reserveToken = INITIAL_SUPPLY; // token reserve initially set to the max supply

    // credit state
    uint256 public totalDebt; // Total debt of the WaveFrontToken
    mapping(address => uint256) public account_Debt; // Debt of each account

    // treasury state
    address public treasury; // treasury address

    /*----------  ERRORS ------------------------------------------------*/

    error WaveFrontToken__ZeroInput();
    error WaveFrontToken__Expired();
    error WaveFrontToken__SlippageToleranceExceeded();
    error WaveFrontToken__MarketNotOpen();
    error WaveFrontToken__NotAuthorized();
    error WaveFrontToken__CollateralRequirement();
    error WaveFrontToken__CreditLimit();
    error WaveFrontToken__InvalidShift();

    /*----------  ERRORS ------------------------------------------------*/

    event WaveFrontToken__Swap(address indexed from, uint256 amountQuoteIn, uint256 amountTokenIn, uint256 amountQuoteOut, uint256 amountTokenOut, address indexed to);
    event WaveFrontToken__ProviderFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    event WaveFrontToken__TreasuryFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    event WaveFrontToken__ProtocolFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    event WaveFrontToken__Burn(address indexed account, uint256 amountToken);
    event WaveFrontToken__Heal(address indexed account, uint256 amountQuote);
    event WaveFrontToken__ReserveTokenBurn(uint256 amountToken);
    event WaveFrontToken__ReserveVirtQuoteHeal(uint256 amountQuote);
    event WaveFrontToken__ReserveRealQuoteHeal(uint256 amountQuote);
    event WaveFrontToken__Borrow(address indexed account, uint256 amountQuote);
    event WaveFrontToken__Repay(address indexed account, uint256 amountQuote);
    event WaveFrontToken__MarketOpened();
    event WaveFrontToken__TreasurySet(address indexed oldTreasury, address indexed newTreasury);

    /*----------  MODIFIERS  --------------------------------------------*/

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert WaveFrontToken__Expired();
        _;
    }

    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert WaveFrontToken__ZeroInput();
        _;
    }
    
    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the WaveFrontToken contract with initial settings.
     * @param _name Name of the WaveFrontToken.
     * @param _symbol Symbol of the WaveFrontToken.
     * @param _uri URI for WaveFrontToken metadata.
     * @param _quote Address of the quote token (e.g., wETH, USDC, etc.)
     * @param _reserveVirtQuote Initial virtual reserve of the quote token
     */
    constructor(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _treasury,
        address _quote,
        uint256 _reserveVirtQuote
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        uri = _uri;
        quote = _quote;
        reserveVirtQuote = _reserveVirtQuote;
        factory = msg.sender;
        treasury = _treasury;
        preToken = address(new PreWaveFrontToken(_quote));
    }

    /**
     * @dev Executes a WaveFrontToken purchase operation within the bonding curve mechanism.
     * Calculates the necessary fees, updates reserves, and mints the WaveFrontTokens to the buyer.
     * @param amountQuoteIn The amount of quote tokens provided for the purchase.
     * @param minAmountTokenOut The minimum amount of WaveFrontTokens expected to be received, for slippage control.
     * @param expireTimestamp Timestamp after which the transaction is not valid.
     * @param to The address receiving the purchased tokens.
     * @param provider The address that may receive a portion of the fee, if applicable.
     */
    function buy(
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut, 
        uint256 expireTimestamp, 
        address to, 
        address provider
    ) 
        external 
        nonReentrant
        notZeroInput(amountQuoteIn)
        notExpired(expireTimestamp) 
    {
        if (!open && msg.sender != preToken) revert WaveFrontToken__MarketNotOpen();

        uint256 feeQuote = amountQuoteIn * FEE / DIVISOR;
        uint256 newReserveQuote = reserveVirtQuote + reserveRealQuote + amountQuoteIn - feeQuote;
        uint256 newReserveToken = (reserveVirtQuote + reserveRealQuote).mulWadUp(reserveToken).divWadUp(newReserveQuote);
        uint256 amountTokenOut = reserveToken - newReserveToken;

        if (amountTokenOut < minAmountTokenOut) revert WaveFrontToken__SlippageToleranceExceeded();

        reserveRealQuote = newReserveQuote - reserveVirtQuote;
        reserveToken = newReserveToken;

        emit WaveFrontToken__Swap(msg.sender, amountQuoteIn, 0, 0, amountTokenOut, to);

        feeQuote = _processBuyFees(feeQuote, provider);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        _mint(to, amountTokenOut);
        _healQuoteReserves(feeQuote);
    }

    /**
     * @dev Executes a WaveFrontToken sale operation within the bonding curve mechanism.
     * A fee is applied to the sale, which is then burned, reducing the total supply and adjusting the bonding curve.
     * @param amountTokenIn The amount of this WaveFrontToken being sold.
     * @param minAmountQuoteOut The minimum amount of quote token expected in return, for slippage control.
     * @param expireTimestamp Timestamp after which the transaction is not valid.
     * @param to The address receiving the quote token from the sale.
     * @param provider The address that may receive a portion of the fee, if applicable.
     */
    function sell(
        uint256 amountTokenIn, 
        uint256 minAmountQuoteOut, 
        uint256 expireTimestamp, 
        address to, 
        address provider
    ) 
        external
        nonReentrant
        notZeroInput(amountTokenIn)
        notExpired(expireTimestamp)
    {
        uint256 feeToken = amountTokenIn * FEE / DIVISOR;
        uint256 newReserveToken = reserveToken + amountTokenIn - feeToken;
        uint256 newReserveQuote = (reserveVirtQuote + reserveRealQuote).mulWadUp(reserveToken).divWadUp(newReserveToken);
        uint256 amountQuoteOut = reserveVirtQuote + reserveRealQuote - newReserveQuote;

        if (amountQuoteOut < minAmountQuoteOut) revert WaveFrontToken__SlippageToleranceExceeded();

        reserveRealQuote = newReserveQuote - reserveVirtQuote;
        reserveToken = newReserveToken;

        emit WaveFrontToken__Swap(msg.sender, 0, amountTokenIn, amountQuoteOut, 0, to);

        feeToken = _processSellFees(feeToken, provider);
        _burn(msg.sender, amountTokenIn);
        _burnTokenReserves(feeToken);
        IERC20(quote).safeTransfer(to, amountQuoteOut);
    }

    /**
     * @dev Allows WaveFrontToken holders to borrow quote tokens against their WaveFrontToken holdings as collateral.
     * @param amountQuote The amount of quote tokens to borrow.
     */
    function borrow(uint256 amountQuote) 
        external 
        nonReentrant
        notZeroInput(amountQuote)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (credit < amountQuote) revert WaveFrontToken__CreditLimit();
        totalDebt += amountQuote;
        account_Debt[msg.sender] += amountQuote;
        emit WaveFrontToken__Borrow(msg.sender, amountQuote);
        IERC20(quote).safeTransfer(msg.sender, amountQuote);
    }

    /**
     * @dev Allows borrowers to repay their borrowed quote tokens, reducing their debt.
     * @param amountQuote The amount of quote tokens to repay.
     */
    function repay(uint256 amountQuote) 
        external 
        nonReentrant
        notZeroInput(amountQuote)
    {
        totalDebt -= amountQuote;
        account_Debt[msg.sender] -= amountQuote;
        emit WaveFrontToken__Repay(msg.sender, amountQuote);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
    }

    /**
     * @dev Burns WaveFrontTokens from the senders account, causing a bonding curve shift.
     * @param amountToken The amount of this WaveFrontToken to be burned.
     */
    function burn(uint256 amountToken) 
        external
        nonReentrant
        notZeroInput(amountToken)
    {
        _burn(msg.sender, amountToken);
        _burnTokenReserves(amountToken);
        emit WaveFrontToken__Burn(msg.sender, amountToken);
    }

    /**
     * @dev Adds quote tokens to the WaveFrontToken contract, causing a bonding curve shift. 
     * @param amountQuote The amount of quote tokens to donate.
     */
    function heal(uint256 amountQuote) 
        external
        nonReentrant
    {
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
        _healQuoteReserves(amountQuote);
        emit WaveFrontToken__Heal(msg.sender, amountQuote);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @dev Opens the WaveFrontToken market for trading, allowing buy and sell operations. Can only be called by the PreWaveFrontToken contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preToken) revert WaveFrontToken__NotAuthorized();
        open = true;
        emit WaveFrontToken__MarketOpened();
    }

    function setTreasury(address _treasury)             
        external
    {
        if (msg.sender != treasury) revert WaveFrontToken__NotAuthorized();
        emit WaveFrontToken__TreasurySet(treasury, _treasury);
        treasury = _treasury;
    }

    /**
     * @dev Processes the buy fees, distributing them to the provider, treasury, and protocol.
     * @param feeQuote The amount of quote tokens to be distributed as fees.
     * @param provider The address that may receive a portion of the fee, if applicable.
     * @return The remaining amount of quote tokens after processing the fees.
     */
    function _processBuyFees(uint256 feeQuote, address provider)
        internal
        returns (uint256)
    {
        uint256 feeAmount = feeQuote * FEE_AMOUNT / DIVISOR;
        if (provider != address(0)) {
            IERC20(quote).safeTransfer(provider, feeAmount);
            emit WaveFrontToken__ProviderFee(provider, feeAmount, 0);
            feeQuote -= feeAmount;
        }
        IERC20(quote).safeTransfer(treasury, feeAmount);
        emit WaveFrontToken__TreasuryFee(treasury, feeAmount, 0);
        address protocol = WaveFrontTokenFactory(factory).protocol();
        IERC20(quote).safeTransfer(protocol, feeAmount);
        emit WaveFrontToken__ProtocolFee(protocol, feeAmount, 0);
        feeQuote -= (2 * feeAmount);
        return feeQuote;
    }

    /**
     * @dev Processes the sell fees, distributing them to the provider, treasury, and protocol.
     * @param feeToken The amount of WaveFrontTokens to be distributed as fees.
     * @param provider The address that may receive a portion of the fee, if applicable.
     * @return The remaining amount of WaveFrontTokens after processing the fees.
     */
    function _processSellFees(uint256 feeToken, address provider)
        internal
        returns (uint256)
    {
        uint256 feeAmount = feeToken * FEE_AMOUNT / DIVISOR;
        if (provider != address(0)) {
            _mint(provider, feeAmount);
            emit WaveFrontToken__ProviderFee(provider, 0, feeAmount);
            feeToken -= feeAmount;
        }
        _mint(treasury, feeAmount);
        emit WaveFrontToken__TreasuryFee(treasury, 0, feeAmount);
        address protocol = WaveFrontTokenFactory(factory).protocol();
        _mint(protocol, feeAmount);
        emit WaveFrontToken__ProtocolFee(protocol, 0, feeAmount);
        feeToken -= (2 * feeAmount);
        return feeToken;
    }

    /**
     * @dev Shifts base reserves up, increasing the floor price and market price.
     * @param amountQuote The amount of quote tokens to add and cause a reserve shift.
     */
    function _healQuoteReserves(uint256 amountQuote) 
        internal 
        notZeroInput(amountQuote)
    {
        uint256 savedMaxSupply = maxSupply;
        uint256 savedReserveToken = reserveToken;
        if (savedMaxSupply <= savedReserveToken) revert WaveFrontToken__InvalidShift();
        uint256 reserveHeal = savedReserveToken.mulWadDown(amountQuote).divWadDown(savedMaxSupply - savedReserveToken);
        reserveRealQuote += amountQuote;
        reserveVirtQuote += reserveHeal;
        emit WaveFrontToken__ReserveVirtQuoteHeal(reserveHeal);
        emit WaveFrontToken__ReserveRealQuoteHeal(amountQuote);
    }

    /**
     * @dev Shifts WaveFrontToken reserves down, increasing the floor price and market price.
     * @param amountToken The amount of WaveFrontTokens to burn and cause a reserve shift.
     */
    function _burnTokenReserves(uint256 amountToken)
        internal
        notZeroInput(amountToken)
    {
        uint256 savedMaxSupply = maxSupply;
        uint256 savedReserveToken = reserveToken;
        if (savedMaxSupply <= savedReserveToken) revert WaveFrontToken__InvalidShift();
        uint256 reserveBurn = savedReserveToken.mulWadDown(amountToken).divWadDown(savedMaxSupply - savedReserveToken);
        reserveToken -= reserveBurn;
        maxSupply -= (amountToken + reserveBurn);
        emit WaveFrontToken__ReserveTokenBurn(reserveBurn);
        emit WaveFrontToken__Burn(msg.sender, amountToken);
    }

    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Internal function that is called before any WaveFrontToken transfer, including minting and burning.
     * This function checks if the sender has enough transferrable WaveFrontTokens after considering any existing debt (used as collateral).
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     * @param amount The amount of tokens being transferred.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        super._beforeTokenTransfer(from, to, amount);
        if (account_Debt[from] > 0 && amount > getAccountTransferrable(from)) revert WaveFrontToken__CollateralRequirement();
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @dev Calculates the current market price of the WaveFrontToken based on the bonding curve.
     * The market price is derived from the ratio of the virtual and real reserves to the WaveFrontToken supply.
     * @return The current market price per WaveFrontToken.
     */
    function getMarketPrice()
        external
        view
        returns (uint256)
    {
        return ((reserveVirtQuote + reserveRealQuote).mulWadDown(PRECISION)).divWadDown(reserveToken);
    }

    /**
     * @dev Calculates the floor price of the WaveFrontToken, which is the lowest price that the WaveFrontToken can reach, based on the bonding curve.
     * The floor price is determined by the virtual reserve and the maximum supply of the WaveFrontToken.
     * @return The floor price per token.
     */
    function getFloorPrice()
        external
        view
        returns (uint256)
    {
        return (reserveVirtQuote.mulWadDown(PRECISION)).divWadDown(maxSupply);
    }

    /**
     * @dev Calculates the borrowing credit available to an account based on its WaveFrontToken balance.
     * This credit represents the maximum quote tokens that the account can borrow.
     * @param account The address of the user for whom the credit is being calculated.
     * @return The amount of quote token credit available for borrowing.
     */
    function getAccountCredit(address account) 
        public
        view
        returns (uint256)
    {
        if (balanceOf(account) == 0) return 0;
        return ((reserveVirtQuote.mulWadDown(maxSupply).divWadDown(maxSupply - balanceOf(account))) - reserveVirtQuote) - account_Debt[account];
    }

    /**
     * @dev Calculates the transferrable balance of an account, considering any locked WaveFrontTokens due to outstanding debts.
     * This function ensures that users cannot transfer WaveFrontTokens that are required as collateral for borrowed quote tokens.
     * @param account The address of the user for whom the transferrable balance is being calculated.
     * @return The amount of this WaveFrontToken that the account can transfer.
     */
    function getAccountTransferrable(address account)
        public
        view
        returns (uint256) 
    {
        if (account_Debt[account] == 0) return balanceOf(account);
        return balanceOf(account) - (maxSupply - (reserveVirtQuote.mulWadDown(maxSupply).divWadDown(account_Debt[account] + reserveVirtQuote)));
    }

}

contract WaveFrontTokenFactory is Ownable {

    address public protocol;
    address public lastToken;

    event WaveFrontTokenFactory__Created(address indexed token);
    event WaveFrontTokenFactory__ProtocolSet(address indexed oldProtocol, address indexed newProtocol);

    function createWaveFrontToken(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _quote, 
        uint256 _reserveVirtQuote
    ) 
        external 
        returns (address) 
    {
        lastToken = address(new WaveFrontToken(_name, _symbol, _uri, msg.sender, _quote, _reserveVirtQuote));
        emit WaveFrontTokenFactory__Created(lastToken);
        return lastToken;
    }

    function setProtocol(address _protocol) 
        external 
        onlyOwner 
    {
        emit WaveFrontTokenFactory__ProtocolSet(protocol, _protocol);
        protocol = _protocol;
    }

}
