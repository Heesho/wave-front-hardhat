// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IWaveFrontFactory {
    function index() external view returns (uint256);
    function index_Meme(uint256 index) external view returns (address);
    function meme_Index(address meme) external view returns (uint256);
    function symbol_Index(string memory symbol) external view returns (uint256);
}

interface IPreMeme {
    function totalBaseContributed() external view returns (uint256);
    function totalMemeBalance() external view returns (uint256);
    function ended() external view returns (bool);
    function endTimestamp() external view returns (uint256);
    function account_BaseContributed(address account) external view returns (uint256);
}

interface IMeme {
    function preMeme() external view returns (address);
    function uri() external view returns (string memory);
    function status() external view returns (string memory);
    function statusHolder() external view returns (address);
    function creator() external view returns (address);
    function reserveRealBase() external view returns (uint256);
    function reserveVirtualBase() external view returns (uint256);
    function reserveMeme() external view returns (uint256);
    function maxSupply() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function getMarketPrice() external view returns (uint256);
    function getFloorPrice() external view returns (uint256);
    function getAccountCredit(address account) external view returns (uint256);
    function getAccountTransferrable(address account) external view returns (uint256);
    function account_Debt(address account) external view returns (uint256);
    function totalDebt() external view returns (uint256);
}

contract WaveFrontMulticallFrontend {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant FEE = 200;
    uint256 public constant DIVISOR = 10000;
    uint256 public constant PRECISION = 1e18;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable waveFrontFactory;   
    address public immutable base;

    enum PageType {
        MARKET,
        CONTRIBUTE,
        REDEEM
    }

    struct PageData {
        uint256 index;
        address meme;

        string name;
        string symbol;
        string uri;
        string status;
        address statusHolder;
        address creator;

        uint256 marketOpenTimestamp;

        uint256 marketCap;
        uint256 liquidity;
        uint256 floorPrice;
        uint256 marketPrice;
        uint256 totalSupply;
        uint256 totalContributed;

        uint256 accountNativeBalance;
        uint256 accountBaseBalance;
        uint256 accountMemeBalance;
        uint256 accountMemeValue;
        uint256 accountDebt;
        uint256 accountCredit;
        uint256 accountTransferable;
        uint256 accountContributed;
        uint256 accountRedeemable;

        PageType pageType;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor(address _waveFrontFactory, address _base) {
        waveFrontFactory = _waveFrontFactory;
        base = _base;
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    function getMemeCount() external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).index() - 1;
    }

    function getIndexByMeme(address meme) external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).meme_Index(meme);
    }

    function getMemeByIndex(uint256 index) external view returns (address) {
        return IWaveFrontFactory(waveFrontFactory).index_Meme(index);
    }

    function getIndexBySymbol(string memory symbol) external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).symbol_Index(symbol);
    }

    function getPageData(address meme, address account) external view returns (PageData memory pageData) {
        address preMeme = IMeme(meme).preMeme();
        bool marketOpen = IPreMeme(preMeme).ended();
        uint256 totalContributed = IPreMeme(preMeme).totalBaseContributed();
        uint256 reserveVirtualBase = IMeme(meme).reserveVirtualBase();
        uint256 reserveRealBase = IMeme(meme).reserveRealBase();
        uint256 reserveMeme = IMeme(meme).reserveMeme();

        uint256 newReserveBase = reserveRealBase + reserveVirtualBase + totalContributed - (totalContributed * FEE / DIVISOR);
        uint256 newReserveMeme = (reserveRealBase + reserveVirtualBase) * reserveMeme / newReserveBase;
        uint256 expectedMemeAmount = reserveMeme - newReserveMeme;

        pageData.index = IWaveFrontFactory(waveFrontFactory).meme_Index(meme);
        pageData.meme = meme;

        pageData.name = IERC20Metadata(meme).name();
        pageData.symbol = IERC20Metadata(meme).symbol();
        pageData.uri = IMeme(meme).uri();
        pageData.status = IMeme(meme).status();
        pageData.statusHolder = IMeme(meme).statusHolder();
        pageData.creator = IMeme(meme).creator();

        pageData.marketOpenTimestamp = IPreMeme(preMeme).endTimestamp();

        pageData.marketCap = (marketOpen ? IMeme(meme).totalSupply() * IMeme(meme).getMarketPrice() / 1e18 : totalContributed);
        pageData.liquidity = (IMeme(meme).reserveRealBase() + reserveVirtualBase) * 2;
        pageData.floorPrice = IMeme(meme).getFloorPrice();
        pageData.marketPrice = (marketOpen ? IMeme(meme).getMarketPrice() : newReserveBase * 1e18 / newReserveMeme);
        pageData.totalSupply = IMeme(meme).maxSupply();
        pageData.totalContributed = totalContributed;

        if (account != address(0)) {
            pageData.accountNativeBalance = account.balance;
            pageData.accountBaseBalance = IERC20(base).balanceOf(account);
            pageData.accountMemeBalance = IERC20(meme).balanceOf(account);
            pageData.accountMemeValue = pageData.accountMemeBalance * pageData.marketPrice / 1e18;
            pageData.accountDebt = IMeme(meme).account_Debt(account);
            pageData.accountCredit = IMeme(meme).getAccountCredit(account);
            pageData.accountTransferable = IMeme(meme).getAccountTransferrable(account);
            pageData.accountContributed = IPreMeme(preMeme).account_BaseContributed(account);
            pageData.accountRedeemable = (marketOpen ? IPreMeme(preMeme).totalMemeBalance() * pageData.accountContributed / totalContributed : expectedMemeAmount * pageData.accountContributed / totalContributed);
        }

        if (!marketOpen && block.timestamp < pageData.marketOpenTimestamp) {
            pageData.pageType = PageType.CONTRIBUTE;
        } else if (!marketOpen && block.timestamp >= pageData.marketOpenTimestamp) {
            if (pageData.accountContributed > 0) {
                pageData.pageType = PageType.REDEEM;
            } else {
                pageData.pageType = PageType.CONTRIBUTE;
            }
        } else {
            if (pageData.accountContributed > 0) {
                pageData.pageType = PageType.REDEEM;
            } else {
                pageData.pageType = PageType.MARKET;
            }
        }
    }

    function quoteBuyIn(address meme, uint256 input, uint256 slippageTolerance) external view returns(uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveBase = IMeme(meme).reserveRealBase() + IMeme(meme).reserveVirtualBase() + input - fee;
        uint256 newReserveMeme = (IMeme(meme).reserveRealBase() + IMeme(meme).reserveVirtualBase()) * IMeme(meme).reserveMeme() / newReserveBase;

        output = IMeme(meme).reserveMeme() - newReserveMeme;
        slippage = 100 * (1e18 - (output * IMeme(meme).getMarketPrice() / input));
        minOutput = (input * 1e18 / IMeme(meme).getMarketPrice()) * slippageTolerance / DIVISOR;
        autoMinOutput = (input * 1e18 / IMeme(meme).getMarketPrice()) * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteBuyOut(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IMeme(meme).reserveVirtualBase() + IMeme(meme).reserveRealBase();

        output = DIVISOR * ((oldReserveBase * IMeme(meme).reserveMeme() / (IMeme(meme).reserveMeme() - input)) - oldReserveBase) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * IMeme(meme).getMarketPrice() / output));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellIn(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveMeme = IMeme(meme).reserveMeme() + input - fee;
        uint256 newReserveBase = (IMeme(meme).reserveVirtualBase() + IMeme(meme).reserveRealBase()) * IMeme(meme).reserveMeme() / newReserveMeme;

        output = (IMeme(meme).reserveVirtualBase() + IMeme(meme).reserveRealBase()) - newReserveBase;
        slippage = 100 * (1e18 - (output * 1e18 / (input * IMeme(meme).getMarketPrice() / 1e18)));
        minOutput = input * IMeme(meme).getMarketPrice() /1e18 * slippageTolerance / DIVISOR;
        autoMinOutput = input * IMeme(meme).getMarketPrice() /1e18 * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellOut(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IMeme(meme).reserveVirtualBase() + IMeme(meme).reserveRealBase();
        
        output = DIVISOR * ((oldReserveBase * IMeme(meme).reserveMeme()  / (oldReserveBase - input)) - IMeme(meme).reserveMeme()) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * 1e18 / (output * IMeme(meme).getMarketPrice() / 1e18)));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }
    
}