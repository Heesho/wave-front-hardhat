// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./FixedPointMathLib.sol";

/**
 * @title MemeFactory
 * @author heesho
 *
 * The MemeFactory contract is designed for creating a new type of ERC20 token governed 
 * by a bonding curve. The bonding curve lives in the token and ensures liquidity at all price ranges 
 * with a constant product, facilitating dynamic pricing based on market demand. Memes are initially
 * launched via the PreMeme contract to ensure a bot-resistant and fair distribution. Once launched, 
 * meme tokens can be traded, used as collateral for borrowing, or held to earn transaction fees.
 *
 * Meme: 
 * The primary asset with a built-in bonding curve, enabling buy/sell transactions
 * with price adjustments based on supply. A virtual bonding curve is used with a constant product
 * formula (XY = K). The meme can be bought, sold, allows for liqduition free borrowing against held 
 * memes and fee accumulation for meme holders. It also uses a bonding curve shift to adjuast the 
 * reserves based on the maxSupply of meme. Buy transactions incur a 2% fee, divided among
 * the protocol treasury (20%), status holder (20%), a provider (20% optional), with the remainder 
 * going to meme holders. Sell transactions also incur a 2% fee, which is fully burned, reducing
 * maxSupply and increasing the meme's floor and market prices, also increasing the borrowing
 * capacity of the meme. The status of the meme can be updated by anyone by burning meme. The
 * meme does not need to be deposited to earn fees or borrow against it, both can be done from
 * the user's wallet. Borrowing however will not let the user transfer the meme if the collateral
 * requirement is not met.

 * PreMeme: 
 * Manages the initial distribution phase, collecting base tokens (e.g., ETH) and
 * transitioning to the open market phase for the Meme, ensuring a fair launch. Everyone
 * that participates in the PreMeme phase receives memes at the same price.
 * 
 * MemeFees: 
 * Handles the collection and distribution of transaction fees. A portion of
 * buying fees is distributed to meme holders.
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

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant DURATION = 600; // Duration in seconds for the pre-market phase

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base; // Address of the base meme (e.g., ETH)
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

    event PreMeme__Contributed(address indexed account, uint256 amount);
    event PreMeme__MarketOpened(address indexed meme, uint256 totalMemeBalance, uint256 totalBaseContributed);
    event PreMeme__Redeemed(address indexed account, uint256 amount);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Constructs the PreMeme contract.
     * @param _base Address of the base meme, typically a stablecoin or native cryptocurrency like ETH.
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
        IERC20(base).transferFrom(msg.sender, address(this), amount);
        emit PreMeme__Contributed(account, amount);
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
        IERC20(meme).transfer(account, memeAmount);
        emit PreMeme__Redeemed(account, memeAmount);
    }
    
}

contract MemeFees {

    address internal immutable base; // Base token address (e.g., ETH or a stablecoin).
    address internal immutable meme; // Address of the meme token that this contract manages fees for.

    /**
     * @dev Constructs the contract by setting the base token and associating this contract with a token.
     * @param _base The address of the base token.
     */
    constructor(address _base) {
        meme = msg.sender;
        base = _base;
    }

    /**
     * @dev Allows the Meme contract to claim fees on behalf of a user or entity.
     * This function is meant to be called by the Meme contract to distribute fees
     * to various stakeholders.
     * @param recipient The address receiving the claimed fees.
     * @param amountBase The amount of base token to be transferred as fees.
     */
    function claimFeesFor(address recipient, uint amountBase) external {
        require(msg.sender == meme);
        if (amountBase > 0) IERC20(base).transfer(recipient, amountBase);
    }

}

