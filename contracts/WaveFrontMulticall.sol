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
    function fees() external view returns (address);
    function uri() external view returns (string memory);
    function status() external view returns (string memory);
    function statusHolder() external view returns (address);
    function reserveBase() external view returns (uint256);
    function RESERVE_VIRTUAL_BASE() external view returns (uint256);
    function reserveMeme() external view returns (uint256);
    function maxSupply() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function getMarketPrice() external view returns (uint256);
    function getFloorPrice() external view returns (uint256);
    function claimableBase(address account) external view returns (uint256);
    function totalFeesBase() external view returns (uint256);
    function getAccountCredit(address account) external view returns (uint256);
    function account_Debt(address account) external view returns (uint256);
    function totalDebt() external view returns (uint256);
}

contract WaveFrontMulticall {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant FEE = 100;
    uint256 public constant DIVISOR = 10000;
    uint256 public constant PRECISION = 1e18;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable waveFrontFactory;   
    address public immutable base;

    struct MemeData {
        uint256 index;
        address meme;
        address preMeme;
        address fees;

        string name;
        string symbol;
        string uri;
        string status;
        address statusHolder;

        bool marketOpen;
        uint256 marketOpenTimestamp;

        uint256 reserveVirtualBase;
        uint256 reserveBase;
        uint256 reserveMeme;
        uint256 totalSupply;

        uint256 baseContributed;
        uint256 preMemeBalance;

        uint256 floorPrice;
        uint256 marketPrice;
        uint256 marketCap;
        uint256 liquidity;
        uint256 totalRewardsBase;
        uint256 totalDebt;
    }

    struct AccountData {
        uint256 baseContributed;
        uint256 memeRedeemable;
        uint256 memeBalance;
        uint256 baseClaimable;
        uint256 baseCredit;
        uint256 baseDebt;
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

    function getMemeData(address meme) public view returns (MemeData memory memeData) {
        memeData.index = IWaveFrontFactory(waveFrontFactory).meme_Index(meme);
        memeData.meme = meme;
        memeData.preMeme = IMeme(meme).preMeme();
        memeData.fees = IMeme(meme).fees();

        memeData.name = IERC20Metadata(meme).name();
        memeData.symbol = IERC20Metadata(meme).symbol();
        memeData.uri = IMeme(meme).uri();
        memeData.status = IMeme(meme).status();
        memeData.statusHolder = IMeme(meme).statusHolder();

        memeData.marketOpen = IPreMeme(memeData.preMeme).ended();
        memeData.marketOpenTimestamp = IPreMeme(memeData.preMeme).endTimestamp();

        memeData.reserveVirtualBase = IMeme(meme).RESERVE_VIRTUAL_BASE();
        memeData.reserveBase = IMeme(meme).reserveBase();
        memeData.reserveMeme = IMeme(meme).reserveMeme();
        memeData.totalSupply = IMeme(meme).maxSupply();

        memeData.baseContributed = IPreMeme(memeData.preMeme).totalBaseContributed();
        uint256 fee = memeData.baseContributed * FEE / DIVISOR;
        uint256 newReserveBase = memeData.reserveBase + memeData.reserveVirtualBase + memeData.baseContributed - fee;
        uint256 newReserveMeme = (memeData.reserveBase + memeData.reserveVirtualBase) * memeData.reserveMeme / newReserveBase;
        memeData.preMemeBalance = memeData.reserveMeme - newReserveMeme;

        memeData.floorPrice = IMeme(meme).getFloorPrice();
        memeData.marketPrice = (memeData.marketOpen ? IMeme(meme).getMarketPrice() : memeData.baseContributed * 1e18 / memeData.preMemeBalance);
        memeData.marketCap = (memeData.marketOpen ? IMeme(meme).totalSupply() * IMeme(meme).getMarketPrice() / 1e18 : memeData.baseContributed);
        memeData.liquidity = (memeData.reserveBase + memeData.reserveVirtualBase) * 2;
        memeData.totalRewardsBase = IMeme(meme).totalFeesBase();
        memeData.totalDebt = IMeme(meme).totalDebt();
    }

    function getAccountData(address meme, address account) public view returns (AccountData memory accountData) {
        address preMeme = IMeme(meme).preMeme();
        uint256 fee = IPreMeme(preMeme).totalBaseContributed() * FEE / DIVISOR;
        uint256 newReserveBase = IMeme(meme).reserveBase() + IMeme(meme).RESERVE_VIRTUAL_BASE() + IPreMeme(IMeme(meme).preMeme()).totalBaseContributed() - fee;
        uint256 newReserveMeme = (IMeme(meme).reserveBase() + IMeme(meme).RESERVE_VIRTUAL_BASE()) * IMeme(meme).reserveMeme() / newReserveBase;
        uint256 expectedMemeAmount = IMeme(meme).reserveMeme() - newReserveMeme;

        accountData.baseContributed = IPreMeme(IMeme(meme).preMeme()).account_BaseContributed(account);
        accountData.memeRedeemable = (IPreMeme(preMeme).ended() ? IPreMeme(preMeme).totalMemeBalance() * accountData.baseContributed / IPreMeme(preMeme).totalBaseContributed() 
            : expectedMemeAmount * accountData.baseContributed / IPreMeme(preMeme).totalBaseContributed());
        accountData.memeBalance = IERC20(meme).balanceOf(account);
        accountData.baseClaimable = IMeme(meme).claimableBase(account);
        accountData.baseCredit = IMeme(meme).getAccountCredit(account);
        accountData.baseDebt = IMeme(meme).account_Debt(account);
    }

    function quoteBuyIn(address meme, uint256 input, uint256 slippageTolerance) external view returns(uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveBase = IMeme(meme).reserveBase() + IMeme(meme).RESERVE_VIRTUAL_BASE() + input - fee;
        uint256 newReserveMeme = (IMeme(meme).reserveBase() + IMeme(meme).RESERVE_VIRTUAL_BASE()) * IMeme(meme).reserveMeme() / newReserveBase;

        output = IMeme(meme).reserveMeme() - newReserveMeme;
        slippage = 100 * (1e18 - (output * IMeme(meme).getMarketPrice() / input));
        minOutput = (input * 1e18 / IMeme(meme).getMarketPrice()) * slippageTolerance / DIVISOR;
        autoMinOutput = (input * 1e18 / IMeme(meme).getMarketPrice()) * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteBuyOut(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IMeme(meme).RESERVE_VIRTUAL_BASE() + IMeme(meme).reserveBase();

        output = DIVISOR * ((oldReserveBase * IMeme(meme).reserveMeme() / (IMeme(meme).reserveMeme() - input)) - oldReserveBase) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * IMeme(meme).getMarketPrice() / output));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellIn(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveMeme = IMeme(meme).reserveMeme() + input - fee;
        uint256 newReserveBase = (IMeme(meme).RESERVE_VIRTUAL_BASE() + IMeme(meme).reserveBase()) * IMeme(meme).reserveMeme() / newReserveMeme;

        output = (IMeme(meme).RESERVE_VIRTUAL_BASE() + IMeme(meme).reserveBase()) - newReserveBase;
        slippage = 100 * (1e18 - (output * 1e18 / (input * IMeme(meme).getMarketPrice() / 1e18)));
        minOutput = input * IMeme(meme).getMarketPrice() /1e18 * slippageTolerance / DIVISOR;
        autoMinOutput = input * IMeme(meme).getMarketPrice() /1e18 * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellOut(address meme, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IMeme(meme).RESERVE_VIRTUAL_BASE() + IMeme(meme).reserveBase();
        
        output = DIVISOR * ((oldReserveBase * IMeme(meme).reserveMeme()  / (oldReserveBase - input)) - IMeme(meme).reserveMeme()) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * 1e18 / (output * IMeme(meme).getMarketPrice() / 1e18)));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function contributes(address meme, address account) external view returns (uint256 totalContributed,  uint256 accountContributed, uint256 accountAllocation) {
        address preMeme = IMeme(meme).preMeme();
        totalContributed = IPreMeme(preMeme).totalBaseContributed();
        accountContributed = IPreMeme(preMeme).account_BaseContributed(account);
        accountAllocation = getAccountData(meme, account).memeRedeemable;
    }
    
}