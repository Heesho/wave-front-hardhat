// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IWaveFront {
    function create(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner,
        address _quote,
        address _preTokenFactory,
        uint256 _reserveVirtQuote
    ) external returns (address token, address preToken, uint256 tokenId);

    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function wavefront() external view returns (address);
    function wavefrontId() external view returns (uint256);

    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 tokenAmtOut);

    function sell(
        uint256 tokenAmtIn,
        uint256 minQuoteRawOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 quoteRawOut);
}

interface IPreToken {
    function endTime() external view returns (uint256);
    function ended() external view returns (bool);
    function totalQuoteRaw() external view returns (uint256);
    function totalTokenAmt() external view returns (uint256);
    function token() external view returns (address);

    function contribute(address account, uint256 amount) external;
    function redeem(address account) external;
    function openMarket() external;
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

contract WaveFrontRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public immutable wavefront;
    address public immutable preTokenFactory;

    mapping(address => address) public referrals;

    event WaveFrontRouter__Created(
        string name,
        string symbol,
        string uri,
        address indexed creator,
        address quote,
        address token,
        address preToken,
        uint256 tokenId,
        uint256 initialVirtualQuote
    );
    event WaveFrontRouter__Buy(address indexed token, address quote, address indexed account, address indexed affiliate, uint256 amountQuoteIn, uint256 amountTokenOut);
    event WaveFrontRouter__Sell(address indexed token, address quote, address indexed account, address indexed affiliate, uint256 amountTokenIn, uint256 amountQuoteOut);
    event WaveFrontRouter__AffiliateSet(address indexed account, address indexed affiliate);
    event WaveFrontRouter__Contribute(address indexed token, address quote, address indexed account, uint256 amountQuote);
    event WaveFrontRouter__Redeem(address indexed token, address indexed account);
    event WaveFrontRouter__MarketOpened(address indexed token, address preToken);

    constructor(address _wavefront, address _preTokenFactory) {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
    }

    function createWaveFrontToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address quote,
        uint256 reserveVirtQuote
    ) external nonReentrant returns (address token, address preToken, uint256 tokenId) {
        (token, preToken, tokenId) = IWaveFront(wavefront).create(
            name,
            symbol,
            uri,
            msg.sender,
            quote,
            preTokenFactory,
            reserveVirtQuote
        );

        emit WaveFrontRouter__Created(name, symbol, uri, msg.sender, quote, token, preToken, tokenId, reserveVirtQuote);
    }

    function buyWithNative(
        address token,
        address affiliate,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        _setAffiliate(affiliate);

        address quote = IToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        _safeApprove(quote, token, msg.value);

        uint256 amountTokenOut = IToken(token).buy(msg.value, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Buy(token, quote, msg.sender, affiliate, msg.value, amountTokenOut);
    }

    function buyWithQuote(
        address token,
        address affiliate,
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external nonReentrant {
         require(amountQuoteIn > 0, "Router: Quote amount required");
        _setAffiliate(affiliate);

        address quote = IToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        _safeApprove(quote, token, amountQuoteIn);

        uint256 amountTokenOut = IToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Buy(token, quote, msg.sender, affiliate, amountQuoteIn, amountTokenOut);
    }

    function sellToNative(
        address token,
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);

        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        address quote = IToken(token).quote();
        IWETH(quote).withdraw(amountQuoteOut);
        (bool success, ) = msg.sender.call{value: amountQuoteOut}("");
        require(success, "Router: Failed to send ETH");

        emit WaveFrontRouter__Sell(token, quote, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }

    function sellToQuote(
        address token,
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        address quote = IToken(token).quote();
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Sell(token, quote, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }

    function contributeWithNative(address token) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        address preTokenAddr = IToken(token).preToken();

        address quote = IToken(token).quote();
        IWETH(quote).deposit{value: msg.value}();
        _safeApprove(quote, preTokenAddr, msg.value);

        IPreToken(preTokenAddr).contribute(msg.sender, msg.value);

        emit WaveFrontRouter__Contribute(token, quote, msg.sender, msg.value);
        _checkAndOpenMarket(preTokenAddr);
    }

    function contributeWithQuote(address token, uint256 amountQuoteIn) external nonReentrant {
        require(amountQuoteIn > 0, "Router: Quote amount required");
        address preTokenAddr = IToken(token).preToken();

        address quote = IToken(token).quote();
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);   
        _safeApprove(quote, preTokenAddr, amountQuoteIn);

        IPreToken(preTokenAddr).contribute(msg.sender, amountQuoteIn);

        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Contribute(token, quote, msg.sender, amountQuoteIn);
        _checkAndOpenMarket(preTokenAddr);
    }

    function redeem(address token) external nonReentrant {
        address preTokenAddr = IToken(token).preToken();
        _checkAndOpenMarket(preTokenAddr);

        require(IPreToken(preTokenAddr).ended(), "Router: Market not open yet");
        IPreToken(preTokenAddr).redeem(msg.sender);

        emit WaveFrontRouter__Redeem(token, msg.sender);
    }

    function _setAffiliate(address affiliate) internal {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        IERC20(token).safeApprove(spender, 0);
        IERC20(token).safeApprove(spender, amount);
    }

    function _checkAndOpenMarket(address preTokenAddr) internal {
        IPreToken preToken = IPreToken(preTokenAddr);
        if (block.timestamp > preToken.endTime() && !preToken.ended()) {
            preToken.openMarket();
            emit WaveFrontRouter__MarketOpened(IPreToken(preTokenAddr).token(), preTokenAddr);
        }
    }

    receive() external payable {}

    function withdrawStuckTokens(address _token, address _to) external onlyOwner {
        require(_to != address(0), "Router: Invalid recipient");
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Router: No balance");
        IERC20(_token).safeTransfer(_to, balance);
    }

     function withdrawStuckNative(address payable _to) external onlyOwner {
         require(_to != address(0), "Router: Invalid recipient");
         uint256 balance = address(this).balance;
         require(balance > 0, "Router: No balance");
         (bool success, ) = _to.call{value: balance}("");
         require(success, "Router: Failed to send ETH");
     }
}