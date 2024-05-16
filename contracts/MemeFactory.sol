// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./FixedPointMathLib.sol";

/**
 * @title MemeFactory
 * @author heesho
 *
 * The MemeFactory contract is designed for creating a new type of ERC20 token governed 
 * by a bonding curve. The bonding curve lives in the token and ensures liquidity at all price ranges 
 * with a constant product, facilitating dynamic pricing based on market demand. Memes are initially
 * launched via the PreMeme contract to ensure a bot-resistant and fair distribution. Once launched, 
 * meme tokens can be traded used to update the status, or used as collateral for borrowing.
 *
 * Meme: 
 * The primary asset with a built-in bonding curve, enabling buy/sell transactions
 * with price adjustments based on supply. A virtual bonding curve is used with a constant product
 * formula (XY = K). The meme can be bought, sold, allows for liqduition free borrowing against held 
 * memes and fee accumulation for meme holders. It also uses a bonding curve shift to adjuast the 
 * reserves based on the maxSupply of meme. Buy and sell transactions incur a 2% fee, divided among
 * the protocol treasury (12.5%), status holder (12.5%), creator (12.5%), a provider (12.5% optional),
 * For buys the remainder (50%) is used to shift the bonding curve (increasing the base reserves). 
 * For sells the remainder (50%) is used to shift the bonding curve (decreasing the meme reserves). 
 * Both cases increase the floor price, market price, and borrowing capacity of the meme. The meme
 * The status of the meme can be updated by anyone by burning meme. The meme does not need to be 
 * deposited to borrow against it, this can be done from the user's wallet. Borrowing however will 
 * not let the user transfer the meme if the collateral requirement is not met.

 * PreMeme: 
 * Manages the initial distribution phase, collecting base tokens (e.g., wETH) and
 * transitioning to the open market phase for the Meme, ensuring a fair launch. Everyone
 * that participates in the PreMeme phase receives memes at the same price.
 * 
 * MemeFactory: 
 * Facilitates the creation of new Meme instances, integrating them with the
 * bonding curve and fee mechanisms, and linking to the PreMeme for initial distribution.
 *
 */

interface IWaveFrontFactory {
    function treasury() external view returns (address);
}

contract PreMeme is ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant DURATION = 600; // Duration in seconds for the pre-market phase

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base; // Address of the base meme (e.g., wETH)
    address public immutable meme; // Address of the meme token deployed

    uint256 public immutable endTimestamp; // Timestamp when the pre-market phase ends
    bool public ended = false; // Flag indicating if the pre-market phase has ended

    uint256 public totalMemeBalance; // Total balance of the meme tokens distributed after pre-market
    uint256 public totalBaseContributed; // Total base memes contributed during the pre-market phase
    mapping(address => uint256) public account_BaseContributed; // Base memes contributed by each account

    /*----------  ERRORS ------------------------------------------------*/

    error PreMeme__ZeroInput();
    error PreMeme__Concluded();
    error PreMeme__InProgress();
    error PreMeme__NotEligible();

    /*----------  EVENTS ------------------------------------------------*/

    event PreMeme__Contributed(address indexed meme, address indexed account, uint256 amount);
    event PreMeme__MarketOpened(address indexed meme, uint256 totalMemeBalance, uint256 totalBaseContributed);
    event PreMeme__Redeemed(address indexed meme, address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the PreMeme contract.
     * @param _base Address of the base meme, typically a stablecoin or native cryptocurrency like wETH.
     */
    constructor(address _base) {
        base = _base;
        meme = msg.sender;
        endTimestamp = block.timestamp + DURATION;
    }

    /**
     * @dev Allows users to contribute base tokens during the pre-market phase.
     * @param account The account making the contribution.
     * @param amount The amount of base tokens to contribute.
     */
    function contribute(address account, uint256 amount) external nonReentrant {
        if (amount == 0) revert PreMeme__ZeroInput();
        if (ended) revert PreMeme__Concluded();
        totalBaseContributed += amount;
        account_BaseContributed[account] += amount;
        IERC20(base).safeTransferFrom(msg.sender, address(this), amount);
        emit PreMeme__Contributed(meme, account, amount);
    }

    /**
     * @dev Opens the market for the meme token, ending the pre-market phase.
     * Can only be called after the pre-market phase duration has ended.
     */
    function openMarket() external {
        if (endTimestamp > block.timestamp) revert PreMeme__InProgress();
        if (ended) revert PreMeme__Concluded();
        ended = true;
        IERC20(base).approve(meme, totalBaseContributed);
        Meme(meme).buy(totalBaseContributed, 0, 0, address(this), address(0));
        totalMemeBalance = IERC20(meme).balanceOf(address(this));
        Meme(meme).openMarket();
        emit PreMeme__MarketOpened(meme, totalMemeBalance, totalBaseContributed);
    }

    /**
     * @dev Allows users who contributed during the pre-market phase to redeem their new meme tokens.
     * @param account The account redeeming its contribution for new memes.
     */
    function redeem(address account) external nonReentrant {
        if (!ended) revert PreMeme__InProgress();
        uint256 contribution = account_BaseContributed[account];
        if (contribution == 0) revert PreMeme__NotEligible();
        account_BaseContributed[account] = 0;
        uint256 memeAmount = totalMemeBalance.mulWadDown(contribution).divWadDown(totalBaseContributed);
        IERC20(meme).safeTransfer(account, memeAmount);
        emit PreMeme__Redeemed(meme, account, memeAmount);
    }
    
}

