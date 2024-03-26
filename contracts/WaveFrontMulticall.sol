// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IWaveFrontFactory {
    function index() external view returns (uint256);
    function index_Token(uint256 index) external view returns (address);
    function token_Index(address token) external view returns (uint256);
    function symbol_Index(string memory symbol) external view returns (uint256);
}

interface IPreToken {
    function totalBaseContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256);
    function ended() external view returns (bool);
    function endTimestamp() external view returns (uint256);
    function account_BaseContributed(address account) external view returns (uint256);
}

interface IToken {
    function preToken() external view returns (address);
    function fees() external view returns (address);
    function uri() external view returns (string memory);
    function status() external view returns (string memory);
    function statusHolder() external view returns (address);
    function reserveBase() external view returns (uint256);
    function RESERVE_VIRTUAL_BASE() external view returns (uint256);
    function reserveToken() external view returns (uint256);
    function maxSupply() external view returns (uint256);
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

    struct TokenData {
        uint256 index;
        address token;
        address preToken;
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
        uint256 reserveToken;
        uint256 totalSupply;

        uint256 baseContributed;
        uint256 preTokenBalance;

        uint256 floorPrice;
        uint256 marketPrice;
        uint256 totalRewardsBase;
        uint256 totalDebt;
    }

    struct AccountData {
        uint256 baseContributed;
        uint256 tokenRedeemable;
        uint256 tokenBalance;
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

