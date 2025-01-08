// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPreWaveFrontToken {
    function totalQuoteContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256);
    function ended() external view returns (bool);
    function endTimestamp() external view returns (uint256);
    function account_QuoteContributed(address account) external view returns (uint256);
}

interface IWaveFrontToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function uri() external view returns (string memory);
    function owner() external view returns (address);
    function reserveRealQuote() external view returns (uint256);
    function reserveVirtQuote() external view returns (uint256);
    function reserveToken() external view returns (uint256);
    function maxSupply() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function getMarketPrice() external view returns (uint256);
    function getFloorPrice() external view returns (uint256);
    function getAccountCredit(address account) external view returns (uint256);
    function getAccountTransferrable(address account) external view returns (uint256);
    function account_Debt(address account) external view returns (uint256);
    function totalDebt() external view returns (uint256);
}

contract WaveFrontMulticall {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant FEE = 100;
    uint256 public constant DIVISOR = 10000;
    uint256 public constant PRECISION = 1e18;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable factory;

    enum TokenPhase {
        MARKET,
        CONTRIBUTE,
        REDEEM
    }

    struct TokenData {
        address token;

        string name;
        string symbol;
        string uri;
        address owner;

        uint256 marketOpenTimestamp;

        uint256 marketCap;
        uint256 liquidity;
        uint256 floorPrice;
        uint256 marketPrice;
        uint256 totalSupply;
        uint256 totalContributed;

        uint256 accountNativeBalance;
        uint256 accountQuoteBalance;
        uint256 accountTokenBalance;
        uint256 accountDebt;
        uint256 accountCredit;
        uint256 accountTransferable;
        uint256 accountContributed;
        uint256 accountRedeemable;

        TokenPhase tokenPhase;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor(address _factory) {
        factory = _factory;
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    function getTokenData(address token, address account) external view returns (TokenData memory tokenData) {
        address quote = IWaveFrontToken(token).quote();
        address preToken = IWaveFrontToken(token).preToken();
        bool marketOpen = IPreWaveFrontToken(preToken).ended();
        uint256 totalContributed = IPreWaveFrontToken(preToken).totalQuoteContributed();
        uint256 reserveVirtualQuote = IWaveFrontToken(token).reserveVirtQuote();
        uint256 reserveRealQuote = IWaveFrontToken(token).reserveRealQuote();
        uint256 reserveToken = IWaveFrontToken(token).reserveToken();

        uint256 newReserveQuote = reserveRealQuote + reserveVirtualQuote + totalContributed - (totalContributed * FEE / DIVISOR);
        uint256 newReserveToken = (reserveRealQuote + reserveVirtualQuote) * reserveToken / newReserveQuote;
        uint256 expectedTokenAmount = reserveToken - newReserveToken;

        tokenData.token = token;

        tokenData.name = IWaveFrontToken(token).name();
        tokenData.symbol = IWaveFrontToken(token).symbol();
        tokenData.uri = IWaveFrontToken(token).uri();
        tokenData.owner = IWaveFrontToken(token).owner();

        tokenData.marketOpenTimestamp = IPreWaveFrontToken(preToken).endTimestamp();

        tokenData.marketCap = (marketOpen ? IWaveFrontToken(token).maxSupply() * IWaveFrontToken(token).getMarketPrice() / 1e18 : totalContributed);
        tokenData.liquidity = (reserveRealQuote + reserveVirtualQuote) * 2;
        tokenData.floorPrice = IWaveFrontToken(token).getFloorPrice();
        tokenData.marketPrice = (marketOpen ? IWaveFrontToken(token).getMarketPrice() : newReserveQuote * 1e18 / newReserveToken);
        tokenData.totalSupply = IWaveFrontToken(token).maxSupply();
        tokenData.totalContributed = totalContributed;

        if (account != address(0)) {
            tokenData.accountNativeBalance = account.balance;
            tokenData.accountQuoteBalance = IERC20(quote).balanceOf(account);
            tokenData.accountTokenBalance = IERC20(token).balanceOf(account);
            tokenData.accountDebt = IWaveFrontToken(token).account_Debt(account);
            tokenData.accountCredit = IWaveFrontToken(token).getAccountCredit(account);
            tokenData.accountTransferable = IWaveFrontToken(token).getAccountTransferrable(account);
            tokenData.accountContributed = IPreWaveFrontToken(preToken).account_QuoteContributed(account);
            tokenData.accountRedeemable = (marketOpen ? IPreWaveFrontToken(preToken).totalTokenBalance() * tokenData.accountContributed / totalContributed : expectedTokenAmount * tokenData.accountContributed / totalContributed);
        }

        if (!marketOpen && block.timestamp < tokenData.marketOpenTimestamp) {
            tokenData.tokenPhase = TokenPhase.CONTRIBUTE;
        } else if (!marketOpen && block.timestamp >= tokenData.marketOpenTimestamp) {
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
    }

    function quoteBuyIn(address token, uint256 input, uint256 slippageTolerance) external view returns(uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveQuote = IWaveFrontToken(token).reserveRealQuote() + IWaveFrontToken(token).reserveVirtQuote() + input - fee;
        uint256 newReserveToken = (IWaveFrontToken(token).reserveRealQuote() + IWaveFrontToken(token).reserveVirtQuote()) * IWaveFrontToken(token).reserveToken() / newReserveQuote;

        output = IWaveFrontToken(token).reserveToken() - newReserveToken;
        slippage = 100 * (1e18 - (output * IWaveFrontToken(token).getMarketPrice() / input));
        minOutput = (input * 1e18 / IWaveFrontToken(token).getMarketPrice()) * slippageTolerance / DIVISOR;
        autoMinOutput = (input * 1e18 / IWaveFrontToken(token).getMarketPrice()) * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteBuyOut(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveQuote = IWaveFrontToken(token).reserveVirtQuote() + IWaveFrontToken(token).reserveRealQuote();

        output = DIVISOR * ((oldReserveQuote * IWaveFrontToken(token).reserveToken() / (IWaveFrontToken(token).reserveToken() - input)) - oldReserveQuote) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * IWaveFrontToken(token).getMarketPrice() / output));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellIn(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveToken = IWaveFrontToken(token).reserveToken() + input - fee;
        uint256 newReserveQuote = (IWaveFrontToken(token).reserveVirtQuote() + IWaveFrontToken(token).reserveRealQuote()) * IWaveFrontToken(token).reserveToken() / newReserveToken;

        output = (IWaveFrontToken(token).reserveVirtQuote() + IWaveFrontToken(token).reserveRealQuote()) - newReserveQuote;
        slippage = 100 * (1e18 - (output * 1e18 / (input * IWaveFrontToken(token).getMarketPrice() / 1e18)));
        minOutput = input * IWaveFrontToken(token).getMarketPrice() /1e18 * slippageTolerance / DIVISOR;
        autoMinOutput = input * IWaveFrontToken(token).getMarketPrice() /1e18 * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellOut(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveQuote = IWaveFrontToken(token).reserveVirtQuote() + IWaveFrontToken(token).reserveRealQuote();
        
        output = DIVISOR * ((oldReserveQuote * IWaveFrontToken(token).reserveToken()  / (oldReserveQuote - input)) - IWaveFrontToken(token).reserveToken()) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * 1e18 / (output * IWaveFrontToken(token).getMarketPrice() / 1e18)));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }
    
}