contract Meme is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18; // Precision for math
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; // Initial supply of the meme token
    uint256 public constant FEE = 200; // 2% fee rate for buy/sell operations
    uint256 public constant FEE_AMOUNT = 1250; // Additional fee parameters for ditributing to stakeholders
    uint256 public constant STATUS_FEE = 1000 * PRECISION; // Fee for status update 10 tokens
    uint256 public constant STATUS_MAX_LENGTH = 280; // Maximum length of status string
    uint256 public constant DIVISOR = 10000; // Divisor for fee calculations

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable base; // Address of the base token (e.g., wETH)
    address public immutable waveFrontFactory; // Address of the WaveFrontFactory contract
    address public immutable preMeme; // Address of the PreMeme contract

    uint256 public maxSupply = INITIAL_SUPPLY; // Maximum supply of the meme token, can only decrease
    bool public open = false; // Flag indicating if the market is open, only the preMeme can open it

    // bonding curve state
    uint256 public reserveRealBase = 0; // Base reserve of the token
    uint256 public reserveVirtualBase = 100 * PRECISION; // Virtual base reserve of the token
    uint256 public reserveMeme = INITIAL_SUPPLY; // Token reserve of the meme. Initially set to the max supply

    // borrowing
    uint256 public totalDebt; // Total debt of the meme
    mapping(address => uint256) public account_Debt; // Debt of each account

    string public uri; // URI for the meme image
    string public status; // Status of the meme
    address public statusHolder; // Address of the account holding the status
    address public creator; // Address of the meme creator

    /*----------  ERRORS ------------------------------------------------*/

    error Meme__ZeroInput();
    error Meme__Expired();
    error Meme__SlippageToleranceExceeded();
    error Meme__MarketNotOpen();
    error Meme__NotAuthorized();
    error Meme__CollateralRequirement();
    error Meme__CreditLimit();
    error Meme__InvalidAccount();
    error Meme__StatusRequired();
    error Meme__StatusLimitExceeded();

    /*----------  ERRORS ------------------------------------------------*/

    event Meme__Buy(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Meme__Sell(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Meme__ProviderFee(address indexed account, uint256 amountBase, uint256 amountMeme);
    event Meme__ProtocolFee(address indexed account, uint256 amountBase, uint256 amountMeme);
    event Meme__CreatorFee(address indexed account, uint256 amountBase, uint256 amountMeme);
    event Meme__StatusFee(address indexed account, uint256 amountBase, uint256 amountMeme);
    event Meme__Burn(address indexed account, uint256 amountMeme);
    event Meme__Donated(address indexed account, uint256 amountBase);
    event Meme__ReserveMemeBurn(uint256 amountMeme);
    event Meme__ReserveVirtualBaseAdd(uint256 amountBase);
    event Meme__ReserveRealBaseAdd(uint256 amountBase);
    event Meme__Borrow(address indexed account, uint256 amountBase);
    event Meme__Repay(address indexed account, uint256 amountBase);
    event Meme__StatusUpdated(address indexed oldAccount, address indexed newAccount, string status);
    event Meme__MarketOpened();
    event Meme__CreatorUpdated(address indexed oldCreator, address indexed newCreator);

    /*----------  MODIFIERS  --------------------------------------------*/

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Meme__Expired();
        _;
    }

    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert Meme__ZeroInput();
        _;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the Meme contract with initial settings.
     * @param _name Name of the meme.
     * @param _symbol Symbol of the meme.
     * @param _uri URI for meme metadata.
     * @param _base Address of the base meme.
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
        status = "Overwrite to own the meme and earn swap fees.";
        statusHolder = _statusHolder;
        creator = _statusHolder;
        waveFrontFactory = _waveFrontFactory;
        base = _base;
        preMeme = address(new PreMeme(_base));
    }

    /**
     * @dev Executes a meme purchase operation within the bonding curve mechanism.
     * Calculates the necessary fees, updates reserves, and mints the meme tokens to the buyer.
     * @param amountIn The amount of base tokens provided for the purchase.
     * @param minAmountOut The minimum amount of this meme token expected to be received, for slippage control.
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
        if (!open && msg.sender != preMeme) revert Meme__MarketNotOpen();

        uint256 feeBase = amountIn * FEE / DIVISOR;
        uint256 newReserveBase = reserveVirtualBase + reserveRealBase + amountIn - feeBase;
        uint256 newReserveMeme = (reserveVirtualBase + reserveRealBase).mulWadUp(reserveMeme).divWadUp(newReserveBase);
        uint256 amountOut = reserveMeme - newReserveMeme;

        if (amountOut < minAmountOut) revert Meme__SlippageToleranceExceeded();

        reserveRealBase = newReserveBase - reserveVirtualBase;
        reserveMeme = newReserveMeme;

        emit Meme__Buy(msg.sender, to, amountIn, amountOut);

        IERC20(base).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 feeAmount = feeBase * FEE_AMOUNT / DIVISOR;
        if (provider != address(0)) {
            IERC20(base).safeTransfer(provider, feeAmount);
            emit Meme__ProviderFee(provider, feeAmount, 0);
            feeBase -= feeAmount;
        }
        IERC20(base).safeTransfer(statusHolder, feeAmount);
        emit Meme__StatusFee(statusHolder, feeAmount, 0);
        IERC20(base).safeTransfer(creator, feeAmount);
        emit Meme__CreatorFee(creator, feeAmount, 0);
        address treasury = IWaveFrontFactory(waveFrontFactory).treasury();
        IERC20(base).safeTransfer(treasury, feeAmount);
        emit Meme__ProtocolFee(treasury, feeAmount, 0);
        feeBase -= (3 * feeAmount);

        _mint(to, amountOut);
        _add(feeBase); 
    }

    /**
     * @dev Allows meme token holders to sell their tokens back to the bonding curve.
     * A fee is applied to the sale, which is then burned, reducing the total supply and adjusting the bonding curve.
     * @param amountIn The amount of this meme token being sold.
     * @param minAmountOut The minimum amount of base token expected in return, for slippage control.
     * @param expireTimestamp Timestamp after which the transaction is not valid.
     * @param to The address receiving the base token from the sale.
     */
    function sell(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) 
        external 
        nonReentrant
        notZeroInput(amountIn)
        notExpired(expireTimestamp) 
    {
        uint256 feeMeme = amountIn * FEE / DIVISOR;
        uint256 newReserveMeme = reserveMeme + amountIn - feeMeme;
        uint256 newReserveBase = (reserveVirtualBase + reserveRealBase).mulWadUp(reserveMeme).divWadUp(newReserveMeme);
        uint256 amountOut = reserveVirtualBase + reserveRealBase - newReserveBase;

        if (amountOut < minAmountOut) revert Meme__SlippageToleranceExceeded();

        reserveRealBase = newReserveBase - reserveVirtualBase;
        reserveMeme = newReserveMeme;

        emit Meme__Sell(msg.sender, to, amountIn, amountOut);
        
        uint256 feeAmount = feeMeme * FEE_AMOUNT / DIVISOR;
        if (provider != address(0)) {
            _mint(provider, feeAmount);
            emit Meme__ProviderFee(provider, 0, feeAmount);
            feeMeme -= feeAmount;
        }
        _mint(statusHolder, feeAmount);
        emit Meme__StatusFee(statusHolder, 0, feeAmount);
        _mint(creator, feeAmount);
        emit Meme__CreatorFee(creator, 0, feeAmount);
        address treasury = IWaveFrontFactory(waveFrontFactory).treasury();
        _mint(treasury, feeAmount);
        emit Meme__ProtocolFee(treasury, 0, feeAmount);
        feeMeme -= (3 * feeAmount);

        _burn(msg.sender, amountIn - feeMeme);
        burn(feeMeme);
        IERC20(base).safeTransfer(to, amountOut);
    }

    /**
     * @dev Allows meme holders to borrow base tokens against their meme holdings as collateral.
     * @param amountBase The amount of base tokens to borrow.
     */
    function borrow(uint256 amountBase) 
        external 
        nonReentrant
        notZeroInput(amountBase)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (credit < amountBase) revert Meme__CreditLimit();
        totalDebt += amountBase;
        account_Debt[msg.sender] += amountBase;
        emit Meme__Borrow(msg.sender, amountBase);
        IERC20(base).safeTransfer(msg.sender, amountBase);
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
        emit Meme__Repay(msg.sender, amountBase);
        IERC20(base).safeTransferFrom(msg.sender, address(this), amountBase);
    }

    /**
     * @dev Updates the status associated with the meme, which can be a feature like a pinned message.
     * @param account The address setting the new status.
     * @param newStatus The new status message to be set.
     */
    function updateStatus(address account, string memory newStatus)
        external
        nonReentrant
    {
        if (account == address(0)) revert Meme__InvalidAccount();
        if (bytes(newStatus).length == 0) revert Meme__StatusRequired();
        if (bytes(newStatus).length > STATUS_MAX_LENGTH) revert Meme__StatusLimitExceeded();
        emit Meme__StatusUpdated(statusHolder, account, newStatus);
        burn(STATUS_FEE);
        status = newStatus;
        statusHolder = account;
    }

    /**
     * @dev Allows meme holders to burn their meme tokens, reducing the total supply and shifting the bonding curve.
     * @param amount The amount of this meme token to be burned.
     */
    function burn(uint256 amount) 
        public 
        notZeroInput(amount)
    {
        if (maxSupply > reserveMeme) {
            uint256 reserveBurn = reserveMeme.mulWadDown(amount).divWadDown(maxSupply - reserveMeme);
            reserveMeme -= reserveBurn;
            maxSupply -= (amount + reserveBurn);
            emit Meme__ReserveMemeBurn(reserveBurn);
        } else {
            maxSupply -= amount;
        }
        _burn(msg.sender, amount);
        emit Meme__Burn(msg.sender, amount);
    }

    /**
     * @dev Allows users to donate base tokens to the meme contract, increasing the base reserves.
     * @param amount The amount of base tokens to donate.
     */
    function donate(uint256 amount) 
        external 
        nonReentrant
    {
        emit Meme__Donated(msg.sender, amount);
        IERC20(base).safeTransferFrom(msg.sender, address(this), amount);
        _add(amount);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function _add(uint256 amount) 
        internal 
        notZeroInput(amount)
    {
        if (maxSupply > reserveMeme) {
            uint256 reserveAdd = reserveMeme.mulWadDown(amount).divWadDown(maxSupply - reserveMeme);
            reserveRealBase += amount;
            reserveVirtualBase += reserveAdd;
            emit Meme__ReserveVirtualBaseAdd(reserveAdd);
        } else {
            reserveRealBase += amount;
        }
        emit Meme__ReserveRealBaseAdd(amount);
    }

    /**
     * @dev Opens the meme token market for trading, allowing buy and sell operations. Can only be called by the PreMeme contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preMeme) revert Meme__NotAuthorized();
        open = true;
        emit Meme__MarketOpened();
    }

    function setCreator(address newCreator) 
        external 
    {
        if (msg.sender != creator) revert Meme__NotAuthorized();
        emit Meme__CreatorUpdated(creator, newCreator);
        creator = newCreator;
    }

    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Internal function that is called before any meme token transfer, including minting and burning.
     * This function checks if the sender has enough transferrable memes after considering any existing debt (used as collateral).
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
        if (account_Debt[from] > 0 && amount > getAccountTransferrable(from)) revert Meme__CollateralRequirement();
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
     * @dev Calculates the current market price of the meme based on the bonding curve.
     * The market price is derived from the ratio of the virtual and actual reserves to the meme token supply.
     * @return The current market price per meme.
     */
    function getMarketPrice()
        external
        view
        returns (uint256) 
    {
        return ((reserveVirtualBase + reserveRealBase).mulWadDown(PRECISION)).divWadDown(reserveMeme);
    }

    /**
     * @dev Calculates the floor price of the meme, which is the lowest price that the meme can reach, based on the bonding curve.
     * The floor price is determined by the virtual reserve and the maximum supply of the meme token.
     * @return The floor price per token.
     */
    function getFloorPrice() 
        external 
        view 
        returns (uint256) 
    {
        return (reserveVirtualBase.mulWadDown(PRECISION)).divWadDown(maxSupply);
    }

    /**
     * @dev Calculates the borrowing credit available to an account based on its meme balance.
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
        return ((reserveVirtualBase.mulWadDown(maxSupply).divWadDown(maxSupply - balanceOf(account))) - reserveVirtualBase) - account_Debt[account];
    }

    /**
     * @dev Calculates the transferrable balance of an account, considering any locked memes due to outstanding debts.
     * This function ensures that users cannot transfer memes that are required as collateral for borrowed base tokens.
     * @param account The address of the user for whom the transferrable balance is being calculated.
     * @return The amount of this meme that the account can transfer.
     */
    function getAccountTransferrable(address account) 
        public 
        view 
        returns (uint256) 
    {
        if (account_Debt[account] == 0) return balanceOf(account);
        return balanceOf(account) - (maxSupply - (reserveVirtualBase.mulWadUp(maxSupply).divWadUp(account_Debt[account] + reserveVirtualBase)));
    }

}