    function getTokenCount() external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).index() - 1;
    }

    function getIndexByToken(address token) external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).token_Index(token);
    }

    function getTokenByIndex(uint256 index) external view returns (address) {
        return IWaveFrontFactory(waveFrontFactory).index_Token(index);
    }

    function getIndexBySymbol(string memory symbol) external view returns (uint256) {
        return IWaveFrontFactory(waveFrontFactory).symbol_Index(symbol);
    }

    function getTokenData(address token) public view returns (TokenData memory tokenData) {
        tokenData.index = IWaveFrontFactory(waveFrontFactory).token_Index(token);
        tokenData.token = token;
        tokenData.preToken = IToken(token).preToken();
        tokenData.fees = IToken(token).fees();

        tokenData.name = IERC20Metadata(tokenData.token).name();
        tokenData.symbol = IERC20Metadata(tokenData.token).symbol();
        tokenData.uri = IToken(tokenData.token).uri();
        tokenData.status = IToken(tokenData.token).status();
        tokenData.statusHolder = IToken(tokenData.token).statusHolder();

        tokenData.marketOpen = IPreToken(tokenData.preToken).ended();
        tokenData.marketOpenTimestamp = IPreToken(tokenData.preToken).endTimestamp();

        tokenData.reserveVirtualBase = IToken(tokenData.token).RESERVE_VIRTUAL_BASE();
        tokenData.reserveBase = IToken(tokenData.token).reserveBase();
        tokenData.reserveToken = IToken(tokenData.token).reserveToken();
        tokenData.totalSupply = IToken(tokenData.token).maxSupply();

        tokenData.baseContributed = IPreToken(tokenData.preToken).totalBaseContributed();
        uint256 fee = tokenData.baseContributed * FEE / DIVISOR;
        uint256 newReserveBase = tokenData.reserveBase + tokenData.reserveVirtualBase + tokenData.baseContributed - fee;
        uint256 newReserveToken = (tokenData.reserveBase + tokenData.reserveVirtualBase) * tokenData.reserveToken / newReserveBase;
        tokenData.preTokenBalance = tokenData.reserveToken - newReserveToken;

        tokenData.floorPrice = IToken(tokenData.token).getFloorPrice();
        tokenData.marketPrice = (tokenData.marketOpen ? IToken(tokenData.token).getMarketPrice() : tokenData.baseContributed * 1e18 / tokenData.preTokenBalance);
        tokenData.totalRewardsBase = IToken(tokenData.token).totalFeesBase();
        tokenData.totalDebt = IToken(tokenData.token).totalDebt();
    }

    function getAccountData(address token, address account) public view returns (AccountData memory accountData) {
        address preToken = IToken(token).preToken();
        uint256 fee = IPreToken(preToken).totalBaseContributed() * FEE / DIVISOR;
        uint256 newReserveBase = IToken(token).reserveBase() + IToken(token).RESERVE_VIRTUAL_BASE() + IPreToken(IToken(token).preToken()).totalBaseContributed() - fee;
        uint256 newReserveToken = (IToken(token).reserveBase() + IToken(token).RESERVE_VIRTUAL_BASE()) * IToken(token).reserveToken() / newReserveBase;
        uint256 expectedTokenAmount = IToken(token).reserveToken() - newReserveToken;

        accountData.baseContributed = IPreToken(IToken(token).preToken()).account_BaseContributed(account);
        accountData.tokenRedeemable = (IPreToken(preToken).ended() ? IPreToken(preToken).totalTokenBalance() * accountData.baseContributed / IPreToken(preToken).totalBaseContributed() 
            : expectedTokenAmount * accountData.baseContributed / IPreToken(preToken).totalBaseContributed());
        accountData.tokenBalance = IERC20(token).balanceOf(account);
        accountData.baseClaimable = IToken(token).claimableBase(account);
        accountData.baseCredit = IToken(token).getAccountCredit(account);
        accountData.baseDebt = IToken(token).account_Debt(account);
    }

    function quoteBuyIn(address token, uint256 input, uint256 slippageTolerance) external view returns(uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveBase = IToken(token).reserveBase() + IToken(token).RESERVE_VIRTUAL_BASE() + input - fee;
        uint256 newReserveToken = (IToken(token).reserveBase() + IToken(token).RESERVE_VIRTUAL_BASE()) * IToken(token).reserveToken() / newReserveBase;

        output = IToken(token).reserveToken() - newReserveToken;
        slippage = 100 * (1e18 - (output * IToken(token).getMarketPrice() / input));
        minOutput = (input * 1e18 / IToken(token).getMarketPrice()) * slippageTolerance / DIVISOR;
        autoMinOutput = (input * 1e18 / IToken(token).getMarketPrice()) * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteBuyOut(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IToken(token).RESERVE_VIRTUAL_BASE() + IToken(token).reserveBase();

        output = DIVISOR * ((oldReserveBase * IToken(token).reserveToken() / (IToken(token).reserveToken() - input)) - oldReserveBase) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * IToken(token).getMarketPrice() / output));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellIn(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 fee = input * FEE / DIVISOR;
        uint256 newReserveToken = IToken(token).reserveToken() + input - fee;
        uint256 newReserveBase = (IToken(token).RESERVE_VIRTUAL_BASE() + IToken(token).reserveBase()) * IToken(token).reserveToken() / newReserveToken;

        output = (IToken(token).RESERVE_VIRTUAL_BASE() + IToken(token).reserveBase()) - newReserveBase;
        slippage = 100 * (1e18 - (output * 1e18 / (input * IToken(token).getMarketPrice() / 1e18)));
        minOutput = input * IToken(token).getMarketPrice() /1e18 * slippageTolerance / DIVISOR;
        autoMinOutput = input * IToken(token).getMarketPrice() /1e18 * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function quoteSellOut(address token, uint256 input, uint256 slippageTolerance) external view returns (uint256 output, uint256 slippage, uint256 minOutput, uint256 autoMinOutput) {
        uint256 oldReserveBase = IToken(token).RESERVE_VIRTUAL_BASE() + IToken(token).reserveBase();
        
        output = DIVISOR * ((oldReserveBase * IToken(token).reserveToken()  / (oldReserveBase - input)) - IToken(token).reserveToken()) / (DIVISOR - FEE);
        slippage = 100 * (1e18 - (input * 1e18 / (output * IToken(token).getMarketPrice() / 1e18)));
        minOutput = input * slippageTolerance / DIVISOR;
        autoMinOutput = input * ((DIVISOR * 1e18) - ((slippage + 1e18) * 100)) / (DIVISOR * 1e18);
    }

    function contributes(address token, address account) external view returns (uint256 totalContributed,  uint256 accountContributed) {
        address preToken = IToken(token).preToken();
        totalContributed = IPreToken(preToken).totalBaseContributed();
        accountContributed = IPreToken(preToken).account_BaseContributed(account);
    }
    
}