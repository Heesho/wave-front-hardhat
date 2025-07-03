// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./library/FixedPointMathLib.sol";

interface IPreToken {
    function totalQuoteRaw() external view returns (uint256);
    function totalTokenAmt() external view returns (uint256);
    function ended() external view returns (bool);
    function endTime() external view returns (uint256);
    function account_QuoteRaw(address account) external view returns (uint256);
}

interface IToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function wavefront() external view returns (address);
    function wavefrontId() external view returns (uint256);
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
    function open() external view returns (bool);
    function rawToWad(uint256 raw) external view returns (uint256);
    function wadToRaw(uint256 wad) external view returns (uint256);
}

interface IWaveFront {
     function ownerOf(uint256 tokenId) external view returns (address owner);
     function tokenURI(uint256 tokenId) external view returns (string memory);
}

contract WaveFrontMulticall {
    using FixedPointMathLib for uint256;

    uint256 public constant FEE = 100;
    uint256 public constant DIVISOR = 10_000;
    uint256 public constant PRECISION = 1e18;

    enum TokenPhase {
        MARKET,
        CONTRIBUTE,
        REDEEM
    }

    struct TokenData {
        address token;
        address quote;
        address preToken;
        address wavefront;
        uint256 wavefrontId;
        address owner;

        string name;
        string symbol;
        string uri;

        uint256 preTokenEnd;
        bool marketOpen;

        uint256 marketCap;
        uint256 liquidity;
        uint256 floorPrice;
        uint256 marketPrice;
        uint256 circulatingSupply;
        uint256 maxSupply;

        uint256 totalQuoteContributed;

        uint256 accountNativeBalance;
        uint256 accountQuoteBalance;
        uint256 accountTokenBalance;
        uint256 accountDebt;
        uint256 accountCredit;
        uint256 accountTransferrable;
        uint256 accountContributed;
        uint256 accountRedeemable;

        TokenPhase tokenPhase;
    }

    function getTokenData(address token, address account) external view returns (TokenData memory tokenData) {
        address quote = IToken(token).quote();
        address preToken = IToken(token).preToken();
        address wavefront = IToken(token).wavefront();
        uint256 wavefrontId = IToken(token).wavefrontId();
        bool marketOpen = IToken(token).open();
        uint256 totalContributed = IPreToken(preToken).totalQuoteRaw();
        uint256 xv = IToken(token).reserveVirtQuoteWad();
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 x0 = xv + xr;
        uint256 y0 = IToken(token).reserveTokenAmt();

        uint256 x1 = x0 + totalContributed - (totalContributed * FEE / DIVISOR);
        uint256 y1 = x0.mulDivDown(y0, x1);
        uint256 expectedTokenAmt = y0 - y1;
        
        tokenData.token = token;
        tokenData.quote = quote;
        tokenData.preToken = preToken;
        tokenData.wavefront = wavefront;
        tokenData.wavefrontId = wavefrontId;
        tokenData.owner = IWaveFront(wavefront).ownerOf(wavefrontId);

        tokenData.name = IERC20Metadata(token).name();
        tokenData.symbol = IERC20Metadata(token).symbol();
        tokenData.uri = IWaveFront(wavefront).tokenURI(wavefrontId);

        tokenData.preTokenEnd = IPreToken(preToken).endTime();
        tokenData.marketOpen = marketOpen;

        tokenData.marketCap = marketOpen ? IToken(token).wadToRaw(IToken(token).maxSupply().mulDivDown(IToken(token).getMarketPrice(), PRECISION)) : totalContributed;
        tokenData.liquidity = IToken(token).wadToRaw(IToken(token).reserveRealQuoteWad() + IToken(token).reserveVirtQuoteWad()) * 2;
        tokenData.floorPrice = IToken(token).getFloorPrice();
        tokenData.marketPrice = marketOpen ? IToken(token).getMarketPrice() : x1.mulDivDown(PRECISION, y1);
        tokenData.circulatingSupply = IERC20(token).totalSupply();
        tokenData.maxSupply = IToken(token).maxSupply();

        tokenData.totalQuoteContributed = totalContributed;

        if (account != address(0)) {
            tokenData.accountNativeBalance = account.balance;
            tokenData.accountQuoteBalance = IERC20(quote).balanceOf(account);
            tokenData.accountTokenBalance = IERC20(token).balanceOf(account);
            tokenData.accountDebt = IToken(token).account_DebtRaw(account);
            tokenData.accountCredit = IToken(token).getAccountCredit(account);
            tokenData.accountTransferrable = IToken(token).getAccountTransferrable(account);
            tokenData.accountContributed = IPreToken(preToken).account_QuoteRaw(account);
            if (totalContributed > 0) {
                tokenData.accountRedeemable = marketOpen ? IPreToken(preToken).totalTokenAmt().mulDivDown(tokenData.accountContributed, totalContributed) : 
                    expectedTokenAmt.mulDivDown(tokenData.accountContributed, totalContributed);
            } else {
                tokenData.accountRedeemable = 0;
            }
        }

        if (!marketOpen && block.timestamp < tokenData.preTokenEnd) {
            tokenData.tokenPhase = TokenPhase.CONTRIBUTE;
        } else if (!marketOpen && block.timestamp >= tokenData.preTokenEnd) {
            if (tokenData.accountContributed > 0) {
                tokenData.tokenPhase = TokenPhase.REDEEM;
            } else {
                tokenData.tokenPhase = TokenPhase.CONTRIBUTE;
            }
        } else {
            if (tokenData.accountContributed > 0) {
                tokenData.tokenPhase = TokenPhase.REDEEM;
            } else {
                tokenData.tokenPhase = TokenPhase.MARKET;
            }
        }

        return tokenData;
    }

    // --- Function: buyQuoteIn ---
    /**
     * @notice Calculates the expected token output for a given quote input (buy simulation).
     * @dev Performs off-chain calculation using the Token contract's AMM logic and reserves. Does not execute a swap.
     * @param token The address of the WaveFrontToken (Token.sol).
     * @param quoteRawIn The amount of quote token input (raw).
     * @param slippageTolerance The maximum allowed slippage percentage (e.g., 9950 for 0.5% slippage). Used to calculate `minTokenAmtOut`.
     * @return tokenAmtOut Expected token output (18 dec).
     * @return slippage Calculated slippage percentage * 100 (scaled by 100). Based on original code's formula.
     * @return minTokenAmtOut Minimum token output based on quote input, market price and `slippageTolerance` (18 dec). Based on original code's formula.
     * @return autoMinTokenAmtOut Minimum token output based on quote input, market price and calculated `slippage` (18 dec). Based on original code's formula.
     */
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
        uint256 quoteRawIn,
        uint256 slippage,
        uint256 minTokenAmtOut,
        uint256 autoMinTokenAmtOut
    ) {
        uint256 xv = IToken(token).reserveVirtQuoteWad();
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 x0 = xv + xr;
        uint256 y0 = IToken(token).reserveTokenAmt();

        uint256 quoteWadIn = DIVISOR.mulDivDown(x0.mulDivDown(y0, y0 - tokenAmtOut) - x0, DIVISOR - FEE);
        quoteRawIn = IToken(token).wadToRaw(quoteWadIn);
        slippage = 100 * (PRECISION - (tokenAmtOut.mulDivDown(IToken(token).getMarketPrice(), quoteWadIn)));
        minTokenAmtOut = tokenAmtOut.mulDivDown(slippageTolerance, DIVISOR);
        autoMinTokenAmtOut = tokenAmtOut.mulDivDown((DIVISOR * PRECISION) - ((slippage + PRECISION) * 100), DIVISOR * PRECISION);
    }

    function sellTokenIn(
        address token, 
        uint256 tokenAmtIn, 
        uint256 slippageTolerance
    ) external view returns (
        uint256 quoteRawOut, 
        uint256 slippage, 
        uint256 minQuoteRawOut, 
        uint256 autoMinQuoteRawOut
    ) {
        if (tokenAmtIn == 0) return (0, 0, 0, 0);
            
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 xv = IToken(token).reserveVirtQuoteWad();

        uint256 feeAmt = tokenAmtIn * FEE / DIVISOR;
        uint256 netAmt = tokenAmtIn - feeAmt;

        uint256 y0 = IToken(token).reserveTokenAmt();
        uint256 y1 = y0 + netAmt;
        uint256 x0 = xv + xr;
        uint256 x1 = x0.mulDivDown(y0, y1);

        if (x1 >= x0) return (0, 0, 0, 0);

        uint256 quoteWadOut = x0 - x1;
        quoteRawOut = IToken(token).wadToRaw(quoteWadOut);
        slippage = 100 * (PRECISION - quoteWadOut.mulDivDown(PRECISION, tokenAmtIn.mulDivDown(IToken(token).getMarketPrice(), PRECISION)));
        uint256 minQuoteWadOut = tokenAmtIn.mulDivDown(IToken(token).getMarketPrice(), PRECISION).mulDivDown(slippageTolerance, DIVISOR);
        minQuoteRawOut = IToken(token).wadToRaw(minQuoteWadOut);
        uint256 autoMinQuoteWadOut = tokenAmtIn.mulDivDown(IToken(token).getMarketPrice(), PRECISION).mulDivDown((DIVISOR * PRECISION) - ((slippage + PRECISION) * 100), DIVISOR * PRECISION);
        autoMinQuoteRawOut = IToken(token).wadToRaw(autoMinQuoteWadOut);
    }

    function sellQuoteOut(
        address token, 
        uint256 quoteRawOut, 
        uint256 slippageTolerance
    ) external view returns (
        uint256 tokenAmtIn,
        uint256 slippage,
        uint256 minQuoteRawOut,
        uint256 autoMinQuoteRawOut
    ) {
        uint256 xv = IToken(token).reserveVirtQuoteWad();
        uint256 xr = IToken(token).reserveRealQuoteWad();
        uint256 x0 = xv + xr;
        uint256 y0 = IToken(token).reserveTokenAmt();

        uint256 quoteWadOut = IToken(token).rawToWad(quoteRawOut);
        tokenAmtIn = DIVISOR.mulDivDown((x0.mulDivDown(y0, x0 - quoteWadOut)) - y0, DIVISOR - FEE);
        slippage = 100 * (PRECISION - (quoteWadOut.mulDivDown(PRECISION, (tokenAmtIn.mulDivDown(IToken(token).getMarketPrice(), PRECISION)))));
        uint256 minQuoteWadIn = quoteWadOut.mulDivDown(slippageTolerance, DIVISOR);
        minQuoteRawOut = IToken(token).wadToRaw(minQuoteWadIn);
        uint256 autoMinQuoteWadIn = quoteWadOut.mulDivDown((DIVISOR * PRECISION) - ((slippage + PRECISION) * 100), DIVISOR * PRECISION);
        autoMinQuoteRawOut = IToken(token).wadToRaw(autoMinQuoteWadIn);
    }
    
}