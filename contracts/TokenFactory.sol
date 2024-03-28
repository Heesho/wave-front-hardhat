// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./FixedPointMathLib.sol";

/**
 * @title TokenFactory
 * @author heesho
 *
 * The TokenFactory contract is designed for creating a new type of ERC20 token governed 
 * by a bonding curve. The bonding curve lives in the token and ensures liquidity at all price ranges 
 * with a constant product, facilitating dynamic pricing based on market demand. Tokens are initially
 * launched via the PreToken contract to ensure a bot-resistant and fair distribution. Once launched, 
 * tokens can be traded, used as collateral for borrowing, or held to earn transaction fees.
 *
 * Token: 
 * The primary asset with a built-in bonding curve, enabling buy/sell transactions
 * with price adjustments based on supply. A virtual bonding curve is used with a constant product
 * formula (XY = K) The token can be bought, sold, allows for liqduition free borrowing against held 
 * tokens and fee accumulation for token holders. It also uses a bonding curve shift to adjuast the 
 * reserves based on the maxSupply of token. Buy transactions incur a 2% fee, divided among
 * the protocol treasury (20%), status holder (20%), a provider (20% optional), with the remainder 
 * going to token holders. Sell transactions also incur a 2% fee, which is fully burned, reducing
 * maxSupply and increasing the token's floor and market prices, also increasing the borrowing
 * capacity of the token. The status of the token can be updated by anyone by burning token. The
 * token does not need to be deposited to earn fees or borrow against it, both can be done from
 * the user's wallet. Borrowing however will not let the user transfer the token if the collateral
 * requirement is not met.

 * PreToken: 
 * Manages the initial distribution phase, collecting base tokens (e.g., ETH) and
 * transitioning to the open market phase for the Token, ensuring a fair launch. Everyone
 * that participates in the PreToken phase receives tokens at the same price.
 * 
 * TokenFees: 
 * Handles the collection and distribution of transaction fees. A portion of
 * buying fees is distributed to token holders.
 * 
 * TokenFactory: 
 * Facilitates the creation of new Token instances, integrating them with the
 * bonding curve and fee mechanisms, and linking to the PreToken for initial distribution.
 *
 */

interface IWaveFrontFactory {
    function treasury() external view returns (address);
}

