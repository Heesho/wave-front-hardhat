// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./library/FixedPointMathLib.sol";

/**
 * @title HenLol
 * @author heesho
 *
 * The HenLol contract is designed for creating HenLolTokens (HLTs) a new type of ERC20 token distributed 
 * by a bonding curve. The bonding curve lives in the token and gaurantees liquidity at all price ranges 
 * with a constant product, facilitating dynamic pricing based on market demand. HenLolTokens are initially
 * launched via the HenLolPreToken contract to ensure a bot-resistant and fair distribution. Once launched, 
 * HenLolTokens can be traded or used as collateral for borrowing.
 *
 * HenLolToken: 
 * The primary asset with a built-in bonding curve, enabling buy/sell transactions
 * with price adjustments based on supply. A virtual bonding curve is used with a constant product
 * formula (XY = K). The HLT can be bought, sold, allows for liqduition free borrowing against held 
 * HLTs and fee accumulation for HLT holders. It also uses a bonding curve shift to adjust the 
 * reserves based on the maxSupply of HLT. Buy and sell transactions incur a 2% fee, divided among
 * the protocol treasury (12.5%), status holder (12.5%), creator (12.5%), a provider (12.5% optional),
 * For buys the remainder (50%) is used to shift the bonding curve (increasing the quote reserves). 
 * For sells the remainder (50%) is used to shift the bonding curve (decreasing the WFT reserves). 
 * Both cases increase the floor price, market price, and borrowing capacity of the HLT. The HLT
 * The HLT does not need to be deposited to borrow against it, this can be done from the user's wallet. 
 * Borrowing however will not let the user transfer the HLT if the collateral requirement is not met.
 *
 * PreHenLolToken: 
 * Manages the initial distribution phase, collecting quote tokens (e.g., wETH, USDC, etc.) and
 * transitioning to the open market phase for the HLT, ensuring a fair launch. Everyone
 * that participates in the preHLT phase receives HLTs at the same price.
 *
 */


contract PreHenLolToken is ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant DURATION = 1800; // Duration in seconds for the pre-market phase

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable quote; // Address of the quote token (e.g., wETH, USDC, etc.)
    address public immutable token; // Address of the HenLolToken deployed
    address public immutable honeyComb; // Address of the HoneyComb contract

    uint256 public immutable endTimestamp; // Timestamp when the pre-market phase ends
    bool public ended = false; // Flag indicating if the pre-market phase has ended

    address public creator;
    uint256 public creatorMax;
    uint256 public creatorUsed;

    uint256 public memberMax;
    mapping(uint256 => uint256) public memberId_Used;

    uint256 public totalTokenBalance; // Total balance of the henlol tokens distributed after pre-market
    uint256 public totalQuoteContributed; // Total quote tokens contributed during the pre-market phase
    mapping(address => uint256) public account_QuoteContributed; // Quote tokens contributed by each account

    /*----------  ERRORS ------------------------------------------------*/

    error PreHenLolToken__ZeroInput();
    error PreHenLolToken__Concluded();
    error PreHenLolToken__InProgress();
    error PreHenLolToken__NotEligible();

    /*----------  EVENTS ------------------------------------------------*/

    event PreHenLolToken__Contributed(address indexed token, address indexed account, uint256 amount);
    event PreHenLolToken__MarketOpened(address indexed token, uint256 totalTokenBalance, uint256 totalQuoteContributed);
    event PreHenLolToken__Redeemed(address indexed token, address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the PreHenLolToken contract.
     * @param _quote Address of the quote token, typically a stablecoin or native cryptocurrency like wETH, USDC, etc.
     */
    constructor(address _quote, address _honeyComb, address _creator, uint256 _creatorMax, uint256 _memberMax) {
        quote = _quote;
        token = msg.sender;
        endTimestamp = block.timestamp + DURATION;
        honeyComb = _honeyComb;
        creator = _creator;
        creatorMax = _creatorMax;
        memberMax = _memberMax;
    }

    function contribute(address account, uint256[] memberIds, uint256[] memberAmounts, uint256 creatorAmount) external nonReentrant {
        if (memberIds.length != memberAmounts.length) revert PreHenLolToken__InvalidInput();
        if (ended) revert PreHenLolToken__Concluded();
        uint256 contribution = 0;
        if (creatorAmount > 0) {
            if (account != creator) revert PreHenLolToken__NotEligible();
            creatorUsed += creatorAmount;
            if (creatorUsed > creatorMax) revert PreHenLolToken__CreatorAmountExceeded();
            contribution += creatorAmount;
            emit PreHenLolToken__CreatorContributed(account, creatorAmount);
        }
        for (uint256 i = 0; i < memberIds.length; i++) {
            if (IERC721(honeyComb).ownerOf(memberIds[i]) != account) revert PreHenLolToken__NotEligible();
            memberId_Used[memberIds[i]] += memberAmounts[i];
            if (memberId_Used[memberIds[i]] > memberMax) revert PreHenLolToken__ContributionExceeded();
            contribution += memberAmounts[i];
            emit PreHenLolToken__MemberContributed(account, memberIds[i], memberAmounts[i]);
        }
        if (contribution == 0) revert PreHenLolToken__ZeroInput();
        totalQuoteContributed += contribution;
        account_QuoteContributed[account] += contribution;
        IERC20(quote).safeTransferFrom(msg.sender, address(this), contribution);
    }

    /**
     * @dev Opens the market for the HenLolToken, ending the pre-market phase.
     * Can only be called after the pre-market phase duration has ended.
     */
    function openMarket() external {
        if (endTimestamp > block.timestamp) revert PreHenLolToken__InProgress();
        if (ended) revert PreHenLolToken__Concluded();
        ended = true;
        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, totalQuoteContributed);
        HenLolToken(token).buy(totalQuoteContributed, 0, 0, address(this), address(0));
        totalTokenBalance = IERC20(token).balanceOf(address(this));
        HenLolToken(token).openMarket();
        emit PreHenLolToken__MarketOpened(token, totalTokenBalance, totalQuoteContributed);
    }

    /**
     * @dev Allows users who contributed during the pre-market phase to redeem their new HenLolTokens.
     * @param account The account redeeming its contribution for new HenLolTokens.
     */ 
    function redeem(address account) external nonReentrant {
        if (!ended) revert PreHenLolToken__InProgress();
        uint256 contribution = account_QuoteContributed[account];
        if (contribution == 0) revert PreHenLolToken__NotEligible();
        account_QuoteContributed[account] = 0;
        uint256 amountToken = totalTokenBalance.mulWadDown(contribution).divWadDown(totalQuoteContributed);
        IERC20(token).safeTransfer(account, amountToken);
        emit PreHenLolToken__Redeemed(token, account, amountToken);
    }
    
}

