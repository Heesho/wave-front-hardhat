// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// --- Interfaces matching updated contracts ---

interface IWaveFront {
    // Assuming WaveFront.create is the entry point
    function create(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner, // Owner of the NFT, receives fees
        address _quote,
        address _preTokenFactory,
        uint256 _reserveVirtQuote
    ) external returns (address token, address preToken, uint256 tokenId);

    function tokenURI(uint256 tokenId) external view returns (string memory);
    // We might need a way to get the tokenId from the token address if we want the URI in events.
    // Or WaveFront.create could return both address and tokenId.
    // Or we accept that router events won't easily include the NFT URI. Let's omit URI for now.
}

interface IToken {
    function quote() external view returns (address);
    function preToken() external view returns (address);
    function wavefront() external view returns (address); // Needed if WaveFront address isn't stored elsewhere
    function wavefrontId() external view returns (uint256); // Needed to potentially get URI via IWaveFront

    function buy(
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp,
        address to,
        address provider // Provider receives a share of the fee
    ) external returns (uint256 amountTokenOut); // Assuming buy returns amount out

    function sell(
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp,
        address to,
        address provider // Provider receives a share of the fee
    ) external returns (uint256 amountQuoteOut); // Assuming sell returns amount out

    // No direct price getters needed in router execution, maybe remove from events
    // function getMarketPrice() external view returns (uint256);
    // function getFloorPrice() external view returns (uint256);
}

interface IPreToken {
    function endTimestamp() external view returns (uint256);
    function ended() external view returns (bool); // Market open status
    function totalQuoteContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256); // Tokens held post-initial buy
    function token() external view returns (address);

    function contribute(address account, uint256 amount) external;
    function redeem(address account) external;
    function openMarket() external;
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    // Needed for checking balance if WETH is used as quote
    function balanceOf(address account) external view returns (uint256);
}