contract PreToken is ReentrancyGuard {
    using FixedPointMathLib for uint256;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant DURATION = 7200; // Duration in seconds for the pre-market phase

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base; // Address of the base token (e.g., ETH)
    address public immutable token; // Address of the token deployed

    uint256 public immutable endTimestamp; // Timestamp when the pre-market phase ends
    bool public ended = false; // Flag indicating if the pre-market phase has ended

    uint256 public totalTokenBalance; // Total balance of the token distributed after pre-market
    uint256 public totalBaseContributed; // Total base tokens contributed during the pre-market phase
    mapping(address => uint256) public account_BaseContributed; // Base tokens contributed by each account

    /*----------  ERRORS ------------------------------------------------*/

    error PreToken__ZeroInput();
    error PreToken__Concluded();
    error PreToken__InProgress();
    error PreToken__NotEligible();

    /*----------  EVENTS ------------------------------------------------*/

    event PreToken__Contributed(address indexed account, uint256 amount);
    event PreToken__MarketOpened(address indexed token, uint256 totalTokenBalance, uint256 totalBaseContributed);
    event PreToken__Redeemed(address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the PreToken contract.
     * @param _base Address of the base token, typically a stablecoin or native cryptocurrency like ETH.
     */
    constructor(address _base) {
        base = _base;
        token = msg.sender;
        endTimestamp = block.timestamp + DURATION;
    }

    /**
     * @dev Allows users to contribute base tokens during the pre-market phase.
     * @param account The account making the contribution.
     * @param amount The amount of base tokens to contribute.
     */
    function contribute(address account, uint256 amount) external nonReentrant {
        if (amount == 0) revert PreToken__ZeroInput();
        if (ended) revert PreToken__Concluded();
        totalBaseContributed += amount;
        account_BaseContributed[account] += amount;
        IERC20(base).transferFrom(msg.sender, address(this), amount);
        emit PreToken__Contributed(account, amount);
    }

    /**
     * @dev Opens the market for the token, ending the pre-market phase.
     * Can only be called after the pre-market phase duration has ended.
     */
    function openMarket() external {
        if (endTimestamp > block.timestamp) revert PreToken__InProgress();
        if (ended) revert PreToken__Concluded();
        ended = true;
        IERC20(base).approve(token, totalBaseContributed);
        Token(token).buy(totalBaseContributed, 0, 0, address(this), address(0));
        totalTokenBalance = IERC20(token).balanceOf(address(this));
        Token(token).openMarket();
        emit PreToken__MarketOpened(token, totalTokenBalance, totalBaseContributed);
    }

    /**
     * @dev Allows users who contributed during the pre-market phase to redeem their new tokens.
     * @param account The account redeeming its contribution for new tokens.
     */
    function redeem(address account) external nonReentrant {
        if (!ended) revert PreToken__InProgress();
        uint256 contribution = account_BaseContributed[account];
        if (contribution == 0) revert PreToken__NotEligible();
        account_BaseContributed[account] = 0;
        uint256 tokenAmount = totalTokenBalance.mulWadDown(contribution).divWadDown(totalBaseContributed);
        IERC20(token).transfer(account, tokenAmount);
        emit PreToken__Redeemed(account, tokenAmount);
    }
    
}

contract TokenFees {

    address internal immutable base; // Base token address (e.g., ETH or a stablecoin).
    address internal immutable token; // Address of the token that this contract manages fees for.

    /**
     * @dev Constructs the contract by setting the base token and associating this contract with a token.
     * @param _base The address of the base token.
     */
    constructor(address _base) {
        token = msg.sender;
        base = _base;
    }

    /**
     * @dev Allows the Token contract to claim fees on behalf of a user or entity.
     * This function is meant to be called by the Token contract to distribute fees
     * to various stakeholders.
     * @param recipient The address receiving the claimed fees.
     * @param amountBase The amount of base token to be transferred as fees.
     */
    function claimFeesFor(address recipient, uint amountBase) external {
        require(msg.sender == token);
        if (amountBase > 0) IERC20(base).transfer(recipient, amountBase);
    }

}

contract Token is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18; // Precision for math
    uint256 public constant RESERVE_VIRTUAL_BASE = 1000 * PRECISION; // Initial virtual base reserve
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; // Initial supply of the token
    uint256 public constant FEE = 200; // 2% fee rate for buy/sell operations
    uint256 public constant FEE_AMOUNT = 2000; // Additional fee parameters for ditributing to stakeholders
    uint256 public constant STATUS_FEE = 10 * PRECISION; // Fee for status update 10 tokens
    uint256 public constant STATUS_MAX_LENGTH = 140; // Maximum length of status string
    uint256 public constant DIVISOR = 10000; // Divisor for fee calculations

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable base; // Address of the base token (e.g., ETH)
    address public immutable fees; // Address of the TokenFees contract
    address public immutable waveFrontFactory; // Address of the WaveFrontFactory contract
    address public immutable preToken; // Address of the PreToken contract

    uint256 public maxSupply = INITIAL_SUPPLY; // Maximum supply of the token, can only decrease
    bool public open = false; // Flag indicating if the market is open, only the preToken can open it

    // bonding curve state
    uint256 public reserveBase = 0; // Base reserve of the token
    uint256 public reserveToken = INITIAL_SUPPLY; // Token reserve of the token. Initially set to the max supply

    // fees state
    uint256 public totalFeesBase; // Total fees collected in base token
    uint256 public indexBase; // Index for calculating fees for token holders
    mapping(address => uint256) public supplyIndexBase; // Index for calculating fees for token holders
    mapping(address => uint256) public claimableBase; // Claimable fees for token holders

    // borrowing
    uint256 public totalDebt; // Total debt of the token
    mapping(address => uint256) public account_Debt; // Debt of each account

    string public uri; // URI for the token image
    string public status; // Status of the token
    address public statusHolder; // Address of the account holding the status

    /*----------  ERRORS ------------------------------------------------*/

    error Token__ZeroInput();
    error Token__Expired();
    error Token__SlippageToleranceExceeded();
    error Token__MarketNotOpen();
    error Token__NotAuthorized();
    error Token__CollateralRequirement();
    error Token__CreditLimit();
    error Token__InvalidAccount();
    error Token__StatusRequired();
    error Token__StatusLimitExceeded();

    /*----------  ERRORS ------------------------------------------------*/

    event Token__Buy(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Token__Sell(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Token__Fees(address indexed account, uint256 amountBase, uint256 amountToken);
    event Token__Claim(address indexed account, uint256 amountBase);
    event Token__ProviderFee(address indexed account, uint256 amountBase);
    event Token__ProtocolFee(address indexed account, uint256 amountBase);
    event Token__Burn(address indexed account, uint256 amountToken);
    event Token__ReserveBurn(uint256 amountToken);
    event Token__Borrow(address indexed account, uint256 amountBase);
    event Token__Repay(address indexed account, uint256 amountBase);
    event Token__StatusFee(address indexed account, uint256 amountBase);
    event Token__StatusUpdated(address indexed account, string status);
    event Token__Donation(address indexed account, uint256 amountBase);

    /*----------  MODIFIERS  --------------------------------------------*/

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Token__Expired();
        _;
    }

    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert Token__ZeroInput();
        _;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the Token contract with initial settings.
     * @param _name Name of the token.
     * @param _symbol Symbol of the token.
     * @param _uri URI for token metadata.
     * @param _base Address of the base token.
     * @param _waveFrontFactory Address of the WaveFrontFactory contract.
     * @param _statusHolder Address of the initial status holder.
     */
    constructor(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _base, 
        address _waveFrontFactory, 
        address _statusHolder
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        uri = _uri;
        status = "Input status here";
        statusHolder = _statusHolder;
        waveFrontFactory = _waveFrontFactory;
        base = _base;
        fees = address(new TokenFees(_base));
        preToken = address(new PreToken(_base));
    }

    /**
     * @dev Executes a token purchase operation within the bonding curve mechanism.
     * Calculates the necessary fees, updates reserves, and mints the tokens to the buyer.
     * @param amountIn The amount of base tokens provided for the purchase.
     * @param minAmountOut The minimum amount of this token expected to be received, for slippage control.
     * @param expireTimestamp Timestamp after which the transaction is not valid.
     * @param to The address receiving the purchased tokens.
     * @param provider The address that may receive a portion of the fee, if applicable.
     */
    function buy(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) 
        external 
        nonReentrant
        notZeroInput(amountIn)
        notExpired(expireTimestamp) 
    {
        if (!open && msg.sender != preToken) revert Token__MarketNotOpen();

        uint256 feeBase = amountIn.mulWadDown(FEE).divWadDown(DIVISOR);
        uint256 newReserveBase = RESERVE_VIRTUAL_BASE + reserveBase + amountIn - feeBase;
        uint256 newReserveToken = (RESERVE_VIRTUAL_BASE + reserveBase).mulWadUp(reserveToken).divWadUp(newReserveBase);
        uint256 amountOut = reserveToken - newReserveToken;

        if (amountOut < minAmountOut) revert Token__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveToken = newReserveToken;

        emit Token__Buy(msg.sender, to, amountIn, amountOut);

        IERC20(base).transferFrom(msg.sender, address(this), amountIn);
        uint256 feeAmount = feeBase.mulWadDown(FEE_AMOUNT).divWadDown(DIVISOR);
        if (provider != address(0)) {
            IERC20(base).transfer(provider, feeAmount);
            emit Token__ProviderFee(provider, feeAmount);
            feeBase -= feeAmount;
        }
        IERC20(base).transfer(statusHolder, feeAmount);
        emit Token__StatusFee(statusHolder, feeAmount);
        IERC20(base).transfer(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        emit Token__ProtocolFee(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        feeBase -= (2* feeAmount);

        _mint(to, amountOut);
        _updateBase(feeBase); 
    }

    /**
     * @dev Allows token holders to sell their tokens back to the bonding curve.
     * A fee is applied to the sale, which is then burned, reducing the total supply and adjusting the bonding curve.
     * @param amountIn The amount of this token being sold.
     * @param minAmountOut The minimum amount of base token expected in return, for slippage control.
     * @param expireTimestamp Timestamp after which the transaction is not valid.
     * @param to The address receiving the base token from the sale.
     */
    function sell(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to) 
        external 
        nonReentrant
        notZeroInput(amountIn)
        notExpired(expireTimestamp) 
    {
        uint256 feeToken = amountIn.mulWadDown(FEE).divWadDown(DIVISOR);
        uint256 newReserveToken = reserveToken + amountIn - feeToken;
        uint256 newReserveBase = (RESERVE_VIRTUAL_BASE + reserveBase).mulWadUp(reserveToken).divWadUp(newReserveToken);
        uint256 amountOut = RESERVE_VIRTUAL_BASE + reserveBase - newReserveBase;

        if (amountOut < minAmountOut) revert Token__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveToken = newReserveToken;

        emit Token__Sell(msg.sender, to, amountIn, amountOut);

        _burn(msg.sender, amountIn - feeToken);
        burn(feeToken);
        IERC20(base).transfer(to, amountOut);
    }

    /**
     * @dev Allows token holders to borrow base tokens against their token holdings as collateral.
     * @param amountBase The amount of base tokens to borrow.
     */
    function borrow(uint256 amountBase) 
        external 
        nonReentrant
        notZeroInput(amountBase)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (credit < amountBase) revert Token__CreditLimit();
        totalDebt += amountBase;
        account_Debt[msg.sender] += amountBase;
        emit Token__Borrow(msg.sender, amountBase);
        IERC20(base).transfer(msg.sender, amountBase);
    }

    /**
     * @dev Allows borrowers to repay their borrowed base tokens, reducing their debt.
     * @param amountBase The amount of base tokens to repay.
     */
    function repay(uint256 amountBase) 
        external 
        nonReentrant
        notZeroInput(amountBase)
    {
        totalDebt -= amountBase;
        account_Debt[msg.sender] -= amountBase;
        emit Token__Repay(msg.sender, amountBase);
        IERC20(base).transferFrom(msg.sender, address(this), amountBase);
    }

    /**
     * @dev Allows token holders to claim their accumulated fees in base tokens.
     * @param account The address of the token holder claiming their fees.
     * @return claimedBase The amount of base tokens claimed as fees.
     */
    function claimFees(address account) 
        external 
        returns (uint256 claimedBase) 
    {
        _updateFor(account);

        claimedBase = claimableBase[account];

        if (claimedBase > 0) {
            claimableBase[account] = 0;

            TokenFees(fees).claimFeesFor(account, claimedBase);

            emit Token__Claim(account, claimedBase);
        }
    }

    /**
     * @dev Updates the status associated with the token, which can be a feature like a pinned message.
     * @param account The address setting the new status.
     * @param _status The new status message to be set.
     */
    function updateStatus(address account, string memory _status)
        external
        nonReentrant
    {
        if (account == address(0)) revert Token__InvalidAccount();
        if (bytes(_status).length == 0) revert Token__StatusRequired();
        if (bytes(_status).length > STATUS_MAX_LENGTH) revert Token__StatusLimitExceeded();
        burn(STATUS_FEE);
        status = _status;
        statusHolder = account;
        emit Token__StatusUpdated(account, _status);
    }

    /**
     * @dev Allows token holders to burn their tokens, reducing the total supply and shifting the bonding curve.
     * @param amount The amount of this token to be burned.
     */
    function burn(uint256 amount) 
        public 
        notZeroInput(amount)
    {
        if (maxSupply > reserveToken) {
            uint256 reserveBurn = reserveToken.mulWadDown(amount).divWadDown(maxSupply - reserveToken);
            reserveToken -= reserveBurn;
            maxSupply -= (amount + reserveBurn);
            emit Token__ReserveBurn(reserveBurn);
        } else {
            maxSupply -= amount;
        }
        _burn(msg.sender, amount);
        emit Token__Burn(msg.sender, amount);
    }

    /**
     * @dev Allows anyone to donate base tokens to the contract, to distribute as fees to token holders.
     * @param amount The amount of base tokens to donate.
     */
    function donate(uint256 amount) 
        external 
        nonReentrant
        notZeroInput(amount)
    {
        IERC20(base).transferFrom(msg.sender, address(this), amount);
        _updateBase(amount);
        emit Token__Donation(msg.sender, amount);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @dev Opens the token market for trading, allowing buy and sell operations. Can only be called by the PreToken contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preToken) revert Token__NotAuthorized();
        open = true;
    }

    /**
     * @dev Internal function to update the fee distribution index based on the total supply and collected fees.
     * @param amount The amount of base token fees collected.
     */
    function _updateBase(uint256 amount) 
        internal 
    {
        IERC20(base).transfer(fees, amount);
        totalFeesBase += amount;
        uint256 _ratio = amount.mulWadDown(1e18).divWadDown(totalSupply());
        if (_ratio > 0) {
            indexBase += _ratio;
        }
        emit Token__Fees(msg.sender, amount, 0);
    }
    
    /**
     * @dev Internal function to update the claimable fees for an account based on its token holdings and fee index.
     * @param recipient The address for which to update the claimable fees.
     */
    function _updateFor(address recipient) 
        internal 
    {
        uint256 _supplied = balanceOf(recipient);
        if (_supplied > 0) {
            uint256 _supplyIndexBase = supplyIndexBase[recipient];
            uint256 _indexBase = indexBase; 
            supplyIndexBase[recipient] = _indexBase;
            uint256 _deltaBase = _indexBase - _supplyIndexBase;
            if (_deltaBase > 0) {
                uint256 _share = _supplied.mulWadDown(_deltaBase).divWadDown(1e18);
                claimableBase[recipient] += _share;
            }
        } else {
            supplyIndexBase[recipient] = indexBase; 
        }
    }

    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Internal function that is called before any token transfer, including minting and burning.
     * This function checks if the sender has enough transferrable tokens after considering any existing debt (used as collateral).
     * It also updates the fee distribution for both the sender and the receiver.
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     * @param amount The amount of tokens being transferred.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        super._beforeTokenTransfer(from, to, amount);
        if (account_Debt[from] > 0 && amount > getAccountTransferrable(from)) revert Token__CollateralRequirement();
        _updateFor(from);
        _updateFor(to);
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
     * @dev Calculates the current market price of the token based on the bonding curve.
     * The market price is derived from the ratio of the virtual and actual reserves to the token supply.
     * @return The current market price per token.
     */
    function getMarketPrice()
        external
        view
        returns (uint256) 
    {
        return ((RESERVE_VIRTUAL_BASE + reserveBase).mulWadDown(PRECISION)).divWadDown(reserveToken);
    }

    /**
     * @dev Calculates the floor price of the token, which is the lowest price that the token can reach, based on the bonding curve.
     * The floor price is determined by the virtual reserve and the maximum supply of the token.
     * @return The floor price per token.
     */
    function getFloorPrice() 
        external 
        view 
        returns (uint256) 
    {
        return (RESERVE_VIRTUAL_BASE.mulWadDown(PRECISION)).divWadDown(maxSupply);
    }

    /**
     * @dev Calculates the borrowing credit available to an account based on its token balance.
     * This credit represents the maximum base tokens that the account can borrow.
     * @param account The address of the user for whom the credit is being calculated.
     * @return The amount of base token credit available for borrowing.
     */
    function getAccountCredit(address account) 
        public 
        view 
        returns (uint256) 
    {
        if (balanceOf(account) == 0) return 0;
        return ((RESERVE_VIRTUAL_BASE.mulWadDown(maxSupply).divWadDown(maxSupply - balanceOf(account))) - RESERVE_VIRTUAL_BASE) - account_Debt[account];
    }

    /**
     * @dev Calculates the transferrable balance of an account, considering any locked tokens due to outstanding debts.
     * This function ensures that users cannot transfer tokens that are required as collateral for borrowed base tokens.
     * @param account The address of the user for whom the transferrable balance is being calculated.
     * @return The amount of this token that the account can transfer.
     */
    function getAccountTransferrable(address account) 
        public 
        view 
        returns (uint256) 
    {
        if (account_Debt[account] == 0) return balanceOf(account);
        return balanceOf(account) - (maxSupply - (RESERVE_VIRTUAL_BASE.mulWadUp(maxSupply).divWadUp(account_Debt[account] + RESERVE_VIRTUAL_BASE)));
    }

}

contract TokenFactory {
    
    address public lastToken; // Address of the last token created

    event TokenFactory__TokenCreated(address Token);

    /**
     * @dev Creates a new `Token` contract instance and stores its address.
     * This function allows users to launch new tokens with specified parameters.
     * 
     * @param name The name of the new token to be created.
     * @param symbol The symbol of the new token.
     * @param uri The URI for the new token's metadata.
     * @param base The address of the base currency used for trading the new token.
     * @param statusHolder The initial holder of the token's status, potentially a governance role.
     * 
     * @return The address of the newly created token contract.
     */
    function createToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address base,
        address statusHolder
    ) 
        external 
        returns (address) 
    {
        lastToken = address(new Token(name, symbol, uri, base, msg.sender, statusHolder));
        emit TokenFactory__TokenCreated(lastToken);
        return lastToken;
    }
}