contract HenLolToken is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18; // Precision for math
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; // Initial supply of the HenLolToken
    uint256 public constant FEE = 100; // 1% fee rate for buy/sell operations
    uint256 public constant FEE_AMOUNT = 1500; // Additional fee parameters for ditributing to stakeholders
    uint256 public constant DIVISOR = 10000; // Divisor for fee calculations

    /*----------  STATE VARIABLES  --------------------------------------*/

    // token state
    address public immutable factory; // Address of the factory contract
    address public immutable quote; // Address of the quote token (e.g., wETH, USDC, etc.)
    address public immutable preToken; // Address of the PreHenLolToken contract

    uint256 public maxSupply = INITIAL_SUPPLY; // Maximum supply of the HLT, can only decrease
    bool public open = false; // Flag indicating if the market is open, only the preToken can open it

    string public uri; // URI for the metadata
    string public caption; // caption for the metadata

    // bonding curve state
    uint256 public reserveRealQuote; // real quote reserve of the token
    uint256 public reserveVirtQuote; // virtual quote reserve of the token
    uint256 public reserveToken = INITIAL_SUPPLY; // token reserve initially set to the max supply

    // credit state
    uint256 public totalDebt; // Total debt of the HenLolToken
    mapping(address => uint256) public account_Debt; // Debt of each account

    address public creator; // creator of the token
    address public owner; // owner of the token through stealing

    /*----------  ERRORS ------------------------------------------------*/


    error HenLolToken__ZeroInput();
    error HenLolToken__Expired();
    error HenLolToken__SlippageToleranceExceeded();
    error HenLolToken__MarketNotOpen();
    error HenLolToken__NotAuthorized();
    error HenLolToken__CollateralRequirement();
    error HenLolToken__CreditLimit();
    error HenLolToken__InvalidShift();

    /*----------  ERRORS ------------------------------------------------*/

    event HenLolToken__Swap(address indexed from, uint256 amountQuoteIn, uint256 amountTokenIn, uint256 amountQuoteOut, uint256 amountTokenOut, address indexed to);
    event HenLolToken__ProviderFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    event HenLolToken__TreasuryFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    event HenLolToken__Burn(address indexed account, uint256 amountToken);
    event HenLolToken__Heal(address indexed account, uint256 amountQuote);
    event HenLolToken__ReserveTokenBurn(uint256 amountToken);
    event HenLolToken__ReserveVirtQuoteHeal(uint256 amountQuote);
    event HenLolToken__ReserveRealQuoteHeal(uint256 amountQuote);
    event HenLolToken__Borrow(address indexed account, uint256 amountQuote);
    event HenLolToken__Repay(address indexed account, uint256 amountQuote);
    event HenLolToken__MarketOpened();

    /*----------  MODIFIERS  --------------------------------------------*/

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert HenLolToken__Expired();
        _;
    }

    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert HenLolToken__ZeroInput();
        _;
    }
    
    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the HenLolToken contract with initial settings.
     * @param _name Name of the HenLolToken.
     * @param _symbol Symbol of the HenLolToken.
     * @param _uri URI for HenLolToken metadata.
     * @param _quote Address of the quote token (e.g., wETH, USDC, etc.)
     * @param _reserveVirtQuote Initial virtual reserve of the quote token
     */
    constructor(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _creator,
        address _quote,
        uint256 _reserveVirtQuote,
        uint256 _creatorMax,
        uint256 _memberMax
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        if (_creator == address(0)) revert HenLolToken__InvalidCreator();
        if (_quote == address(0)) revert HenLolToken__InvalidQuote();
        if (_reserveVirtQuote == 0) revert HenLolToken__InvalidReserveVirtQuote();
        if (_creatorMax == 0) revert HenLolToken__InvalidCreatorMax();

        uri = _uri;
        quote = _quote;
        reserveVirtQuote = _reserveVirtQuote;
        factory = msg.sender;
        creator = _creator;
        owner = _creator;
        preToken = address(new PreHenLolToken(_quote, address(this), _creator, _creatorMax, _memberMax));
    }

    /**
     * @dev Executes a HenLolToken purchase operation within the bonding curve mechanism.
     * Calculates the necessary fees, updates reserves, and mints the HenLolTokens to the buyer.
     * @param amountQuoteIn The amount of quote tokens provided for the purchase.
     * @param minAmountTokenOut The minimum amount of HenLolTokens expected to be received, for slippage control.
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
        if (!open && msg.sender != preToken) revert HenLolToken__MarketNotOpen();

        uint256 feeQuote = amountQuoteIn * FEE / DIVISOR;
        uint256 newReserveQuote = reserveVirtQuote + reserveRealQuote + amountQuoteIn - feeQuote;
        uint256 newReserveToken = (reserveVirtQuote + reserveRealQuote).mulWadUp(reserveToken).divWadUp(newReserveQuote);
        uint256 amountTokenOut = reserveToken - newReserveToken;

        if (amountTokenOut < minAmountTokenOut) revert HenLolToken__SlippageToleranceExceeded();

        reserveRealQuote = newReserveQuote - reserveVirtQuote;
        reserveToken = newReserveToken;

        emit HenLolToken__Swap(msg.sender, amountQuoteIn, 0, 0, amountTokenOut, to);

        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        feeQuote = _processBuyFees(feeQuote, provider);
        _mint(to, amountTokenOut);
        _healQuoteReserves(feeQuote);
    }

    /**
     * @dev Executes a HenLolToken sale operation within the bonding curve mechanism.
     * A fee is applied to the sale, which is then burned, reducing the total supply and adjusting the bonding curve.
     * @param amountTokenIn The amount of this HenLolToken being sold.
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

        if (amountQuoteOut < minAmountQuoteOut) revert HenLolToken__SlippageToleranceExceeded();

        reserveRealQuote = newReserveQuote - reserveVirtQuote;
        reserveToken = newReserveToken;

        emit HenLolToken__Swap(msg.sender, 0, amountTokenIn, amountQuoteOut, 0, to);

        _burn(msg.sender, amountTokenIn);
        feeToken = _processSellFees(feeToken, provider);
        _burnTokenReserves(feeToken);
        IERC20(quote).safeTransfer(to, amountQuoteOut);
    }

    /**
     * @dev Allows HenLolToken holders to borrow quote tokens against their HenLolToken holdings as collateral.
     * @param amountQuote The amount of quote tokens to borrow.
     */
    function borrow(uint256 amountQuote) 
        external 
        nonReentrant
        notZeroInput(amountQuote)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (credit < amountQuote) revert HenLolToken__CreditLimit();
        totalDebt += amountQuote;
        account_Debt[msg.sender] += amountQuote;
        emit HenLolToken__Borrow(msg.sender, amountQuote);
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
        emit HenLolToken__Repay(msg.sender, amountQuote);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
    }

    /**
     * @dev Burns HenLolTokens from the senders account, causing a bonding curve shift.
     * @param amountToken The amount of this HenLolToken to be burned.
     */
    function burn(uint256 amountToken) 
        external
        nonReentrant
        notZeroInput(amountToken)
    {
        _burn(msg.sender, amountToken);
        _burnTokenReserves(amountToken);
        emit HenLolToken__Burn(msg.sender, amountToken);
    }


    /**
     * @dev Adds quote tokens to the HenLolToken contract, causing a bonding curve shift. 
     * @param amountQuote The amount of quote tokens to donate.
     */
    function heal(uint256 amountQuote) 
        external
        nonReentrant
    {
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
        _healQuoteReserves(amountQuote);
        emit HenLolToken__Heal(msg.sender, amountQuote);
    }

    function steal(address account, string memory newCaption) 
        external 
        nonReentrant 
    {
        if (account == address(0)) revert HenLolToken__InvalidAccount();
        if (bytes(caption).length == 0) revert HenLolToken__InvalidCaption();
        if (bytes(newCaption).length > MAX_CAPTION_LENGTH) revert HenLolToken__CaptionTooLong();

        uint256 newStealPrice = getStealPrice();
        uint256 surplus = newStealPrice - stealPrice;
        uint256 burnAmount = surplus / 2;
        uint256 ownerAmount = stealPrice + burnAmount;

        _burn(msg.sender, newStealPrice);
        _burnTokenReserves(burnAmount);
        _mint(owner, ownerAmount);

        caption = newCaption;
        owner = account;
        stealPrice = newStealPrice;

        emit HenLolToken__Steal(msg.sender, account, newStealPrice, newCaption);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @dev Opens the HenLolToken market for trading, allowing buy and sell operations. Can only be called by the PreHenLolToken contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preToken) revert HenLolToken__NotAuthorized();
        open = true;
        emit HenLolToken__MarketOpened();
    }

    function setCreator(address _creator)
        external
    {
        if (msg.sender != creator) revert HenLolToken__NotAuthorized();
        creator = _creator;
        emit HenLolToken__CreatorSet(_creator);
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
        IERC20(quote).safeTransfer(owner, feeAmount);
        emit HenLolToken__OwnerFee(owner, feeAmount, 0);
        feeQuote -= feeAmount;
        if (provider != address(0)) {
            IERC20(quote).safeTransfer(provider, feeAmount);
            emit HenLolToken__ProviderFee(provider, feeAmount, 0);
            feeQuote -= feeAmount;
        }
        if (creator != address(0)) {
            IERC20(quote).safeTransfer(creator, feeAmount);
            emit HenLolToken__CreatorFee(creator, feeAmount, 0);
            feeQuote -= feeAmount;
        }
        address treasury = HenLolFactory(factory).treasury();
        if (treasury != address(0)) {
            IERC20(quote).safeTransfer(treasury, feeAmount);
            emit HenLolToken__TreasuryFee(treasury, feeAmount, 0);
            feeQuote -= feeAmount;
        }
        return feeQuote;
    }

    /**
     * @dev Processes the sell fees, distributing them to the provider, treasury, and protocol.
     * @param feeToken The amount of HenLolTokens to be distributed as fees.
     * @param provider The address that may receive a portion of the fee, if applicable.
     * @return The remaining amount of HenLolTokens after processing the fees.
     */
    function _processSellFees(uint256 feeToken, address provider)
        internal
        returns (uint256)
    {
        uint256 feeAmount = feeToken * FEE_AMOUNT / DIVISOR;
        _mint(owner, feeAmount);
        emit HenLolToken__OwnerFee(owner, 0, feeAmount);
        feeToken -= feeAmount;
        if (provider != address(0)) {
            _mint(provider, feeAmount);
            emit HenLolToken__ProviderFee(provider, 0, feeAmount);
            feeToken -= feeAmount;
        }
        if (creator != address(0)) {
            _mint(creator, feeAmount);
            emit HenLolToken__CreatorFee(creator, 0, feeAmount);
            feeToken -= feeAmount;
        }
        address treasury = HenLolFactory(factory).treasury();
        if (treasury != address(0)) {   
            _mint(treasury, feeAmount);
            emit HenLolToken__TreasuryFee(treasury, 0, feeAmount);
            feeToken -= feeAmount;
        }
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
        if (savedMaxSupply <= savedReserveToken) revert HenLolToken__InvalidShift();
        uint256 reserveHeal = savedReserveToken.mulWadDown(amountQuote).divWadDown(savedMaxSupply - savedReserveToken);
        reserveRealQuote += amountQuote;
        reserveVirtQuote += reserveHeal;
        emit HenLolToken__ReserveVirtQuoteHeal(reserveHeal);
        emit HenLolToken__ReserveRealQuoteHeal(amountQuote);
    }

    /**
     * @dev Shifts HenLolToken reserves down, increasing the floor price and market price.
     * @param amountToken The amount of HenLolTokens to burn and cause a reserve shift.
     */
    function _burnTokenReserves(uint256 amountToken)
        internal
        notZeroInput(amountToken)
    {
        uint256 savedMaxSupply = maxSupply;
        uint256 savedReserveToken = reserveToken;
        if (savedMaxSupply <= savedReserveToken) revert HenLolToken__InvalidShift();
        uint256 reserveBurn = savedReserveToken.mulWadDown(amountToken).divWadDown(savedMaxSupply - savedReserveToken);
        reserveToken -= reserveBurn;
        maxSupply -= (amountToken + reserveBurn);
        emit HenLolToken__ReserveTokenBurn(reserveBurn);
    }

    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Internal function that is called before any HenLolToken transfer, including minting and burning.
     * This function checks if the sender has enough transferrable HenLolTokens after considering any existing debt (used as collateral).
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     * @param amount The amount of tokens being transferred.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        super._beforeTokenTransfer(from, to, amount);
        if (account_Debt[from] > 0 && amount > getAccountTransferrable(from)) revert HenLolToken__CollateralRequirement();
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
     * @dev Calculates the current market price of the HenLolToken based on the bonding curve.
     * The market price is derived from the ratio of the virtual and real reserves to the HenLolToken supply.
     * @return The current market price per HenLolToken.
     */
    function getMarketPrice()
        external
        view
        returns (uint256)
    {
        return ((reserveVirtQuote + reserveRealQuote).mulWadDown(PRECISION)).divWadDown(reserveToken);
    }

    /**
     * @dev Calculates the floor price of the HenLolToken, which is the lowest price that the HenLolToken can reach, based on the bonding curve.
     * The floor price is determined by the virtual reserve and the maximum supply of the HenLolToken.
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
     * @dev Calculates the borrowing credit available to an account based on its HenLolToken balance.
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
        uint256 reserveQuote = reserveVirtQuote.mulWadDown(maxSupply).divWadDown(maxSupply - balanceOf(account));
        if (reserveQuote < reserveVirtQuote) return 0;
        return reserveQuote - reserveVirtQuote - account_Debt[account];
    }

    /**
     * @dev Calculates the transferrable balance of an account, considering any locked HenLolTokens due to outstanding debts.
     * This function ensures that users cannot transfer HenLolTokens that are required as collateral for borrowed quote tokens.
     * @param account The address of the user for whom the transferrable balance is being calculated.
     * @return The amount of this HenLolToken that the account can transfer.
     */
    function getAccountTransferrable(address account)
        public
        view
        returns (uint256) 
    {
        if (account_Debt[account] == 0) return balanceOf(account);
        return balanceOf(account) - (maxSupply - (reserveVirtQuote.mulWadDown(maxSupply).divWadDown(account_Debt[account] + reserveVirtQuote)));
    }

    function getStealPrice()
        public
        view
        returns (uint256)
    {
        return stealPrice * 110 / 100 + 1000 * PRECISION;
    }

}

contract HenLol is Ownable {

    address public treasury;
    address public lastToken;

    event HenLol__Created(address indexed token);
    event HenLol__TreasurySet(address indexed treasury);

    constructor() {}

    function create(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _creator,
        address _quote, 
        uint256 _reserveVirtQuote,
        uint256 _creatorMax,
        uint256 _memberMax
    ) 
        external 
        returns (address) 
    {
        lastToken = address(new HenLolToken(_name, _symbol, _uri, _creator, _quote, _reserveVirtQuote, _creatorMax, _memberMax));
        emit HenLol__Created(lastToken);
        return lastToken;
    }

    function setTreasury(address _treasury) 
        external 
        onlyOwner 
    {
        treasury = _treasury;
        emit HenLol__TreasurySet(_treasury);
    }

}
