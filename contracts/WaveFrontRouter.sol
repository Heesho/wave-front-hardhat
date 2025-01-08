// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWaveFrontFactory {
    function createWaveFrontToken(string memory name, string memory symbol, string memory uri, address owner, address quote, uint256 reserveVirtQuote) external returns (address);
}

interface IWaveFrontToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function buy(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) external;
    function sell(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) external;
    function getMarketPrice() external view returns (uint256);
    function getFloorPrice() external view returns (uint256);
    function uri() external view returns (string memory);
}

interface IPreWaveFrontToken {
    function endTimestamp() external view returns (uint256);
    function ended() external view returns (bool);
    function totalQuoteContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256);
    function contribute(address account, uint256 amount) external;
    function redeem(address account) external;
    function openMarket() external;
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

contract WaveFrontRouter {
    using SafeERC20 for IERC20;

    address public immutable factory;

    mapping(address => address) public referrals;

    event WaveFrontRouter__Buy(address indexed token, address indexed account, uint256 amountIn, uint256 amountOut, uint256 marketPrice, uint256 floorPrice, string uri);
    event WaveFrontRouter__Sell(address indexed token, address indexed account, uint256 amountIn, uint256 amountOut, uint256 marketPrice, uint256 floorPrice, string uri);
    event WaveFrontRouter__AffiliateSet(address indexed account, address indexed affiliate);
    event WaveFrontRouter__TokenCreated(address indexed token, address indexed account, string name, string symbol, string uri);
    event WaveFrontRouter__Contributed(address indexed token, address indexed account, uint256 amount, string uri);
    event WaveFrontRouter__Redeemed(address indexed token, address indexed account, string uri);
    event WaveFrontRouter__MarketOpened(address indexed token, uint256 totalQuoteContributed, uint256 totalTokenBalance);

    constructor(address _factory) {
        factory = _factory;
    }

    function buyWithNative(
        address token,
        address affiliate,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external payable {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }
        address quote = IWaveFrontToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, msg.value);
        IWaveFrontToken(token).buy(msg.value, minAmountTokenOut, expireTimestamp, address(this), referrals[msg.sender]);
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, tokenBalance);

        emit WaveFrontRouter__Buy(token, msg.sender, msg.value, tokenBalance, IWaveFrontToken(token).getMarketPrice(), IWaveFrontToken(token).getFloorPrice(), IWaveFrontToken(token).uri());
    }

    function buyWithQuote(
        address token,
        address affiliate,
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }
        address quote = IWaveFrontToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, amountQuoteIn);
        IWaveFrontToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, address(this), referrals[msg.sender]);
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, tokenBalance);

        emit WaveFrontRouter__Buy(token, msg.sender, amountQuoteIn, tokenBalance, IWaveFrontToken(token).getMarketPrice(), IWaveFrontToken(token).getFloorPrice(), IWaveFrontToken(token).uri());
    }

    function sellToNative(
        address token,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        IERC20(token).safeApprove(token, 0);
        IERC20(token).safeApprove(token, amountTokenIn);
        IWaveFrontToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        address quote = IWaveFrontToken(token).quote();
        uint256 quoteBalance = IERC20(quote).balanceOf(address(this));
        IWETH(quote).withdraw(quoteBalance);
        (bool success, ) = msg.sender.call{value: quoteBalance}("");
        require(success, "Failed to send ETH");

        emit WaveFrontRouter__Sell(token, msg.sender, amountTokenIn, quoteBalance, IWaveFrontToken(token).getMarketPrice(), IWaveFrontToken(token).getFloorPrice(), IWaveFrontToken(token).uri());
    }

    function sellToQuote(
        address token,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        IERC20(token).safeApprove(token, 0);
        IERC20(token).safeApprove(token, amountTokenIn);
        IWaveFrontToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        address quote = IWaveFrontToken(token).quote();
        uint256 quoteBalance = IERC20(quote).balanceOf(address(this));
        IERC20(quote).safeTransfer(msg.sender, quoteBalance);

        emit WaveFrontRouter__Sell(token, msg.sender, amountTokenIn, quoteBalance, IWaveFrontToken(token).getMarketPrice(), IWaveFrontToken(token).getFloorPrice(), IWaveFrontToken(token).uri());
    }

    function createWaveFrontToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address quote,
        uint256 reserveVirtQuote
    ) external returns (address) {
        address token = IWaveFrontFactory(factory).createWaveFrontToken(name, symbol, uri, msg.sender, quote, reserveVirtQuote);
        emit WaveFrontRouter__TokenCreated(token, msg.sender, name, symbol, uri);
        return token;
    }

    function contributeWithNative(address token) external payable {
        address preToken = IWaveFrontToken(token).preToken();
        address quote = IWaveFrontToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        IERC20(quote).safeApprove(preToken, 0);
        IERC20(quote).safeApprove(preToken, msg.value);
        IPreWaveFrontToken(preToken).contribute(msg.sender, msg.value);
        emit WaveFrontRouter__Contributed(token, msg.sender, msg.value, IWaveFrontToken(token).uri());
        if (block.timestamp > IPreWaveFrontToken(preToken).endTimestamp() && !IPreWaveFrontToken(preToken).ended()) {
            IPreWaveFrontToken(preToken).openMarket();
            emit WaveFrontRouter__MarketOpened(token, IPreWaveFrontToken(preToken).totalQuoteContributed(), IPreWaveFrontToken(preToken).totalTokenBalance());
        }
    }

    function contributeWithQuote(address token, uint256 amountQuoteIn) external {
        address preToken = IWaveFrontToken(token).preToken();
        address quote = IWaveFrontToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        IERC20(quote).safeApprove(preToken, 0);
        IERC20(quote).safeApprove(preToken, amountQuoteIn);
        IPreWaveFrontToken(preToken).contribute(msg.sender, amountQuoteIn);
        emit WaveFrontRouter__Contributed(token, msg.sender, amountQuoteIn, IWaveFrontToken(token).uri());
        if (block.timestamp > IPreWaveFrontToken(preToken).endTimestamp() && !IPreWaveFrontToken(preToken).ended()) {
            IPreWaveFrontToken(preToken).openMarket();
            emit WaveFrontRouter__MarketOpened(token, IPreWaveFrontToken(preToken).totalQuoteContributed(), IPreWaveFrontToken(preToken).totalTokenBalance());
        }
    }

    function redeem(address token) external {
        address preToken = IWaveFrontToken(token).preToken();
        if (block.timestamp > IPreWaveFrontToken(preToken).endTimestamp() && !IPreWaveFrontToken(preToken).ended()) {
            IPreWaveFrontToken(preToken).openMarket();
            emit WaveFrontRouter__MarketOpened(token, IPreWaveFrontToken(preToken).totalQuoteContributed(), IPreWaveFrontToken(preToken).totalTokenBalance());
        }
        IPreWaveFrontToken(preToken).redeem(msg.sender);
        emit WaveFrontRouter__Redeemed(token, msg.sender, IWaveFrontToken(token).uri());
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

}