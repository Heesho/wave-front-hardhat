// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./library/FixedPointMathLib.sol";

interface IWaveFront {
    function ownerOf(uint256 tokenId) external view returns (address);
    function treasury() external view returns (address);
}

interface IPreTokenFactory {
    function createPreToken(address token, address quote) external returns (address preTokenAddress);
}

/**
 * @title Token
 * @author heesho
 * @notice An ERC20 token with a bonding curve for trading and price discovery.
 * Features buy/sell functions interacting with reserves, a fee mechanism,
 * and quote token borrowing against token holdings.
 * Associated with a PreToken for initial distribution and a WaveFront NFT for ownership/fees.
 * Inherits ERC20Permit for gasless approvals and ERC20Votes for governance.
 */
contract Token is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    /// @notice Precision factor (1e18) used for fixed-point math operations.
    uint256 public constant PRECISION = 1e18; 
    /// @notice Initial potential maximum supply of the token, used in floor price calculations.
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; 
    /// @notice Fee basis points (100 = 1%) applied to buys (on quote amount) and sells (on token amount).
    uint256 public constant FEE = 100; 
    /// @notice Basis points (1500 = 15%) determining the portion of the fee allocated to each stakeholder (provider, owner, treasury).
    uint256 public constant FEE_AMOUNT = 1500; 
    /// @notice Divisor (10000) used for calculating percentages from basis points.
    uint256 public constant DIVISOR = 10000; 

    /*----------  STATE VARIABLES  --------------------------------------*/

    // --- Token Config ---
    /// @notice Address of the WaveFront contract associated with this token.
    address public immutable wavefront; 
    /// @notice Address of the ERC20 quote token used for trading and borrowing.
    address public immutable quote; 
    /// @notice Address of the associated PreToken contract managing the initial distribution.
    address public immutable preToken; 
    /// @notice Address of the factory used to deploy the PreToken contract.
    address public immutable preTokenFactory;
    /// @notice The token ID of the WaveFront NFT associated with this Token instance.
    uint256 public immutable wavefrontId; 
    /// @notice Current maximum supply, decreases when tokens are burned via reserve shifts. Used in floor price and borrowing calculations.
    uint256 public maxSupply = INITIAL_SUPPLY; 
    /// @notice Flag indicating if trading is enabled (set true by the associated PreToken).
    bool public open = false; 
    /// @notice Flag indicating if fees should be distributed to the WaveFront NFT owner. Settable by the NFT owner. Defaults to true.
    bool public ownerFeesActive = true;

    // --- Bonding Curve State ---
    /// @notice Actual balance of quote tokens held by the contract from trades and heals.
    uint256 public reserveRealQuote; 
    /// @notice Virtual quote tokens used in the bonding curve calculation to establish a price floor. Not backed by real assets.
    uint256 public reserveVirtQuote; 
    /// @notice Bonding curve reserve of this token. Decreases on buys and reserve burns. Starts at INITIAL_SUPPLY.
    uint256 public reserveToken = INITIAL_SUPPLY; 

    // --- Credit State ---
    /// @notice Total amount of quote tokens currently borrowed across all users.
    uint256 public totalDebt; 
    /// @notice Tracks the amount of quote tokens borrowed by each individual account.
    mapping(address => uint256) public account_Debt; 

    /*----------  ERRORS ------------------------------------------------*/

    /// @notice Raised when an operation receives zero amount as input where it's invalid.
    error Token__ZeroInput();
    /// @notice Raised when a transaction's deadline (expireTimestamp) has passed.
    error Token__Expired();
    /// @notice Raised when a swap would result in less output than the user's minimum expectation.
    error Token__SlippageToleranceExceeded();
    /// @notice Raised when attempting to trade before the associated PreToken opens the market.
    error Token__MarketNotOpen();
    /// @notice Raised on unauthorized attempts to call restricted functions (e.g., only PreToken can call openMarket).
    error Token__NotAuthorized();
    /// @notice Raised when a transfer would violate collateral requirements due to existing debt.
    error Token__CollateralRequirement();
    /// @notice Raised when attempting to borrow more quote tokens than the calculated credit limit allows.
    error Token__CreditLimit();
    /// @notice Raised during reserve shifts if maxSupply calculation becomes invalid (e.g., maxSupply <= reserveToken).
    error Token__InvalidShift();
    /// @notice Raised when attempting to divide by zero in calculations.
    error Token__CannotDivideByZero();
    /// @notice Raised in sell if calculated new total quote reserve is less than virtual quote reserve, indicating an internal inconsistency.
    error Token__RealReserveUnderflow();
    /// @notice Raised when attempting to call setOwnerFeeStatus by a non-NFT owner.
    error Token__NotOwner();

    /*----------  EVENTS ------------------------------------------------*/

    /// @notice Emitted upon successful execution of a buy or sell operation.
    event Token__Swap(address indexed from, uint256 amountQuoteIn, uint256 amountTokenIn, uint256 amountQuoteOut, uint256 amountTokenOut, address indexed to);
    /// @notice Emitted when the provider fee portion is distributed.
    event Token__ProviderFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    /// @notice Emitted when the treasury fee portion is distributed via the WaveFront contract.
    event Token__TreasuryFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    /// @notice Emitted when the WaveFront NFT owner fee portion is distributed.
    event Token__OwnerFee(address indexed account, uint256 amountQuote, uint256 amountToken);
    /// @notice Emitted when WFT tokens are burned from reserves or by a user.
    event Token__Burn(address indexed account, uint256 amountToken);
    /// @notice Emitted when quote tokens are added to reserves via fees or direct heal.
    event Token__Heal(address indexed account, uint256 amountQuote);
    /// @notice Emitted specifically when token reserves are burned as part of a curve shift.
    event Token__ReserveTokenBurn(uint256 amountToken);
    /// @notice Emitted specifically when virtual quote reserves are increased ("healed") as part of a curve shift.
    event Token__ReserveQuoteHeal(uint256 amountQuote);
    /// @notice Emitted when a user successfully borrows quote tokens.
    event Token__Borrow(address indexed account, address indexed to, uint256 amountQuote);
    /// @notice Emitted when a user successfully repays borrowed quote tokens.
    event Token__Repay(address indexed account, address indexed to, uint256 amountQuote);
    /// @notice Emitted once when the market is enabled for trading by the PreToken contract.
    event Token__MarketOpened();
    /// @notice Emitted when the WaveFront NFT owner changes the owner fee status for this token.
    event Token__OwnerFeeStatusSet(uint256 indexed wavefrontId, bool active);

    /*----------  MODIFIERS  --------------------------------------------*/

    /// @notice Ensures the transaction deadline has not passed. Reverts if expired.
    modifier notExpired(uint256 expireTimestamp) {
        // A zero timestamp indicates no deadline.
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Token__Expired();
        _;
    }

    /// @notice Ensures the input amount is greater than zero. Reverts if zero.
    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert Token__ZeroInput();
        _;
    }
    
    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @notice Initializes the Token contract and deploys its associated PreToken.
     * @param _name Name for the ERC20 token.
     * @param _symbol Symbol for the ERC20 token.
     * @param _wavefront Address of the parent WaveFront contract.
     * @param _preTokenFactory Address of the factory contract for deploying the PreToken.
     * @param _quote Address of the quote token.
     * @param _wavefrontId The token ID of the corresponding WaveFront NFT.
     * @param _reserveVirtQuote Initial virtual quote reserve amount.
     */
    constructor(
        string memory _name, 
        string memory _symbol, 
        address _wavefront,
        address _preTokenFactory,
        address _quote,
        uint256 _wavefrontId,
        uint256 _reserveVirtQuote
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name) 
    {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
        quote = _quote;
        wavefrontId = _wavefrontId;
        reserveVirtQuote = _reserveVirtQuote;
        // Deploy the associated PreToken contract via its factory.
        preToken = IPreTokenFactory(_preTokenFactory).createPreToken(address(this), _quote); 
    }

    /**
     * @notice Purchases Tokens using quote tokens via the bonding curve.
     * Calculates output amount, applies fees, updates reserves, distributes fees, and mints tokens.
     * Can only be called if the market is open or by the associated PreToken contract.
     * @param amountQuoteIn Amount of quote tokens to spend.
     * @param minAmountTokenOut Minimum Token amount expected; reverts if slippage is too high.
     * @param expireTimestamp Transaction deadline timestamp (0 for no deadline).
     * @param to Address to receive the minted Tokens.
     * @param provider Optional address to receive the provider's share of the fee.
     * @return amountTokenOut The amount of Tokens minted.
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
        returns (uint256 amountTokenOut)
    {
        // Allow buys only if the market is open, or if the caller is the PreToken during launch.
        if (!open && msg.sender != preToken) revert Token__MarketNotOpen();

        uint256 feeQuote = amountQuoteIn * FEE / DIVISOR; 
        uint256 amountQuoteInAfterFee = amountQuoteIn - feeQuote; 

        // Calculate output based on constant product invariant (implicitly).
        uint256 currentTotalQuoteReserve = reserveVirtQuote + reserveRealQuote;
        uint256 newTotalQuoteReserve = currentTotalQuoteReserve + amountQuoteInAfterFee;
        // Prevent division by zero if newTotalQuoteReserve is 0 (should not happen if amountQuoteIn > 0).
        if (newTotalQuoteReserve == 0) revert Token__CannotDivideByZero();
        uint256 newReserveToken = currentTotalQuoteReserve.mulWadUp(reserveToken).divWadUp(newTotalQuoteReserve);
        
        amountTokenOut = reserveToken - newReserveToken;

        if (amountTokenOut < minAmountTokenOut) revert Token__SlippageToleranceExceeded();

        // Update reserves.
        reserveRealQuote += amountQuoteInAfterFee; 
        reserveToken = newReserveToken;

        emit Token__Swap(msg.sender, amountQuoteIn, 0, 0, amountTokenOut, to);

        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);

        uint256 healedQuote = _processBuyFees(feeQuote, provider); 
        if (healedQuote > 0) {
            _healQuoteReserves(healedQuote);
        }
        
        _mint(to, amountTokenOut);
    }

    /**
     * @notice Sells Tokens for quote tokens via the bonding curve.
     * Calculates output amount, applies fees, updates reserves, burns sold tokens,
     * distributes fees, and transfers quote tokens to the recipient.
     * Requires the market to be open.
     * @param amountTokenIn Amount of Tokens to sell.
     * @param minAmountQuoteOut Minimum quote amount expected; reverts if slippage is too high.
     * @param expireTimestamp Transaction deadline timestamp (0 for no deadline).
     * @param to Address to receive the quote tokens.
     * @param provider Optional address to receive the provider's share of the fee.
     * @return amountQuoteOut The amount of quote tokens sent to the recipient.
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
        returns (uint256 amountQuoteOut)
    {
        if (!open) revert Token__MarketNotOpen();

        uint256 feeToken = amountTokenIn * FEE / DIVISOR; 
        uint256 amountTokenInAfterFee = amountTokenIn - feeToken; 

        // Calculate output based on constant product invariant (implicitly).
        uint256 currentTotalQuoteReserve = reserveVirtQuote + reserveRealQuote;
        uint256 newReserveToken = reserveToken + amountTokenInAfterFee;
        // Prevent division by zero if newReserveToken is 0.
        if (newReserveToken == 0) revert Token__CannotDivideByZero(); 
        uint256 newTotalQuoteReserve = currentTotalQuoteReserve.mulWadUp(reserveToken).divWadUp(newReserveToken);
        
        amountQuoteOut = currentTotalQuoteReserve - newTotalQuoteReserve;

        if (amountQuoteOut < minAmountQuoteOut) revert Token__SlippageToleranceExceeded();

        // Update reserves. Real quote reserve decreases.
        // Check for underflow, which would indicate an issue with the invariant calculation or state.
        if (newTotalQuoteReserve < reserveVirtQuote) revert Token__RealReserveUnderflow(); 
        reserveRealQuote = newTotalQuoteReserve - reserveVirtQuote; 
        reserveToken = newReserveToken;

        emit Token__Swap(msg.sender, 0, amountTokenIn, amountQuoteOut, 0, to);

        // Burn the total amount of Tokens from the seller (amount sold + fee token part).
        _burn(msg.sender, amountTokenIn); 

        uint256 burnedToken = _processSellFees(feeToken, provider); 
        if (burnedToken > 0) {
            _burnTokenReserves(burnedToken);
        }

        IERC20(quote).safeTransfer(to, amountQuoteOut);
    }

    /**
     * @notice Borrows quote tokens against the caller's Token balance as collateral.
     * Borrowable amount depends on the account's credit limit, derived from their
     * Token holdings and the token's floor price.
     * @param to Address to receive the borrowed quote tokens.
     * @param amountQuote The amount of quote tokens to borrow. Must be <= available credit.
     */
    function borrow(address to, uint256 amountQuote) 
        external 
        nonReentrant
        notZeroInput(amountQuote)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (amountQuote > credit) revert Token__CreditLimit(); 
        
        totalDebt += amountQuote;
        account_Debt[msg.sender] += amountQuote;
        
        emit Token__Borrow(msg.sender, to, amountQuote);
        
        IERC20(quote).safeTransfer(to, amountQuote);
    }

    /**
     * @notice Repays previously borrowed quote tokens, reducing the caller's debt.
     * @param to Address to repay the debt to.
     * @param amountQuote The amount of quote tokens to repay. Can repay up to the current debt amount.
     */
    function repay(address to, uint256 amountQuote) 
        external 
        nonReentrant
        notZeroInput(amountQuote)
    {
        totalDebt -= amountQuote; // Underflow checked by Solidity 0.8+
        account_Debt[to] -= amountQuote; // Underflow checked by Solidity 0.8+
        
        emit Token__Repay(msg.sender, to, amountQuote);
        
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
    }

    /**
     * @notice Allows a user to manually burn their own Tokens.
     * This action triggers a token reserve shift, increasing the floor/market price.
     * @param amountToken The amount of Tokens to burn from the caller's balance.
     */
    function burn(uint256 amountToken) 
        external
        nonReentrant
        notZeroInput(amountToken)
    {
        _burn(msg.sender, amountToken);
        // Shift reserves based on the burned amount.
        _burnTokenReserves(amountToken); 
    }

    /**
     * @notice Allows anyone to add quote tokens directly to the contract's real reserves ("heal").
     * This action triggers a quote reserve shift, increasing the floor/market price.
     * @param amountQuote The amount of quote tokens to add.
     */
    function heal(uint256 amountQuote) 
        external
        nonReentrant
        notZeroInput(amountQuote)
    {
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuote);
        // Shift reserves based on the added quote amount.
        _healQuoteReserves(amountQuote); 
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @notice Marks the token market as open for public trading.
     * Can only be called by the associated PreToken contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preToken) revert Token__NotAuthorized();
        open = true;
        emit Token__MarketOpened();
    }

    /**
     * @notice Allows the current owner of the associated WaveFront NFT to
     * activate or deactivate the owner fee share for this specific Token contract.
     * @param _active The desired status (true = active, false = inactive).
     */
    function setOwnerFeeStatus(bool _active) external {
        // Verify caller is the current NFT owner
        address currentNFTOwner = IWaveFront(wavefront).ownerOf(wavefrontId);
        if (msg.sender != currentNFTOwner) revert Token__NotOwner();

        // Set the new status and emit event
        ownerFeesActive = _active;
        emit Token__OwnerFeeStatusSet(wavefrontId, _active);
    }

    /**
     * @dev Internal function to distribute buy-side fees (paid in quote tokens).
     * Transfers fees to provider (if specified), the WaveFront NFT owner (via IWaveFront), 
     * and the treasury (via IWaveFront).
     * @param feeQuote The total quote token fee collected from a buy operation.
     * @param provider The optional provider address specified in the buy call.
     * @return remainingFee The remaining quote token amount after distributions, intended for reserve healing.
     */
    function _processBuyFees(uint256 feeQuote, address provider)
        internal
        returns (uint256 remainingFee)
    {
        remainingFee = feeQuote;
        uint256 feeShare = feeQuote * FEE_AMOUNT / DIVISOR; 

        // Distribute provider fee.
        if (provider != address(0) && feeShare > 0) {
            uint256 providerFee = feeShare <= remainingFee ? feeShare : remainingFee;
            if (providerFee > 0) { // Avoid zero transfers
                IERC20(quote).safeTransfer(provider, providerFee);
                emit Token__ProviderFee(provider, providerFee, 0);
                remainingFee -= providerFee;
            }
        }

        // Check if owner fees are active before distributing
        if (ownerFeesActive) {
            address owner = IWaveFront(wavefront).ownerOf(wavefrontId);
            if (owner != address(0) && remainingFee > 0) {
                uint256 ownerFee = feeShare <= remainingFee ? feeShare : remainingFee;
                if (ownerFee > 0) {
                    IERC20(quote).safeTransfer(owner, ownerFee);
                    emit Token__OwnerFee(owner, ownerFee, 0);
                    remainingFee -= ownerFee;
                }
            }
        }

        // Distribute treasury fee via WaveFront contract.
        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingFee > 0) {
            uint256 treasuryFee = feeShare <= remainingFee ? feeShare : remainingFee;
             if (treasuryFee > 0) { // Avoid zero transfers
                IERC20(quote).safeTransfer(treasury, treasuryFee);
                emit Token__TreasuryFee(treasury, treasuryFee, 0);
                remainingFee -= treasuryFee;
            }
        }
    }

    /**
     * @dev Internal function to distribute sell-side fees (represented in Tokens).
     * Mints fee shares to provider (if specified), the WaveFront NFT owner (via IWaveFront),
     * and the treasury (via IWaveFront).
     * @param feeToken The total Token fee deducted from a sell operation.
     * @param provider The optional provider address specified in the sell call.
     * @return remainingFee The remaining Token amount after distributions, intended for reserve burning.
     */
    function _processSellFees(uint256 feeToken, address provider)
        internal
        returns (uint256 remainingFee)
    {
        remainingFee = feeToken;
        uint256 feeShare = feeToken * FEE_AMOUNT / DIVISOR; 

        // Mint and distribute provider fee.
        if (provider != address(0) && feeShare > 0) {
            uint256 providerFee = feeShare <= remainingFee ? feeShare : remainingFee;
            if (providerFee > 0) { // Avoid zero mints
                _mint(provider, providerFee);
                emit Token__ProviderFee(provider, 0, providerFee);
                remainingFee -= providerFee;
            }
        }

        // Check if owner fees are active before distributing
        if (ownerFeesActive) {
            address owner = IWaveFront(wavefront).ownerOf(wavefrontId);
            if (owner != address(0) && remainingFee > 0) {
                uint256 ownerFee = feeShare <= remainingFee ? feeShare : remainingFee;
                if (ownerFee > 0) {
                    _mint(owner, ownerFee);
                    emit Token__OwnerFee(owner, 0, ownerFee);
                    remainingFee -= ownerFee;
                }
            }
        }

        // Mint and distribute treasury fee via WaveFront contract.
        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingFee > 0) {
            uint256 treasuryFee = feeShare <= remainingFee ? feeShare : remainingFee;
            if (treasuryFee > 0) { // Avoid zero mints
                _mint(treasury, treasuryFee);
                emit Token__TreasuryFee(treasury, 0, treasuryFee);
                remainingFee -= treasuryFee;
            }
        }
    }

    /**
     * @dev Shifts the bonding curve by adding quote reserves (_healQuoteReserves).
     * Increases real and virtual quote reserves proportionally to maintain the floor price ratio.
     * reserveHeal = R_t * amountQuote / (M - R_t)
     * @param amountQuote The amount of quote tokens added to real reserves (from fees or direct heal).
     */
    function _healQuoteReserves(uint256 amountQuote) 
        internal 
    {
        if(amountQuote == 0) return; 

        uint256 savedMaxSupply = maxSupply;
        uint256 savedReserveToken = reserveToken;
        if (savedMaxSupply <= savedReserveToken) revert Token__InvalidShift(); 

        // Calculate the proportional increase in virtual reserves.
        uint256 reserveHeal = savedReserveToken.mulWadDown(amountQuote).divWadDown(savedMaxSupply - savedReserveToken);
        
        reserveRealQuote += amountQuote; 
        reserveVirtQuote += reserveHeal; 
        
        emit Token__ReserveQuoteHeal(reserveHeal);
        // The Heal event indicates the total quote amount added by the initiator (e.g., msg.sender of heal()).
        emit Token__Heal(msg.sender, amountQuote); 
    }

    /**
     * @dev Shifts the bonding curve by burning token reserves (_burnTokenReserves).
     * Decreases token reserves and max supply proportionally to maintain the floor price ratio.
     * reserveBurn = R_t * amountToken / (M - R_t)
     * @param amountToken The amount of Tokens effectively removed from circulation (burned by user or fee portion).
     */
    function _burnTokenReserves(uint256 amountToken)
        internal
    {
        if (amountToken == 0) return; 

        uint256 savedMaxSupply = maxSupply;
        uint256 savedReserveToken = reserveToken;
        if (savedMaxSupply <= savedReserveToken) revert Token__InvalidShift(); 

        // Calculate the proportional amount to burn from reserves.
        uint256 reserveBurn = savedReserveToken.mulWadDown(amountToken).divWadDown(savedMaxSupply - savedReserveToken);
        
        reserveToken -= reserveBurn; // Underflow checked by Solidity 0.8+
        maxSupply -= (amountToken + reserveBurn); // Underflow checked by Solidity 0.8+
        
        emit Token__ReserveTokenBurn(reserveBurn);
        // The Burn event indicates the token amount removed by the initiator (e.g., msg.sender of burn()).
        emit Token__Burn(msg.sender, amountToken); 
    }


    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    /**
     * @dev Hook called after any token transfer, mint, or burn for ERC20Votes integration.
     */
    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes) 
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Hook called before any token transfer, mint, or burn. Enforces collateral requirements for transfers from debtors.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20) 
    {
        super._beforeTokenTransfer(from, to, amount);

        // Check collateral only for transfers FROM accounts with debt.
        if (from != address(0) && account_Debt[from] > 0) {
            uint256 transferrable = getAccountTransferrable(from);
            if (amount > transferrable) {
                revert Token__CollateralRequirement();
            }
        }
    }

    /**
     * @dev Overrides ERC20._mint for ERC20Votes integration.
     */
    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes) 
    {
        super._mint(to, amount);
    }

    /**
     * @dev Overrides ERC20._burn for ERC20Votes integration.
     */
    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes) 
    {
        super._burn(account, amount);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @notice Calculates the instantaneous market price based on current reserves.
     * Market Price = (Virtual Quote Reserve + Real Quote Reserve) / Token Reserve
     * @return price The current market price per full Token unit (scaled by PRECISION).
     */
    function getMarketPrice()
        external
        view
        returns (uint256 price)
    {
        if (reserveToken == 0) return 0; 
        uint256 totalQuote = reserveVirtQuote + reserveRealQuote;
        return totalQuote.mulWadDown(PRECISION).divWadDown(reserveToken); 
    }

    /**
     * @notice Calculates the theoretical floor price based on virtual reserves and max supply.
     * Floor Price = Virtual Quote Reserve / Max Supply
     * @return price The current floor price per full Token unit (scaled by PRECISION).
     */
    function getFloorPrice()
        external
        view
        returns (uint256 price)
    {
        if (maxSupply == 0) return 0; 
        return reserveVirtQuote.mulWadDown(PRECISION).divWadDown(maxSupply); 
    }

    /**
     * @notice Calculates the maximum additional quote amount an account can borrow based on their Token balance and floor price.
     * Required Total Virtual Reserve (V') = V * M / (M - Balance)
     * Credit Limit = V' - V
     * Available Credit = Credit Limit - Current Debt
     * @param account The address for which to calculate available credit.
     * @return credit The additional amount of quote token the account can borrow.
     */
    function getAccountCredit(address account) 
        public  // public as it's used internally by borrow
        view
        returns (uint256 credit)
    {
        uint256 balance = balanceOf(account);
        if (balance == 0) return 0; 

        uint256 savedMaxSupply = maxSupply;
        uint256 savedVirtQuote = reserveVirtQuote;
        
        // Ensure balance does not exceed maxSupply for calculation validity.
        if (balance >= savedMaxSupply) return 0; 
        uint256 nonHeldSupply = savedMaxSupply - balance;

        // V' = V * M / (M - B)
        uint256 requiredTotalVirtReserve = savedVirtQuote.mulWadDown(savedMaxSupply).divWadDown(nonHeldSupply);

        // Credit Limit = V' - V
        if (requiredTotalVirtReserve <= savedVirtQuote) return 0; // Should not happen if balance > 0
        uint256 creditLimit = requiredTotalVirtReserve - savedVirtQuote;

        // Available Credit = Credit Limit - Debt
        uint256 currentDebt = account_Debt[account];
        if (creditLimit <= currentDebt) return 0; 

        return creditLimit - currentDebt;
    }


    /**
     * @notice Calculates the amount of Tokens an account can transfer, considering collateral locked against debt.
     * Locked Collateral Amount = Amount of tokens whose floor value equals the current debt.
     * Locked = M - (V * M / (V + Debt))
     * Transferrable = Balance - Locked
     * @param account The address for which to calculate the transferable balance.
     * @return transferrableAmount The amount of Tokens the account can freely transfer.
     */
    function getAccountTransferrable(address account)
        public  // public as it's used internally by _beforeTokenTransfer
        view
        returns (uint256 transferrableAmount) 
    {
        uint256 currentDebt = account_Debt[account];
        uint256 balance = balanceOf(account);

        if (currentDebt == 0) return balance;

        uint256 savedMaxSupply = maxSupply;
        uint256 savedVirtQuote = reserveVirtQuote;

        if (savedVirtQuote == 0) {
            // If floor price is zero, any debt means nothing is transferable.
            return (currentDebt > 0) ? 0 : balance; 
        }

        // V' = V + Debt
        uint256 requiredTotalVirtReserveForDebt = savedVirtQuote + currentDebt;

        // nonLockedSupply = V * M / V' 
        uint256 nonLockedSupply = savedVirtQuote.mulWadDown(savedMaxSupply).divWadDown(requiredTotalVirtReserveForDebt);
        
        // lockedAmount = M - nonLockedSupply
        if (savedMaxSupply < nonLockedSupply) return 0; // Should not happen if V'>V
        uint256 lockedAmount = savedMaxSupply - nonLockedSupply;

        // Transferable = Balance - lockedAmount
        if (balance <= lockedAmount) return 0; 
        
        return balance - lockedAmount;
    }

}
