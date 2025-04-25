// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./library/FixedPointMathLib.sol";

/**
 * @notice Interface for interacting with the parent WaveFront NFT contract.
 * @dev Defines functions to get NFT owner and treasury address.
 */
interface IWaveFront {
    /**
     * @notice Returns the owner of a specific WaveFront NFT.
     * @param tokenId The ID of the WaveFront NFT.
     * @return Address of the owner.
     */
    function ownerOf(uint256 tokenId) external view returns (address);
    /**
     * @notice Returns the treasury address configured in the WaveFront contract.
     * @return Address of the treasury.
     */
    function treasury() external view returns (address);
}

/**
 * @notice Interface for the factory contract responsible for creating PreTokens.
 * @dev Defines the function to create a PreToken associated with a WaveFrontToken.
 */
interface IPreTokenFactory {
    /**
     * @notice Creates a new PreToken contract.
     * @param token The address of the associated WaveFrontToken (this contract).
     * @param quote The address of the quote token used by the WaveFrontToken.
     * @return preTokenAddress The address of the newly created PreToken.
     */
    function createPreToken(address token, address quote) external returns (address preTokenAddress);
}

/**
 * @title WaveFrontToken (Token.sol)
 * @notice An ERC-20 token featuring a built-in constant-product AMM with real and virtual reserves,
 *         a dynamic floor price backed by virtual reserves, oracle-free credit lines based on token holdings,
 *         and fee distribution mechanisms. Integrates with a PreToken for initial launch.
 * @dev Implements ERC20, ERC20Permit, ERC20Votes. Uses FixedPointMathLib for wad math (18 decimals).
 *      AMM uses x*y=k logic incorporating virtual reserves (`reserveVirtQuoteWad`).
 *      Floor price is determined by virtual reserves relative to `maxSupply` (see `getFloorPrice`).
 *      Credit lines allow borrowing quote tokens against token balance without oracles/liquidations (see 
 *      `getAccountCredit`, `borrow`). Handles pre-market phase via `preToken` address and `openMarket` function.
 *      Swap fees can be directed to providers, the WaveFront NFT owner, and a treasury address. Reserve adjustments
 *      (`heal`, `burn`) proportionally modify reserves and max supply, raising the floor price after swaps or 
 *      direct capital/supply changes.
 * @author heesho <https://github.com/heesho>
 */