contract WaveFrontRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public immutable wavefront; // Address of the main WaveFront contract
    address public immutable preTokenFactory; // Address of the PreTokenFactory
    address public immutable weth; // Address of WETH contract

    mapping(address => address) public referrals; // User => Affiliate address

    // --- Events ---
    // Removed URI and price fetching from events to simplify and save gas.
    // Frontends can query WaveFrontMulticall or contracts directly for this info.
    event WaveFrontRouter__Created(
        string name,
        string symbol,
        string uri,
        address indexed creator,
        address token,
        address preToken,
        uint256 tokenId,
        uint256 initialVirtualQuote);
    event WaveFrontRouter__Buy(address indexed token, address indexed account, address indexed affiliate, uint256 amountQuoteIn, uint256 amountTokenOut);
    event WaveFrontRouter__Sell(address indexed token, address indexed account, address indexed affiliate, uint256 amountTokenIn, uint256 amountQuoteOut);
    event WaveFrontRouter__AffiliateSet(address indexed account, address indexed affiliate);
    event WaveFrontRouter__Contribute(address indexed token, address indexed account, uint256 amountQuote);
    event WaveFrontRouter__Redeem(address indexed token, address indexed account);
    event WaveFrontRouter__MarketOpened(address indexed token, address preToken);

    constructor(address _wavefront, address _preTokenFactory, address _weth) {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
        weth = _weth;
    }

    // --- Token Creation ---

    function createWaveFrontToken(
        string memory name,
        string memory symbol,
        string memory uri, // NFT metadata URI
        uint256 reserveVirtQuote // Initial virtual reserve
    ) external nonReentrant returns (address token, address preToken, uint256 tokenId) {
        // Call WaveFront contract and capture both return values
        (token, preToken, tokenId) = IWaveFront(wavefront).create(
            name,
            symbol,
            uri,
            msg.sender, // The creator is the owner of the NFT
            weth,
            preTokenFactory, // Use the factory stored in the router
            reserveVirtQuote
        );

        emit WaveFrontRouter__Created(name, symbol, uri, msg.sender, token, preToken, tokenId, reserveVirtQuote);
    }

    // --- Buy Functions ---

    function buyWithNative(
        address token, // The Token contract address
        address affiliate,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        _setAffiliate(affiliate);

        // Wrap ETH to WETH
        IWETH(weth).deposit{value: msg.value}();
        // Approve Token contract to spend WETH from Router
        _safeApprove(weth, token, msg.value);

        // Execute buy on Token contract, sending received tokens back to msg.sender
        uint256 amountTokenOut = IToken(token).buy(msg.value, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Buy(token, msg.sender, affiliate, msg.value, amountTokenOut);
    }

    function buyWithQuote(
        address token, // The Token contract address
        address affiliate,
        uint256 amountQuoteIn,
        uint256 minAmountTokenOut,
        uint256 expireTimestamp
    ) external nonReentrant {
         require(amountQuoteIn > 0, "Router: Quote amount required");
        _setAffiliate(affiliate);

        // Transfer quote token from user to this Router contract
        IERC20(weth).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        // Approve Token contract to spend quote token from Router
        _safeApprove(weth, token, amountQuoteIn);

        // Execute buy on Token contract, sending received tokens back to msg.sender
        uint256 amountTokenOut = IToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        // If any quote dust remains (shouldn't happen with SafeERC20), return it
        uint256 remainingQuote = IERC20(weth).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(weth).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Buy(token, msg.sender, affiliate, amountQuoteIn, amountTokenOut);
    }

    // --- Sell Functions ---

    function sellToNative(
        address token, // The Token contract address
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        // Transfer Token from user to Router
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);

        // Execute sell on Token contract, sending received WETH to Router
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        // Unwrap WETH to ETH and send to user
        IWETH(weth).withdraw(amountQuoteOut);
        (bool success, ) = msg.sender.call{value: amountQuoteOut}("");
        require(success, "Router: Failed to send ETH");

        emit WaveFrontRouter__Sell(token, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }

    function sellToQuote(
        address token, // The Token contract address
        address affiliate,
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        _setAffiliate(affiliate);

        // Transfer Token from user to Router
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);

        // Execute sell on Token contract, sending received quote tokens to msg.sender directly
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit WaveFrontRouter__Sell(token, msg.sender, affiliate, amountTokenIn, amountQuoteOut);
    }


    // --- PreToken Interaction Functions ---

    function contributeWithNative(address token /* Token address */) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        address preTokenAddr = IToken(token).preToken();

        // Wrap ETH to WETH
        IWETH(weth).deposit{value: msg.value}();
        // Approve PreToken contract to spend WETH from Router
        _safeApprove(weth, preTokenAddr, msg.value);

        // Contribute WETH
        IPreToken(preTokenAddr).contribute(msg.sender, msg.value);

        emit WaveFrontRouter__Contribute(token, msg.sender, msg.value);
        _checkAndOpenMarket(preTokenAddr); // Check if market can be opened
    }

    function contributeWithQuote(address token /* Token address */, uint256 amountQuoteIn) external nonReentrant {
        require(amountQuoteIn > 0, "Router: Quote amount required");
        address preTokenAddr = IToken(token).preToken();

        // Transfer quote token from user to Router
        IERC20(weth).safeTransferFrom(msg.sender, address(this), amountQuoteIn);   
        // Approve PreToken contract to spend quote token from Router
        _safeApprove(weth, preTokenAddr, amountQuoteIn);

        // Contribute quote token
        IPreToken(preTokenAddr).contribute(msg.sender, amountQuoteIn);

         // If any quote dust remains, return it
        uint256 remainingQuote = IERC20(weth).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(weth).safeTransfer(msg.sender, remainingQuote);
        }

        emit WaveFrontRouter__Contribute(token, msg.sender, amountQuoteIn);
        _checkAndOpenMarket(preTokenAddr); // Check if market can be opened
    }

    function redeem(address token /* Token address */) external nonReentrant {
        address preTokenAddr = IToken(token).preToken();
        _checkAndOpenMarket(preTokenAddr); // Ensure market is open or try to open it if possible

        require(IPreToken(preTokenAddr).ended(), "Router: Market not open yet");
        IPreToken(preTokenAddr).redeem(msg.sender); // Send redeemed tokens directly to msg.sender

        emit WaveFrontRouter__Redeem(token, msg.sender);
    }

    // --- Internal Functions ---

    function _setAffiliate(address affiliate) internal {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }
    }

    // Reset approval to 0 first, then approve the desired amount
    function _safeApprove(address token, address spender, uint256 amount) internal {
        IERC20(token).safeApprove(spender, 0);
        IERC20(token).safeApprove(spender, amount);
    }

    // Checks if the contribution period is over and the market isn't open, then tries to open it.
    function _checkAndOpenMarket(address preTokenAddr) internal {
        IPreToken preToken = IPreToken(preTokenAddr);
        if (block.timestamp > preToken.endTimestamp() && !preToken.ended()) {
            preToken.openMarket();
            // Use associated Token address in event if possible, otherwise just preToken addr
            // We need the reverse mapping or another way to find the Token address from PreToken
            // For now, emit with preToken address.
            emit WaveFrontRouter__MarketOpened(IPreToken(preTokenAddr).token(), preTokenAddr);
        }
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Allow withdrawing accidental token transfers to the router
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