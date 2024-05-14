// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IWaveFrontFactory {
    function meme_Index(address meme) external view returns (uint256);
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
    function account_Debt(address account) external view returns (uint256);
    function totalDebt() external view returns (uint256);
}

contract WaveFrontMulticallSubgraph {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant FEE = 200;
    uint256 public constant DIVISOR = 10000;
    uint256 public constant PRECISION = 1e18;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable waveFrontFactory;   
    address public immutable base;

    struct MemeData {
        uint256 index;
        address meme;
        address preMeme;

        string name;
        string symbol;
        string uri;
        string status;
        address statusHolder;
        address creator;

        bool marketOpen;
        uint256 marketOpenTimestamp;

        uint256 reserveVirtualBase;
        uint256 reserveRealBase;
        uint256 reserveMeme;
        uint256 totalSupply;

        uint256 baseContributed;
        uint256 preMemeBalance;

        uint256 floorPrice;
        uint256 marketPrice;
        uint256 marketCap;
        uint256 liquidity;
        uint256 totalDebt;
    }

    struct AccountData {
        uint256 baseContributed;
        uint256 memeRedeemable;
        uint256 memeBalance;
        uint256 baseCredit;
        uint256 baseDebt;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor(address _waveFrontFactory, address _base) {
        waveFrontFactory = _waveFrontFactory;
        base = _base;
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    function getMemeData(address meme) public view returns (MemeData memory memeData) {
        memeData.index = IWaveFrontFactory(waveFrontFactory).meme_Index(meme);
        memeData.meme = meme;
        memeData.preMeme = IMeme(meme).preMeme();

        memeData.name = IERC20Metadata(meme).name();
        memeData.symbol = IERC20Metadata(meme).symbol();
        memeData.uri = IMeme(meme).uri();
        memeData.status = IMeme(meme).status();
        memeData.statusHolder = IMeme(meme).statusHolder();
        memeData.creator = IMeme(meme).creator();

        memeData.marketOpen = IPreMeme(memeData.preMeme).ended();
        memeData.marketOpenTimestamp = IPreMeme(memeData.preMeme).endTimestamp();

        memeData.reserveVirtualBase = IMeme(meme).reserveVirtualBase();
        memeData.reserveRealBase = IMeme(meme).reserveRealBase();
        memeData.reserveMeme = IMeme(meme).reserveMeme();
        memeData.totalSupply = IMeme(meme).maxSupply();

        memeData.baseContributed = IPreMeme(memeData.preMeme).totalBaseContributed();
        uint256 fee = memeData.baseContributed * FEE / DIVISOR;
        uint256 newReserveBase = memeData.reserveRealBase + memeData.reserveVirtualBase + memeData.baseContributed - fee;
        uint256 newReserveMeme = (memeData.reserveRealBase + memeData.reserveVirtualBase) * memeData.reserveMeme / newReserveBase;
        memeData.preMemeBalance = memeData.reserveMeme - newReserveMeme;

        memeData.floorPrice = IMeme(meme).getFloorPrice();
        memeData.marketPrice = (memeData.marketOpen ? IMeme(meme).getMarketPrice() : newReserveBase * 1e18 / newReserveMeme);
        memeData.marketCap = (memeData.marketOpen ? IMeme(meme).totalSupply() * IMeme(meme).getMarketPrice() / 1e18 : memeData.baseContributed);
        memeData.liquidity = (memeData.reserveRealBase + memeData.reserveVirtualBase) * 2;
        memeData.totalDebt = IMeme(meme).totalDebt();
    }

    function getAccountData(address meme, address account) public view returns (AccountData memory accountData) {
        address preMeme = IMeme(meme).preMeme();
        uint256 fee = IPreMeme(preMeme).totalBaseContributed() * FEE / DIVISOR;
        uint256 newReserveBase = IMeme(meme).reserveRealBase() + IMeme(meme).reserveVirtualBase() + IPreMeme(IMeme(meme).preMeme()).totalBaseContributed() - fee;
        uint256 newReserveMeme = (IMeme(meme).reserveRealBase() + IMeme(meme).reserveVirtualBase()) * IMeme(meme).reserveMeme() / newReserveBase;
        uint256 expectedMemeAmount = IMeme(meme).reserveMeme() - newReserveMeme;

        accountData.baseContributed = IPreMeme(IMeme(meme).preMeme()).account_BaseContributed(account);
        accountData.memeRedeemable = (IPreMeme(preMeme).ended() ? IPreMeme(preMeme).totalMemeBalance() * accountData.baseContributed / IPreMeme(preMeme).totalBaseContributed() 
            : expectedMemeAmount * accountData.baseContributed / IPreMeme(preMeme).totalBaseContributed());
        accountData.memeBalance = IERC20(meme).balanceOf(account);
        accountData.baseCredit = IMeme(meme).getAccountCredit(account);
        accountData.baseDebt = IMeme(meme).account_Debt(account);
    }
    
}