contract Token is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    /**
     * @notice Fixed-point math precision (1e18).
     */
    uint256 public constant PRECISION = 1e18;
    /**
     * @notice Initial token supply before any burns (1 billion tokens with 18 decimals).
     */
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * PRECISION;
    /**
     * @notice Base swap fee percentage (e.g., 100 = 1%). Applied to input amount.
     * @dev Fee is based on the `DIVISOR`. Current value is 1%.
     */
    uint256 public constant FEE = 100; // Represents 1% (100 / 10,000)
    /**
     * @notice Percentage of the swap fee allocated to provider/owner/treasury (e.g., 1500 = 15%).
     * @dev Each recipient (provider, owner, treasury) can receive up to this percentage of the *total fee*.
     *      Current value means each can get 15% of the 1% fee.
     */
    uint256 public constant FEE_AMOUNT = 1_500; // Represents 15% (1,500 / 10,000)
    /**
     * @notice Divisor used for calculating fee percentages (10,000 corresponds to 100%).
     */
    uint256 public constant DIVISOR = 10_000;

    /**
     * @notice Address of the parent WaveFront NFT contract. Immutable.
     */
    address public immutable wavefront;
    /**
     * @notice Address of the quote token (e.g., USDC, WETH). Immutable.
     */
    address public immutable quote;
    /**
     * @notice Address of the associated PreToken contract used for initial distribution/sale. Immutable.
     */
    address public immutable preToken;
    /**
     * @notice Address of the factory used to create the `preToken`. Immutable.
     */
    address public immutable preTokenFactory;
    /**
     * @notice ID of the corresponding WaveFront NFT for this token instance. Immutable.
     */
    uint256 public immutable wavefrontId;

    /**
     * @notice Number of decimals for the `quote` token. Immutable.
     */
    uint8 public immutable quoteDecimals;
    /**
     * @notice Scaling factor to convert `quote` token amounts (raw) to wad (18 decimals). `10**(18 - quoteDecimals)`. Immutable.
     */
    uint256 internal immutable quoteScale;

    /**
     * @notice Current maximum potential supply, factoring in burns. Used for floor price calculation. Units: tokens (18 dec).
     */
    uint256 public maxSupply = INITIAL_SUPPLY;
    /**
     * @notice Flag indicating if the public market (buy/sell) is open. Controlled by `preToken`.
     */
    bool public open = false;
    /**
     * @notice Flag indicating if the owner fee share is active. Controlled by the WaveFront NFT owner.
     */
    bool public ownerFeeActive = true;

    /**
     * @notice Real quote token reserves held by the contract AMM. Units: wad (18 dec).
     */
    uint256 public reserveRealQuoteWad;
    /**
     * @notice Virtual quote token reserves used in AMM calculations and floor price. Units: wad (18 dec). See `getFloorPrice`.
     */
    uint256 public reserveVirtQuoteWad;
    /**
     * @notice This token's reserves held by the AMM (y). Units: tokens (18 dec).
     */
    uint256 public reserveTokenAmt = INITIAL_SUPPLY;

    /**
     * @notice Total outstanding debt across all accounts. Units: raw (quote decimals).
     */
    uint256 public totalDebtRaw;
    /**
     * @notice Mapping from account address to their outstanding debt. Units: raw (quote decimals).
     */
    mapping(address => uint256) public account_DebtRaw;

    /**
     * @notice Error: Input amount cannot be zero.
     * @custom:error Input amount was zero.
     */
    error Token__ZeroInput();
    /**
     * @notice Error: Quote token decimals exceed 18.
     * @custom:error Quote token uses more than 18 decimals, which is unsupported.
     */
    error Token__QuoteDecimals();
    /**
     * @notice Error: Transaction deadline has passed.
     * @custom:error The specified deadline `block.timestamp` has been exceeded.
     */
    error Token__Expired();
    /**
     * @notice Error: Swap output amount is less than the minimum required.
     * @custom:error Slippage tolerance exceeded; output amount is lower than `minAmountOut`.
     */
    error Token__Slippage();
    /**
     * @notice Error: Attempted swap or action before the market is open.
     * @custom:error Market is not yet open for public trading.
     */
    error Token__MarketClosed();
    /**
     * @notice Error: Caller is not authorized for the action (e.g., not `preToken` or owner).
     * @custom:error Caller does not have permission to perform this operation.
     */
    error Token__NotAuthorized();
    /**
     * @notice Error: Attempted to transfer tokens locked as collateral for debt.
     * @custom:error Transfer amount exceeds transferable balance due to outstanding debt.
     */
    error Token__CollateralLocked();
    /**
     * @notice Error: Borrow amount exceeds the account's available credit limit.
     * @custom:error Requested borrow amount is greater than the calculated credit line.
     */
    error Token__CreditExceeded();
    /**
     * @notice Error: Invalid state for reserve shift calculation (maxSupply <= reserveTokenAmt).
     * @custom:error Cannot calculate reserve shifts because token reserve meets or exceeds max supply.
     */
    error Token__InvalidShift();
    /**
     * @notice Error: Division by zero during AMM calculation.
     * @custom:error An AMM calculation resulted in division by zero.
     */
    error Token__DivideByZero();
    /**
     * @notice Error: AMM calculation resulted in reserves dropping below the floor price.
     * @custom:error AMM state after swap would imply reserves below the virtual minimum.
     */
    error Token__ReserveUnderflow();
    /**
     * @notice Error: Caller is not the owner of the parent WaveFront NFT.
     * @custom:error Action restricted to the owner of the corresponding WaveFront NFT.
     */
    error Token__NotOwner();

    /**
     * @notice Emitted when a swap occurs (buy or sell).
     * @param from The address initiating the swap.
     * @param quoteInRaw Amount of quote token input (raw units). 0 for sells.
     * @param tokenIn Amount of this token input. 0 for buys.
     * @param quoteOutRaw Amount of quote token output (raw units). 0 for buys.
     * @param tokenOut Amount of this token output. 0 for sells.
     * @param to The address receiving the output tokens.
     */
    event Token__Swap(
        address indexed from,
        uint256 quoteInRaw,
        uint256 tokenIn,
        uint256 quoteOutRaw,
        uint256 tokenOut,
        address indexed to
    );
    /**
     * @notice Emitted when a provider fee is paid during a swap.
     * @param to The address of the fee provider.
     * @param quoteRaw Amount of quote fee paid (raw units). 0 for sell fees.
     * @param tokenAmt Amount of this token fee paid. 0 for buy fees.
     */
    event Token__ProviderFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    /**
     * @notice Emitted when a treasury fee is paid during a swap.
     * @param to The address of the treasury.
     * @param quoteRaw Amount of quote fee paid (raw units). 0 for sell fees.
     * @param tokenAmt Amount of this token fee paid. 0 for buy fees.
     */
    event Token__TreasuryFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    /**
     * @notice Emitted when an owner fee is paid during a swap (if active).
     * @param to The address of the WaveFront NFT owner.
     * @param quoteRaw Amount of quote fee paid (raw units). 0 for sell fees.
     * @param tokenAmt Amount of this token fee paid. 0 for buy fees.
     */
    event Token__OwnerFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    /**
     * @notice Emitted when a user intentionally burns their tokens via the `burn` function.
     * @dev Also triggers reserve adjustments (`Token__ReserveTokenBurn`).
     * @param who The address burning tokens.
     * @param tokenAmt Amount of this token burned.
     */
    event Token__Burn(address indexed who, uint256 tokenAmt);
    /**
     * @notice Emitted when a user adds quote tokens to reserves via the `heal` function.
     * @dev Also triggers reserve adjustments (`Token__ReserveQuoteHeal`).
     * @param who The address healing reserves.
     * @param quoteRaw Amount of quote token added (raw units).
     */
    event Token__Heal(address indexed who, uint256 quoteRaw);
    /**
     * @notice Emitted when token reserves are burned proportionally during a user `burn` or sell fee processing.
     * @param tokenAmt Amount of this token burned from reserves.
     */
    event Token__ReserveTokenBurn(uint256 tokenAmt);
    /**
     * @notice Emitted when virtual quote reserves are increased proportionally during a user `heal` or buy fee processing.
     * @param quoteRaw Equivalent raw quote amount added to virtual reserves.
     */
    event Token__ReserveQuoteHeal(uint256 quoteRaw);
    /**
     * @notice Emitted when a user borrows quote tokens against their token collateral.
     * @param who The address initiating the borrow (collateral provider).
     * @param to The address receiving the borrowed quote tokens.
     * @param quoteRaw Amount of quote tokens borrowed (raw units).
     */
    event Token__Borrow(address indexed who, address indexed to, uint256 quoteRaw);
    /**
     * @notice Emitted when a user repays borrowed quote tokens.
     * @param who The address initiating the repayment.
     * @param to The address whose debt is being repaid.
     * @param quoteRaw Amount of quote tokens repaid (raw units).
     */
    event Token__Repay(address indexed who, address indexed to, uint256 quoteRaw);
    /**
     * @notice Emitted when the market is opened for public trading by the PreToken contract.
     */
    event Token__MarketOpened();
    /**
     * @notice Emitted when the WaveFront NFT owner enables or disables the owner fee share.
     * @param active The new status of the owner fee (true = active, false = inactive).
     */
    event Token__OwnerFeeSet(bool active);

    /**
     * @notice Modifier to ensure an input amount is greater than zero.
     * @dev Reverts with `Token__ZeroInput` if `amount` is 0.
     */
    modifier notZero(uint256 amount) {
        if (amount == 0) revert Token__ZeroInput();
        _;
    }

    /**
     * @notice Modifier to ensure a transaction deadline has not passed.
     * @dev Reverts with `Token__Expired` if `expireTimestamp` is non-zero and less than `block.timestamp`.
     */
    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Token__Expired();
        _;
    }

    /**
     * @notice Contract constructor. Sets up immutable variables, name, symbol, and deploys PreToken.
     * @dev Initializes ERC20, ERC20Permit. Validates quote decimals. Calculates `quoteScale`. Calls `preTokenFactory`.
     * @param _name Name of this ERC-20 token.
     * @param _symbol Symbol of this ERC-20 token.
     * @param _wavefront Address of the parent WaveFront NFT contract.
     * @param _preTokenFactory Address of the factory contract for the PreToken.
     * @param _quote Address of the quote token.
     * @param _wavefrontId ID of the corresponding WaveFront NFT.
     * @param _virtQuoteRaw Initial virtual quote reserve amount (raw, quote decimals). Used for floor price calculation.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _wavefront,
        address _preTokenFactory,
        address _quote,
        uint256 _wavefrontId,
        uint256 _virtQuoteRaw
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
        quote = _quote;
        wavefrontId = _wavefrontId;

        // Validate quote decimals and calculate scaling factor
        uint8 _quoteDecimals = IERC20Metadata(_quote).decimals();
        if (_quoteDecimals > 18) revert Token__QuoteDecimals();
        quoteDecimals = _quoteDecimals;
        quoteScale = 10 ** (18 - _quoteDecimals);

        // Set initial virtual reserves (convert raw to wad)
        reserveVirtQuoteWad = rawToWad(_virtQuoteRaw);
        // Create the associated PreToken
        preToken = IPreTokenFactory(_preTokenFactory).createPreToken(address(this), _quote);
    }

    /**
     * @notice Swaps quote tokens for this token (buy).
     * @dev Calculates output amount based on constant product formula (x*y=k), applies fees, updates reserves, transfers tokens.
     *      Reverts if market is closed (unless called by `preToken`). Checks slippage and deadline.
     * @param quoteRawIn Amount of quote tokens to spend (raw, quote decimals).
     * @param minTokenAmtOut Minimum amount of this token to receive (18 decimals).
     * @param deadline Unix timestamp deadline for the transaction.
     * @param to Address to receive the output tokens.
     * @param provider Optional address to receive provider fee share.
     * @return tokenAmtOut Amount of this token received (18 decimals).
     */
    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    )
        external
        nonReentrant
        notZero(quoteRawIn)
        notExpired(deadline)
        returns (uint256 tokenAmtOut)
    {
        // Allow preToken to interact before market opens
        if (!open && msg.sender != preToken) revert Token__MarketClosed();

        // Calculate net input after 1% fee
        uint256 feeRaw = quoteRawIn * FEE / DIVISOR;
        uint256 netRaw = quoteRawIn - feeRaw;
        uint256 netWad = rawToWad(netRaw); // Convert net input to wad

        // AMM calculation: x*y = k => y1 = k / x1 = (x0*y0) / (x0 + dx)
        uint256 x0 = reserveVirtQuoteWad + reserveRealQuoteWad; // Total quote reserves (wad)
        uint256 y0 = reserveTokenAmt; // Token reserves (18 dec)
        uint256 x1 = x0 + netWad; // New total quote reserves (wad)
        if (x1 == 0) revert Token__DivideByZero(); // Should not happen if x0 >= 0 and netWad >= 0

        uint256 y1 = x0.mulWadUp(y0).divWadUp(x1); // New token reserves (18 dec), rounded up for user benefit
        tokenAmtOut = y0 - y1; // Output amount is decrease in token reserves
        if (tokenAmtOut < minTokenAmtOut) revert Token__Slippage(); // Check slippage

        // Update reserves
        reserveRealQuoteWad += netWad;
        reserveTokenAmt = y1;

        emit Token__Swap(msg.sender, quoteRawIn, 0, 0, tokenAmtOut, to);
        // Transfer quote tokens from user
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRawIn);

        // Process fees (distribute or heal reserves)
        uint256 healRaw = _processBuyFees(feeRaw, provider);
        if (healRaw > 0) _healQuoteReserves(healRaw); // Add remaining fee portion to reserves

        // Mint output tokens to recipient
        _mint(to, tokenAmtOut);
    }

    /**
     * @notice Swaps this token for quote tokens (sell).
     * @dev Calculates output amount based on constant product formula (x*y=k), applies fees, updates reserves, transfers tokens.
     *      Reverts if market is closed. Checks slippage, deadline, and reserve underflow (floor price).
     * @param tokenAmtIn Amount of this token to sell (18 decimals).
     * @param minQuoteRawOut Minimum amount of quote tokens to receive (raw, quote decimals).
     * @param deadline Unix timestamp deadline for the transaction.
     * @param to Address to receive the output quote tokens.
     * @param provider Optional address to receive provider fee share.
     * @return quoteRawOut Amount of quote tokens received (raw, quote decimals).
     */
    function sell(
        uint256 tokenAmtIn,
        uint256 minQuoteRawOut,
        uint256 deadline,
        address to,
        address provider
    )
        external
        nonReentrant
        notZero(tokenAmtIn)
        notExpired(deadline)
        returns (uint256 quoteRawOut)
    {
        if (!open) revert Token__MarketClosed(); // Market must be open for sells

        // Calculate net input after 1% fee
        uint256 feeAmt = tokenAmtIn * FEE / DIVISOR;
        uint256 netAmt = tokenAmtIn - feeAmt;

        // AMM calculation: x*y = k => x1 = k / y1 = (x0*y0) / (y0 + dy)
        uint256 x0 = reserveVirtQuoteWad + reserveRealQuoteWad; // Total quote reserves (wad)
        uint256 y0 = reserveTokenAmt; // Token reserves (18 dec)
        uint256 y1 = y0 + netAmt; // New token reserves (18 dec)
        if (y1 == 0) revert Token__DivideByZero(); // Should not happen if y0 > 0

        uint256 x1 = x0.mulWadUp(y0).divWadUp(y1); // New total quote reserves (wad), rounded up (less favorable for user)
        uint256 quoteWadOut = x0 - x1; // Output amount is decrease in quote reserves (wad)
        quoteRawOut = wadToRaw(quoteWadOut); // Convert output to raw

        if (quoteRawOut < minQuoteRawOut) revert Token__Slippage(); // Check slippage
        // Ensure real reserves don't go negative (maintain floor price)
        if (x1 < reserveVirtQuoteWad) revert Token__ReserveUnderflow();

        // Update reserves
        reserveRealQuoteWad = x1 - reserveVirtQuoteWad; // Update real reserves
        reserveTokenAmt = y1;

        emit Token__Swap(msg.sender, 0, tokenAmtIn, quoteRawOut, 0, to);
        // Burn user's input tokens
        _burn(msg.sender, tokenAmtIn);

        // Process fees (distribute or burn reserves)
        uint256 burned = _processSellFees(feeAmt, provider);
        if (burned > 0) _burnTokenReserves(burned); // Burn remaining fee portion from reserves

        // Transfer quote tokens to recipient
        IERC20(quote).safeTransfer(to, quoteRawOut);
    }

    /**
     * @notice Borrows quote tokens against the caller's token holdings as collateral.
     * @dev Calculates available credit based on `getAccountCredit`. Updates debt tracking. Transfers quote tokens.
     *      Reverts if borrow amount exceeds credit limit.
     * @param to Address to receive the borrowed quote tokens.
     * @param quoteRaw Amount of quote tokens to borrow (raw, quote decimals).
     */
    function borrow(address to, uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        uint256 credit = getAccountCredit(msg.sender); // Calculate available credit (raw)
        if (quoteRaw > credit) revert Token__CreditExceeded(); // Check limit

        // Update debt state
        totalDebtRaw += quoteRaw;
        account_DebtRaw[msg.sender] += quoteRaw;

        emit Token__Borrow(msg.sender, to, quoteRaw);
        // Transfer borrowed funds from contract's real reserves
        IERC20(quote).safeTransfer(to, quoteRaw);
    }

    /**
     * @notice Repays outstanding debt for a specified account.
     * @dev Updates debt tracking. Transfers quote tokens from the caller to the contract.
     * @param to Address whose debt is being repaid.
     * @param quoteRaw Amount of quote tokens to repay (raw, quote decimals).
     */
    function repay(address to, uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        // Update debt state (potential underflow if quoteRaw > debt, which is allowed)
        totalDebtRaw -= quoteRaw; // Consider using SafeMath if underflow is critical
        account_DebtRaw[to] -= quoteRaw; // Consider using SafeMath

        emit Token__Repay(msg.sender, to, quoteRaw);
        // Transfer repayment funds from caller to contract
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRaw);
    }

    /**
     * @notice Adds quote tokens directly to the real reserves ("heal").
     * @dev Increases both real and virtual reserves proportionally to maintain the floor price.
     *      Transfers quote tokens from the caller.
     * @param quoteRaw Amount of quote tokens to add (raw, quote decimals).
     */
    function heal(uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        // Transfer quote tokens from user
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRaw);
        // Update reserves
        _healQuoteReserves(quoteRaw);
    }

    /**
     * @notice Burns the caller's tokens and removes a proportional amount from reserves.
     * @dev Reduces `maxSupply` and `reserveTokenAmt` to maintain the floor price.
     * @param tokenAmt Amount of this token to burn (18 decimals).
     */
    function burn(uint256 tokenAmt)
        external
        nonReentrant
        notZero(tokenAmt)
    {
        // Burn user's tokens
        _burn(msg.sender, tokenAmt);
        // Update reserves
        _burnTokenReserves(tokenAmt);
    }

    /**
     * @notice Opens the market for public trading (buy/sell).
     * @dev Can only be called by the `preToken` contract, typically after its sale period ends.
     *      Reverts if caller is not `preToken`.
     */
    function openMarket()
        external
    {
        // Authorization check
        if (msg.sender != preToken) revert Token__NotAuthorized();
        open = true;
        emit Token__MarketOpened();
    }

    /**
     * @notice Enables or disables the owner's share of swap fees.
     * @dev Can only be called by the owner of the parent WaveFront NFT.
     *      Reverts if caller is not the NFT owner.
     * @param active Boolean flag: true to enable owner fees, false to disable.
     */
    function setOwnerFee(bool active) external {
        // Authorization check
        address owner = IWaveFront(wavefront).ownerOf(wavefrontId);
        if (msg.sender != owner) revert Token__NotOwner();

        ownerFeeActive = active;
        emit Token__OwnerFeeSet(active);
    }

    /**
     * @notice Converts a raw quote token amount (quote decimals) to wad (18 decimals).
     * @dev Uses the pre-calculated `quoteScale`. Unchecked for gas efficiency as overflow is impossible (max 18 decimals).
     * @param raw Amount in quote token's native decimals.
     * @return Wad representation (18 decimals).
     */
    function rawToWad(uint256 raw) public view returns (uint256) {
        // equivalent to raw * (10**(18-quoteDecimals))
        unchecked { return raw * quoteScale; }
    }

    /**
     * @notice Converts a wad amount (18 decimals) to raw quote token amount (quote decimals).
     * @dev Uses the pre-calculated `quoteScale`. Potential precision loss due to integer division.
     * @param wad Amount in 18 decimal fixed-point representation.
     * @return Raw amount in quote token's native decimals.
     */
    function wadToRaw(uint256 wad) public view returns (uint256) {
        // equivalent to wad / (10**(18-quoteDecimals))
        return wad / quoteScale; // Division truncates, potential precision loss
    }

    /**
     * @notice Internal function to distribute buy-side swap fees or add them to reserves.
     * @dev Pays provider, owner (if active), and treasury fees (up to `FEE_AMOUNT` % each). Adds remainder to reserves.
     * @param quoteRaw Total fee amount collected from a buy swap (raw, quote decimals).
     * @param provider Address designated to receive provider fee share.
     * @return remainingRaw The portion of the fee (raw) not distributed, to be healed into reserves.
     */
    function _processBuyFees(uint256 quoteRaw, address provider)
        internal
        returns (uint256 remainingRaw)
    {
        remainingRaw = quoteRaw;
        // Calculate the max share per recipient (15% of the total fee)
        uint256 shareRaw = quoteRaw * FEE_AMOUNT / DIVISOR;

        // 1. Provider Fee
        if (provider != address(0) && shareRaw > 0) {
            uint256 providerFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
            if (providerFee > 0) {
                IERC20(quote).safeTransfer(provider, providerFee);
                emit Token__ProviderFee(provider, providerFee, 0);
                remainingRaw -= providerFee;
            }
        }

        // 2. Owner Fee
        if (ownerFeeActive) {
            address owner = IWaveFront(wavefront).ownerOf(wavefrontId);
            if (owner != address(0) && remainingRaw > 0) { // Check remaining fee before transfer
                uint256 ownerFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
                if (ownerFee > 0) {
                    IERC20(quote).safeTransfer(owner, ownerFee);
                    emit Token__OwnerFee(owner, ownerFee, 0);
                    remainingRaw -= ownerFee;
                }
            }
        }

        // 3. Treasury Fee
        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingRaw > 0) { // Check remaining fee before transfer
            uint256 treasuryFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
            if (treasuryFee > 0) {
                IERC20(quote).safeTransfer(treasury, treasuryFee);
                emit Token__TreasuryFee(treasury, treasuryFee, 0);
                remainingRaw -= treasuryFee;
            }
        }

        // Return any remaining fee to be added back to reserves via _healQuoteReserves
        return remainingRaw;
    }

    /**
     * @notice Internal function to distribute sell-side swap fees or burn them from reserves.
     * @dev Mints fee shares to provider, owner (if active), and treasury (up to `FEE_AMOUNT` % each). Burns remainder from reserves.
     * @param tokenAmt Total fee amount collected from a sell swap (in this token, 18 decimals).
     * @param provider Address designated to receive provider fee share.
     * @return remainingAmt The portion of the fee (tokenAmt) not distributed, to be burned from reserves.
     */
    function _processSellFees(uint256 tokenAmt, address provider)
        internal
        returns (uint256 remainingAmt)
    {
        remainingAmt = tokenAmt;
        // Calculate the max share per recipient (15% of the total fee)
        uint256 shareAmt = tokenAmt * FEE_AMOUNT / DIVISOR;

        // 1. Provider Fee
        if (provider != address(0) && shareAmt > 0) {
            uint256 providerFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
            if (providerFee > 0) {
                _mint(provider, providerFee); // Mint fee tokens
                emit Token__ProviderFee(provider, 0, providerFee);
                remainingAmt -= providerFee;
            }
        }

        // 2. Owner Fee
        if (ownerFeeActive) {
            address owner = IWaveFront(wavefront).ownerOf(wavefrontId);
            if (owner != address(0) && remainingAmt > 0) { // Check remaining fee
                uint256 ownerFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
                if (ownerFee > 0) {
                    _mint(owner, ownerFee); // Mint fee tokens
                    emit Token__OwnerFee(owner, 0, ownerFee);
                    remainingAmt -= ownerFee;
                }
            }
        }

        // 3. Treasury Fee
        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingAmt > 0) { // Check remaining fee
            uint256 treasuryFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
            if (treasuryFee > 0) {
                _mint(treasury, treasuryFee); // Mint fee tokens
                emit Token__TreasuryFee(treasury, 0, treasuryFee);
                remainingAmt -= treasuryFee;
            }
        }

        // Return any remaining fee to be burned from reserves via _burnTokenReserves
        return remainingAmt;
    }

    /**
     * @notice Internal function to add quote tokens to reserves ("heal") and update virtual reserves proportionally.
     * @dev Increases `reserveRealQuoteWad` by `quoteRaw` and `reserveVirtQuoteWad` based on the ratio y / (m - y)
     *      to maintain the floor price F = xv / m. Reverts on `Token__InvalidShift` if m <= y.
     * @param quoteRaw Amount of quote tokens being added (raw, quote decimals).
     */
    function _healQuoteReserves(uint256 quoteRaw)
        internal
    {
        uint256 quoteWad = rawToWad(quoteRaw); // Convert input to wad
        uint256 m = maxSupply;
        uint256 y = reserveTokenAmt;
        // Avoid division by zero or invalid state where reserves exceed max supply
        if (m <= y) revert Token__InvalidShift();

        // Calculate proportional increase in virtual reserves: dv = dx * y / (m - y)
        // Where dx is the real quote added (quoteWad).
        uint256 virtAddWad = y.mulWadDown(quoteWad).divWadDown(m - y); // Calculate wad amount to add to virtual reserves

        // Update reserves
        reserveRealQuoteWad += quoteWad;
        reserveVirtQuoteWad += virtAddWad;

        emit Token__ReserveQuoteHeal(wadToRaw(virtAddWad)); // Emit the virtual component added
        emit Token__Heal(msg.sender, quoteRaw); // Emit the real component added
    }

    /**
     * @notice Internal function to burn tokens from reserves and reduce maxSupply proportionally.
     * @dev Reduces `reserveTokenAmt` and `maxSupply` based on the ratio y / (m - y) to maintain the floor price F = xv / m.
     *      Reverts on `Token__InvalidShift` if m <= y.
     * @param tokenAmt Amount of tokens being removed external to the AMM (e.g., user burn, sell fee burn).
     */
    function _burnTokenReserves(uint256 tokenAmt)
        internal
    {
        if (tokenAmt == 0) return; // No action needed if amount is zero

        uint256 m = maxSupply;
        uint256 y = reserveTokenAmt;
        // Avoid division by zero or invalid state
        if (m <= y) revert Token__InvalidShift();

        // Calculate proportional amount to burn from reserves: dy_reserve = dy_user * y / (m - y)
        uint256 reserveBurn = y.mulWadDown(tokenAmt).divWadDown(m - y); // Calculate amount to burn from internal reserve 'y'

        // Update reserves and max supply
        reserveTokenAmt -= reserveBurn; // Burn from internal reserves
        maxSupply -= (tokenAmt + reserveBurn); // Reduce max supply by total amount removed (user burn + reserve burn)

        emit Token__ReserveTokenBurn(reserveBurn); // Emit reserve component burned
        // Emit user burn if called from burn(), redundant if called from sell() fee processing but harmless.
        emit Token__Burn(msg.sender, tokenAmt);
    }

    /**
     * @dev Hook that is called after any transfer of tokens. Includes calls to standard `ERC20` and `ERC20Votes` hooks.
     * @inheritdoc ERC20Votes
     */
    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. Checks for collateral lock.
     * @inheritdoc ERC20
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        super._beforeTokenTransfer(from, to, amount);

        // Check if sender has debt and if transfer exceeds non-locked balance
        if (from != address(0) && account_DebtRaw[from] > 0) {
            uint256 transferrable = getAccountTransferrable(from);
            if (amount > transferrable) {
                revert Token__CollateralLocked();
            }
        }
    }

    /**
     * @dev Overrides `_mint` to include `ERC20Votes` logic.
     * @inheritdoc ERC20Votes
     */
    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    /**
     * @dev Overrides `_burn` to include `ERC20Votes` logic.
     * @inheritdoc ERC20Votes
     */
    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }

    /**
     * @notice Calculates the current market price based on AMM reserves.
     * @dev Price = Total Quote Reserves (wad) / Token Reserves. Returns 0 if token reserves are 0.
     * @return price Price of 1 whole token (1e18) in terms of quote tokens (wad, 18 decimals).
     */
    function getMarketPrice()
        external
        view
        returns (uint256 price)
    {
        if (reserveTokenAmt == 0) return 0; // Avoid division by zero
        uint256 totalQuoteWad = reserveVirtQuoteWad + reserveRealQuoteWad;
        // Price = x / y, expressed in wad (quote per 1e18 token)
        return totalQuoteWad.mulWadDown(PRECISION).divWadDown(reserveTokenAmt);
    }

    /**
     * @notice Calculates the immutable floor price.
     * @dev Price = Virtual Quote Reserves (wad) / Max Supply (m). F = xv / m. Returns 0 if max supply is 0.
     * @return price Floor price of 1 whole token (1e18) in terms of quote tokens (wad, 18 decimals).
     */
    function getFloorPrice()
        external
        view
        returns (uint256 price)
    {
        if (maxSupply == 0) return 0; // Avoid division by zero
        // Floor Price F = xv / m, expressed in wad (quote per 1e18 token)
        return reserveVirtQuoteWad.mulWadDown(PRECISION).divWadDown(maxSupply);
    }

    /**
     * @notice Calculates the remaining credit available for an account to borrow.
     * @dev Credit limit is based on the quote value required to back the user's non-held tokens at the floor price.
     *      Credit = Credit Limit - Current Debt. Returns 0 if balance is 0 or balance >= maxSupply.
     * @param account The address of the account.
     * @return creditRaw Available credit in quote tokens (raw, quote decimals).
     */
    function getAccountCredit(address account)
        public
        view
        returns (uint256 creditRaw)
    {
        uint256 balance = balanceOf(account);
        if (balance == 0) return 0; // No balance, no credit

        uint256 m = maxSupply;
        uint256 xv = reserveVirtQuoteWad;
        // If balance meets/exceeds max supply (theoretically possible with rounding?), credit calculation is invalid/zero.
        if (balance >= m) return 0;

        // Calculate the total virtual quote (xv') required if this account held all non-circulating supply: xv' = xv * m / (m - balance)
        uint256 requiredWad = xv.mulWadDown(m).divWadDown(m - balance);
        // Credit limit is the increase in virtual quote needed: limit = xv' - xv
        uint256 creditLimitWad = requiredWad - xv;
        uint256 creditLimitRaw = wadToRaw(creditLimitWad); // Convert limit to raw
        uint256 debtRaw = account_DebtRaw[account]; // Get current debt (raw)

        // Available credit is the limit minus current debt, floored at 0.
        creditRaw = creditLimitRaw > debtRaw ? creditLimitRaw - debtRaw : 0;
        return creditRaw;
    }

    /**
     * @notice Calculates the amount of tokens an account can transfer, considering locked collateral.
     * @dev Tokens are locked based on the amount needed to maintain collateralization of their debt at the floor price.
     *      Locked Amount = m * (1 - xv / (xv + debtWad)). Transferrable = Balance - Locked Amount.
     * @param account The address of the account.
     * @return tokenAmt Amount of this token freely transferable (18 decimals).
     */
    function getAccountTransferrable(address account)
        public
        view
        returns (uint256 tokenAmt)
    {
        uint256 debtRaw = account_DebtRaw[account];
        uint256 balance = balanceOf(account);
        if (debtRaw == 0) return balance; // No debt, all tokens are transferable

        uint256 m = maxSupply;
        uint256 xv = reserveVirtQuoteWad;
        if (xv == 0) return 0; // If floor price is zero (no virtual reserves), all tokens are effectively locked by any debt.

        // Calculate the virtual quote equivalent of the debt
        uint256 debtWad = rawToWad(debtRaw);
        // Calculate the total virtual quote backing the locked portion: required = xv + debtWad
        uint256 requiredWad = xv + debtWad;
        // Calculate the non-locked portion of max supply: nonLocked = m * xv / required
        // Avoid division by zero, though requiredWad should be > 0 if xv > 0 or debtWad > 0.
        if (requiredWad == 0) return 0;
        uint256 nonLocked = xv.mulWadDown(m).divWadDown(requiredWad);
        // Locked amount is the difference
        uint256 locked = m - nonLocked;

        // Transferrable amount is the balance minus the locked amount, floored at 0.
        tokenAmt = balance > locked ? balance - locked : 0;
        return tokenAmt;
    }
}