contract MemeFactory is Ownable {

    address waveFrontFactory;

    error MemeFactory__NotAuthorized();

    event MemeFactory__MemeCreated(address meme);

    constructor() {
        waveFrontFactory = msg.sender;
    }

    /**
     * @dev Creates a new `Meme` contract instance and stores its address.
     * This function allows users to launch new memes with specified parameters.
     * 
     * @param name The name of the new meme to be created.
     * @param symbol The symbol of the new meme.
     * @param uri The URI for the new meme's metadata.
     * @param base The address of the base currency used for trading the new meme.
     * @param statusHolder The initial holder of the meme's status, potentially a governance role.
     * 
     * @return The address of the newly created meme contract.
     */
    function createMeme(
        string memory name,
        string memory symbol,
        string memory uri,
        address base,
        address statusHolder
    ) 
        external 
        returns (address) 
    {
        if (msg.sender != waveFrontFactory) revert MemeFactory__NotAuthorized();
        address lastMeme = address(new Meme(name, symbol, uri, base, msg.sender, statusHolder));
        emit MemeFactory__MemeCreated(lastMeme);
        return lastMeme;
    }

    /**
     * @dev Allows the WaveFrontFactory contract to update the address of the WaveFrontFactory contract.
     * @param _waveFrontFactory The new address of the WaveFrontFactory contract.
     */
    function setWaveFrontFactory(address _waveFrontFactory) 
        external
        onlyOwner
    {
        waveFrontFactory = _waveFrontFactory;
    }
}