contract Meme is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18; // Precision for math
    uint256 public constant RESERVE_VIRTUAL_BASE = 100 * PRECISION; // Initial virtual base reserve
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION; // Initial supply of the meme token
    uint256 public constant FEE = 200; // 2% fee rate for buy/sell operations
    uint256 public constant FEE_AMOUNT = 2000; // Additional fee parameters for ditributing to stakeholders
    uint256 public constant STATUS_FEE = 1000 * PRECISION; // Fee for status update 10 tokens
    uint256 public constant STATUS_MAX_LENGTH = 280; // Maximum length of status string
    uint256 public constant DIVISOR = 10000; // Divisor for fee calculations

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable base; // Address of the base token (e.g., ETH)
    address public immutable fees; // Address of the MemeFees contract
    address public immutable waveFrontFactory; // Address of the WaveFrontFactory contract
    address public immutable preMeme; // Address of the PreMeme contract

    uint256 public maxSupply = INITIAL_SUPPLY; // Maximum supply of the meme token, can only decrease
    bool public open = false; // Flag indicating if the market is open, only the preMeme can open it

    // bonding curve state
    uint256 public reserveBase = 0; // Base reserve of the token
    uint256 public reserveMeme = INITIAL_SUPPLY; // Token reserve of the meme. Initially set to the max supply

    // fees state
    uint256 public totalFeesBase; // Total fees collected in base token
    uint256 public indexBase; // Index for calculating fees for token holders
    mapping(address => uint256) public supplyIndexBase; // Index for calculating fees for meme holders
    mapping(address => uint256) public claimableBase; // Claimable fees for meme holders

    // borrowing
    uint256 public totalDebt; // Total debt of the meme
    mapping(address => uint256) public account_Debt; // Debt of each account

    string public uri; // URI for the meme image
    string public status; // Status of the meme
    address public statusHolder; // Address of the account holding the status

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
    event Meme__Fees(address indexed account, uint256 amountBase, uint256 amountMeme);
    event Meme__Claim(address indexed account, uint256 amountBase);
    event Meme__ProviderFee(address indexed account, uint256 amountBase);
    event Meme__ProtocolFee(address indexed account, uint256 amountBase);
    event Meme__Burn(address indexed account, uint256 amountMeme);
    event Meme__ReserveBurn(uint256 amountMeme);
    event Meme__Borrow(address indexed account, uint256 amountBase);
    event Meme__Repay(address indexed account, uint256 amountBase);
    event Meme__StatusFee(address indexed account, uint256 amountBase);
    event Meme__StatusUpdated(address indexed account, string status);
    event Meme__Donation(address indexed account, uint256 amountBase);

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
        status = "Input status here";
        statusHolder = _statusHolder;
        waveFrontFactory = _waveFrontFactory;
        base = _base;
        fees = address(new MemeFees(_base));
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

        uint256 feeBase = amountIn.mulWadDown(FEE).divWadDown(DIVISOR);
        uint256 newReserveBase = RESERVE_VIRTUAL_BASE + reserveBase + amountIn - feeBase;
        uint256 newReserveMeme = (RESERVE_VIRTUAL_BASE + reserveBase).mulWadUp(reserveMeme).divWadUp(newReserveBase);
        uint256 amountOut = reserveMeme - newReserveMeme;

        if (amountOut < minAmountOut) revert Meme__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveMeme = newReserveMeme;

        emit Meme__Buy(msg.sender, to, amountIn, amountOut);

        IERC20(base).transferFrom(msg.sender, address(this), amountIn);
        uint256 feeAmount = feeBase.mulWadDown(FEE_AMOUNT).divWadDown(DIVISOR);
        if (provider != address(0)) {
            IERC20(base).transfer(provider, feeAmount);
            emit Meme__ProviderFee(provider, feeAmount);
            feeBase -= feeAmount;
        }
        IERC20(base).transfer(statusHolder, feeAmount);
        emit Meme__StatusFee(statusHolder, feeAmount);
        IERC20(base).transfer(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        emit Meme__ProtocolFee(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        feeBase -= (2* feeAmount);

        _mint(to, amountOut);
        _updateBase(feeBase); 
    }

    /**
     * @dev Allows meme token holders to sell their tokens back to the bonding curve.
     * A fee is applied to the sale, which is then burned, reducing the total supply and adjusting the bonding curve.
     * @param amountIn The amount of this meme token being sold.
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
        uint256 feeMeme = amountIn.mulWadDown(FEE).divWadDown(DIVISOR);
        uint256 newReserveMeme = reserveMeme + amountIn - feeMeme;
        uint256 newReserveBase = (RESERVE_VIRTUAL_BASE + reserveBase).mulWadUp(reserveMeme).divWadUp(newReserveMeme);
        uint256 amountOut = RESERVE_VIRTUAL_BASE + reserveBase - newReserveBase;

        if (amountOut < minAmountOut) revert Meme__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveMeme = newReserveMeme;

        emit Meme__Sell(msg.sender, to, amountIn, amountOut);

        _burn(msg.sender, amountIn - feeMeme);
        burn(feeMeme);
        IERC20(base).transfer(to, amountOut);
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
        emit Meme__Repay(msg.sender, amountBase);
        IERC20(base).transferFrom(msg.sender, address(this), amountBase);
    }

    /**
     * @dev Allows meme holders to claim their accumulated fees in base tokens.
     * @param account The address of the meme holder claiming their fees.
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

            MemeFees(fees).claimFeesFor(account, claimedBase);

            emit Meme__Claim(account, claimedBase);
        }
    }

    /**
     * @dev Updates the status associated with the meme, which can be a feature like a pinned message.
     * @param account The address setting the new status.
     * @param _status The new status message to be set.
     */
    function updateStatus(address account, string memory _status)
        external
        nonReentrant
    {
        if (account == address(0)) revert Meme__InvalidAccount();
        if (bytes(_status).length == 0) revert Meme__StatusRequired();
        if (bytes(_status).length > STATUS_MAX_LENGTH) revert Meme__StatusLimitExceeded();
        burn(STATUS_FEE);
        status = _status;
        statusHolder = account;
        emit Meme__StatusUpdated(account, _status);
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
            emit Meme__ReserveBurn(reserveBurn);
        } else {
            maxSupply -= amount;
        }
        _burn(msg.sender, amount);
        emit Meme__Burn(msg.sender, amount);
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
        emit Meme__Donation(msg.sender, amount);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @dev Opens the meme token market for trading, allowing buy and sell operations. Can only be called by the PreMeme contract.
     */
    function openMarket() 
        external 
    {
        if (msg.sender != preMeme) revert Meme__NotAuthorized();
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
        emit Meme__Fees(msg.sender, amount, 0);
    }
    
    /**
     * @dev Internal function to update the claimable fees for an account based on its meme token holdings and fee index.
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
     * @dev Calculates the current market price of the meme based on the bonding curve.
     * The market price is derived from the ratio of the virtual and actual reserves to the meme token supply.
     * @return The current market price per meme.
     */
    function getMarketPrice()
        external
        view
        returns (uint256) 
    {
        return ((RESERVE_VIRTUAL_BASE + reserveBase).mulWadDown(PRECISION)).divWadDown(reserveMeme);
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
        return (RESERVE_VIRTUAL_BASE.mulWadDown(PRECISION)).divWadDown(maxSupply);
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
        return ((RESERVE_VIRTUAL_BASE.mulWadDown(maxSupply).divWadDown(maxSupply - balanceOf(account))) - RESERVE_VIRTUAL_BASE) - account_Debt[account];
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
        return balanceOf(account) - (maxSupply - (RESERVE_VIRTUAL_BASE.mulWadUp(maxSupply).divWadUp(account_Debt[account] + RESERVE_VIRTUAL_BASE)));
    }

}

contract MemeFactory {
    
    address public lastMeme; // Address of the last meme token created

    event MemeFactory__MemeCreated(address meme);

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
        lastMeme = address(new Meme(name, symbol, uri, base, msg.sender, statusHolder));
        emit MemeFactory__MemeCreated(lastMeme);
        return lastMeme;
    }
}