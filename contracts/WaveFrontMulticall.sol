// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./library/FixedPointMathLib.sol";

// Interface for the PreToken contract
interface IPreToken {
    function totalQuoteContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256);
    function ended() external view returns (bool);
    function endTimestamp() external view returns (uint256);
    function account_QuoteContributed(address account) external view returns (uint256);
}

// Interface for the main Token contract
interface IToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function wavefront() external view returns (address); // Added
    function wavefrontId() external view returns (uint256); // Added
    function reserveRealQuoteWad() external view returns (uint256);
    function reserveVirtQuoteWad() external view returns (uint256);
    function reserveTokenAmt() external view returns (uint256);
    function maxSupply() external view returns (uint256);
    function getMarketPrice() external view returns (uint256);
    function getFloorPrice() external view returns (uint256);
    function getAccountCredit(address account) external view returns (uint256);
    function getAccountTransferrable(address account) external view returns (uint256);
    function account_DebtRaw(address account) external view returns (uint256);
    function totalDebtRaw() external view returns (uint256);
    function open() external view returns (bool); // Added to check market status directly
}

// Interface for the WaveFront NFT contract (to get owner)
interface IWaveFront {
     function ownerOf(uint256 tokenId) external view returns (address owner);
}

contract WaveFrontMulticall {
    using FixedPointMathLib for uint256;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant FEE = 100; // Corresponds to Token.sol FEE
    uint256 public constant DIVISOR = 10_000; // Corresponds to Token.sol DIVISOR
    uint256 public constant PRECISION = 1e18; // Corresponds to Token.sol PRECISION

    /*----------  STATE VARIABLES  --------------------------------------*/

    // Consider if factory is still needed/used? Not used in current functions.
    // address public immutable factory; 

    enum TokenPhase {
        PRE_MARKET, // Renamed for clarity
        MARKET_OPEN, // Renamed for clarity
        REDEMPTION_AVAILABLE // Renamed for clarity
    }

    struct TokenData {
        address token;
        address quote; // Added for convenience
        address preToken; // Added for convenience
        address wavefront; // Added
        uint256 wavefrontId; // Added
        address owner; // Fetched via WaveFront

        string name;
        string symbol;
        // string uri; // Removed

        uint256 contributionEndTimestamp; // Renamed for clarity
        bool marketOpened; // Added direct flag

        uint256 marketCapCirculating; // Renamed/specified
        uint256 fullyDilutedValue; // Added for clarity (based on maxSupply)
        uint256 liquidityQuote; // Renamed/specified (Total quote in curve)
        uint256 floorPrice;
        uint256 marketPrice;
        uint256 circulatingSupply; // Added (actual ERC20 totalSupply)
        uint256 maxSupply; // Renamed from totalSupply

        uint256 totalQuoteContributed; // Renamed for clarity

        // Account specific data
        uint256 accountNativeBalance;
        uint256 accountQuoteBalance;
        uint256 accountTokenBalance;
        uint256 accountDebt;
        uint256 accountCredit;
        uint256 accountTransferable;
        uint256 accountContributedQuote; // Renamed for clarity
        uint256 accountRedeemableToken; // Renamed for clarity

        TokenPhase tokenPhase;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @notice Aggregates data for a specific Token and optionally an account.
     * @param _token Address of the Token contract.
     * @param _account Address of the user account (address(0) if no specific account data needed).
     * @return tokenData Struct containing aggregated data.
     */
    function getTokenData(address _token, address _account) external view returns (TokenData memory tokenData) {
        // --- Interface References ---
        IToken tokenContract = IToken(_token);
        // Use IERC20Metadata for name() and symbol()
        IERC20Metadata tokenMetadata = IERC20Metadata(_token);
        address preTokenAddr = tokenContract.preToken();
        IPreToken preTokenContract = IPreToken(preTokenAddr);
        address quoteAddr = tokenContract.quote();
        IERC20 quoteERC20 = IERC20(quoteAddr); // Base IERC20 is fine for balanceOf
        address wavefrontAddr = tokenContract.wavefront();
        uint256 wfId = tokenContract.wavefrontId();
        IWaveFront wavefrontContract = IWaveFront(wavefrontAddr);

        // --- Basic Data ---
        tokenData.token = _token;
        tokenData.quote = quoteAddr;
        tokenData.preToken = preTokenAddr;
        tokenData.wavefront = wavefrontAddr;
        tokenData.wavefrontId = wfId;
        tokenData.owner = wavefrontContract.ownerOf(wfId);
        tokenData.name = tokenMetadata.name();
        tokenData.symbol = tokenMetadata.symbol();

        // --- Pre-Token Phase Data ---
        tokenData.contributionEndTimestamp = preTokenContract.endTimestamp();
        tokenData.marketOpened = preTokenContract.ended(); // Use ended() directly
        tokenData.totalQuoteContributed = preTokenContract.totalQuoteContributed();

        // --- Token/Curve Data ---
        uint256 reserveReal = tokenContract.reserveRealQuoteWad();
        uint256 reserveVirt = tokenContract.reserveVirtQuoteWad();
        uint256 reserveTok = tokenContract.reserveTokenAmt();
        uint256 currentMaxSupply = tokenContract.maxSupply();
        uint256 currentCirculatingSupply = tokenMetadata.totalSupply();
        uint256 currentMarketPrice = tokenContract.getMarketPrice(); // Returns 0 if reserveToken is 0
        uint256 currentFloorPrice = tokenContract.getFloorPrice();   // Returns 0 if maxSupply is 0

        tokenData.liquidityQuote = reserveReal + reserveVirt; // Total quote value backing the curve
        tokenData.floorPrice = currentFloorPrice;
        tokenData.maxSupply = currentMaxSupply;
        tokenData.circulatingSupply = currentCirculatingSupply;

        // --- Market Calculations ---
        uint256 expectedTokenFromPreTokenBuy = 0;
        uint256 projectedMarketPricePreBuy = 0;

        // Calculate projected price if market isn't open yet, simulating the initial buy
        if (!tokenData.marketOpened && tokenData.totalQuoteContributed > 0) {
            uint256 quoteInAfterFee = tokenData.totalQuoteContributed - (tokenData.totalQuoteContributed * FEE / DIVISOR);
            uint256 currentTotalQuote = reserveReal + reserveVirt;
            // Ensure division by zero is handled if quoteInAfterFee makes newTotalQuoteReserve zero (shouldn't happen with positive contribution)
            uint256 newTotalQuoteReserve = currentTotalQuote + quoteInAfterFee;
            if (newTotalQuoteReserve > 0) {
                 // Using FixedPointMathLib for precision matching Token.sol's buy logic
                uint256 newReserveToken = currentTotalQuote.mulWadUp(reserveTok).divWadUp(newTotalQuoteReserve);
                if (reserveTok > newReserveToken) { // Prevent underflow if calculation is weird
                     expectedTokenFromPreTokenBuy = reserveTok - newReserveToken;
                }
                if (newReserveToken > 0) {
                    // Use direct call to mulDivDown for price calculation (rounding down)
                    projectedMarketPricePreBuy = FixedPointMathLib.mulDivDown(newTotalQuoteReserve, PRECISION, newReserveToken);
                }
            }
        }

        tokenData.marketPrice = tokenData.marketOpened ? currentMarketPrice : projectedMarketPricePreBuy;
        // Use direct call to mulDivDown for market cap (rounding down)
        tokenData.marketCapCirculating = FixedPointMathLib.mulDivDown(currentCirculatingSupply, tokenData.marketPrice, PRECISION);
        // Use direct call to mulDivDown for FDV (rounding down)
        tokenData.fullyDilutedValue = FixedPointMathLib.mulDivDown(currentMaxSupply, tokenData.marketPrice, PRECISION);

        // --- Account Data ---
        if (_account != address(0)) {
            tokenData.accountNativeBalance = _account.balance;
            tokenData.accountQuoteBalance = quoteERC20.balanceOf(_account);
            tokenData.accountTokenBalance = IERC20(_token).balanceOf(_account);
            tokenData.accountDebt = tokenContract.account_Debt(_account);
            tokenData.accountCredit = tokenContract.getAccountCredit(_account);
            tokenData.accountTransferable = tokenContract.getAccountTransferrable(_account);
            tokenData.accountContributedQuote = preTokenContract.account_QuoteContributed(_account);

            if (tokenData.totalQuoteContributed > 0 && tokenData.accountContributedQuote > 0) {
                 uint256 totalTokensFromPreToken = tokenData.marketOpened
                    ? preTokenContract.totalTokenBalance()
                    : expectedTokenFromPreTokenBuy;

                // Use direct call to mulDivDown for share calculation (rounding down)
                tokenData.accountRedeemableToken = FixedPointMathLib.mulDivDown(
                    totalTokensFromPreToken,
                    tokenData.accountContributedQuote,
                    tokenData.totalQuoteContributed
                );
            } else {
                tokenData.accountRedeemableToken = 0;
            }
        }

        // --- Determine Phase ---
         if (!tokenData.marketOpened) {
             // Market not opened by PreToken yet
             if (block.timestamp < tokenData.contributionEndTimestamp) {
                 tokenData.tokenPhase = TokenPhase.PRE_MARKET; // Contributions open
            } else {
                 // Contribution time ended, but market not opened (waiting for openMarket() call)
                 // If user contributed, show Redemption phase conceptually (though actual redeem call fails until marketOpened=true)
                 tokenData.tokenPhase = (tokenData.accountContributedQuote > 0) ? TokenPhase.REDEMPTION_AVAILABLE : TokenPhase.PRE_MARKET;
            }
        } else {
             // Market is opened
             if (tokenData.accountContributedQuote > 0) {
                  // Market is open, AND user still has unredeemed balance from pre-token phase
                 tokenData.tokenPhase = TokenPhase.REDEMPTION_AVAILABLE;
            } else {
                 // Market is open, user has no contribution balance (either didn't contribute or already redeemed)
                 tokenData.tokenPhase = TokenPhase.MARKET_OPEN;
             }
         }
    }

    function buyQuoteIn(
        address token, 
        uint256 quoteRawIn, 
        uint256 slippageTolerance
    ) external view returns(
        uint256 tokenAmtOut, 
        uint256 slippage, 
        uint256 minTokenAmtOut,
        uint256 autoMinTokenAmtOut
    ) {
        if (quoteRawIn == 0) return (0, 0, 0, 0);
            
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 xv = IToken(token).reserveVirtQuoteWad();

        uint256 quoteWadIn = IToken(token).rawToWad(quoteRawIn);
        uint256 feeWad = quoteWadIn * FEE / DIVISOR;
        uint256 netWad = quoteWadIn - feeWad;

        uint256 x0 = xv + xr;
        uint256 x1 = x0 + netWad;
        uint256 y0 = IToken(token).reserveTokenAmt();
        uint256 y1 = x0.mulWadUp(y0).divWadUp(x1);
        
        if (y1 >= y0) return (0, 0, 0, 0);

        tokenAmtOut = y0 - y1;
        slippage = 100 * (PRECISION - (tokenAmtOut.mulDivDown(IToken(token).getMarketPrice(), quoteWadIn)));
        minTokenAmtOut = quoteWadIn.mulDivDown(PRECISION, IToken(token).getMarketPrice()).mulDivDown(slippageTolerance, DIVISOR);
        autoMinTokenAmtOut = quoteWadIn.mulDivDown(PRECISION, IToken(token).getMarketPrice()).mulDivDown((DIVISOR * PRECISION) - ((slippage + PRECISION) * 100), DIVISOR * PRECISION);
    }

    function buyTokenOut(
        address token, 
        uint256 tokenAmtOut, 
        uint256 slippageTolerance
    ) external view returns (
        uint256 qouteRawIn,
        uint256 slippage,
        uint256 minTokenAmtOut,
        uint256 autoMinTokenAmtOut
    ) {
        uint256 xv = IToken(token).reserveVirtQuoteWad();
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 x0 = xv + xr;
        uint256 y0 = IToken(token).reserveTokenAmt();

        uint256 quoteWadIn = DIVISOR.mulDivDown(x0.mulDivDown(y0, y0 - tokenAmtOut) - x0, DIVISOR - FEE);
        qouteRawIn = IToken(token).rawToWad(quoteWadIn);
        slippage = 100 * (PRECISION - (tokenAmtOut.mulDivDown(IToken(token).getMarketPrice(), quoteWadIn)));
        minTokenAmtOut = tokenAmtOut.mulDivDown(slippageTolerance, DIVISOR);
        autoMinTokenAmtOut = tokenAmtOut.mulDivDown((DIVISOR * PRECISION) - ((slippage + PRECISION) * 100), DIVISOR * PRECISION);
    }

    function sellTokenAmt(
        address token, 
        uint256 tokenAmtIn, 
        uint256 slippageTolerance
    ) external view returns (
        uint256 quoteRawOut, 
        uint256 slippage, 
        uint256 minQuoteOut, 
        uint256 autoMinQuoteOut
    ) {}

    function sellQuoteOut(
        address token, 
        uint256 quoteRawOut, 
        uint256 slippageTolerance
    ) external view returns (
        uint256 tokenAmtIn,
        uint256 slippage,
        uint256 minTokenAmtIn,
        uint256 autoMinTokenAmtIn
    ) {}
    
}