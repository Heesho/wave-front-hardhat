// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IToken {
    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    ) external returns (uint256 amountTokenOut);
    function openMarket() external;
}

contract PreTokenWhitelist is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public immutable quote;
    address public immutable token;
    uint256 public immutable duration;
    uint256 public immutable endTime;
    bool public ended = false;

    mapping(address => bool) public account_Whitelisted;

    // error PreToken__ZeroInput();
    // error PreToken__Closed();
    // error PreToken__Open();

    constructor(address _token, address _quote, uint256 _duration) {
        token = _token;
        quote = _quote;
        duration = _duration;
        endTime = block.timestamp + duration;
    }

    // function buyWithQuote(uint256 amountQuoteIn, uint256 minAmountTokenOut, uint256 expireTimestamp) external nonReentrant {
    //     if (amountQuoteIn == 0) revert PreToken__ZeroInput();
    //     if (ended || block.timestamp > endTime) revert PreToken__Closed();
    //     if (!account_Whitelisted[msg.sender]) revert PreToken__NotWhitelisted();

    //     IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
    //     IERC20(quote).safeApprove(token, amountQuoteIn);

    //     uint256 amountTokenOut = IToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, msg.sender, address(0));

    //     uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
    //     if (remainingQuote > 0) {
    //         IERC20(quote).safeTransfer(msg.sender, remainingQuote);
    //     }

    //     emit PreToken__Buy(msg.sender, amountQuoteIn, amountTokenOut);
    // }

    // function openMarket() external nonReentrant {
    //     if (block.timestamp <= endTime) revert PreToken__Open();
    //     if (ended) revert PreToken__Closed();
    //     ended = true;

    //     emit PreToken__MarketOpened();
    //     IToken(token).openMarket();
    // }

    // function whitelist(address[] calldata accounts, bool flag) external nonReentrant onlyOwner {
    //     for (uint256 i = 0; i < accounts.length; i++) {
    //         whitelist[accounts[i]] = flag;
    //         emit PreToken__Whitelisted(accounts[i], flag);
    //     }
    // }

}

contract PreTokenWhitelistFactory {

    address public lastPreToken;

    event PreTokenFactory__PreTokenCreated(address indexed preToken);

    function createPreToken(
        address token,
        address quote,
        uint256 duration
    ) external returns (address preToken) {
        preToken = address(new PreTokenWhitelist(token, quote, duration));
        lastPreToken = preToken;
        emit PreTokenFactory__PreTokenCreated(preToken);
    }
    
}