// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

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
    ) external returns (address token);

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

contract WaveFrontRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable wavefront; // Address of the main WaveFront contract
    address public immutable preTokenFactory; // Address of the PreTokenFactory
    address public immutable weth; // Address of WETH contract

    mapping(address => address) public referrals; // User => Affiliate address

    // --- Events ---
    // Removed URI and price fetching from events to simplify and save gas.
    // Frontends can query WaveFrontMulticall or contracts directly for this info.
    event RouterBuy(address indexed token, address indexed account, address quote, uint256 amountQuoteIn, uint256 amountTokenOut);
    event RouterSell(address indexed token, address indexed account, address quote, uint256 amountTokenIn, uint256 amountQuoteOut);
    event RouterAffiliateSet(address indexed account, address indexed affiliate);
    event RouterTokenCreated(address indexed wavefrontNftOwner, address indexed token, address preToken, string name, string symbol, address quote, uint256 initialVirtualQuote);
    event RouterContribute(address indexed token, address indexed account, address quote, uint256 amountQuote);
    event RouterRedeem(address indexed token, address indexed account);
    event RouterMarketOpened(address indexed token, address preToken);

    constructor(address _wavefront, address _preTokenFactory, address _weth) {
        wavefront = _wavefront;
        preTokenFactory = _preTokenFactory;
        weth = _weth;
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
        address quote = IToken(token).quote();
        require(quote == weth, "Router: Native payment only for WETH quote tokens");

        // Wrap ETH to WETH
        IWETH(weth).deposit{value: msg.value}();
        // Approve Token contract to spend WETH from Router
        _safeApprove(weth, token, msg.value);

        // Execute buy on Token contract, sending received tokens back to msg.sender
        uint256 amountTokenOut = IToken(token).buy(msg.value, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit RouterBuy(token, msg.sender, weth, msg.value, amountTokenOut);
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
        address quote = IToken(token).quote();

        // Transfer quote token from user to this Router contract
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        // Approve Token contract to spend quote token from Router
        _safeApprove(quote, token, amountQuoteIn);

        // Execute buy on Token contract, sending received tokens back to msg.sender
        uint256 amountTokenOut = IToken(token).buy(amountQuoteIn, minAmountTokenOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        // If any quote dust remains (shouldn't happen with SafeERC20), return it
        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit RouterBuy(token, msg.sender, quote, amountQuoteIn, amountTokenOut);
    }

    // --- Sell Functions ---

    function sellToNative(
        address token, // The Token contract address
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        address quote = IToken(token).quote();
        require(quote == weth, "Router: Native receive only for WETH quote tokens");

        // Transfer Token from user to Router
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        // Approve Token contract to spend Token from Router
        _safeApprove(token, token, amountTokenIn); // Approve the token itself

        // Execute sell on Token contract, sending received WETH to Router
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, address(this), referrals[msg.sender]);

        // Unwrap WETH to ETH and send to user
        IWETH(weth).withdraw(amountQuoteOut);
        (bool success, ) = msg.sender.call{value: amountQuoteOut}("");
        require(success, "Router: Failed to send ETH");

        emit RouterSell(token, msg.sender, weth, amountTokenIn, amountQuoteOut);
    }

    function sellToQuote(
        address token, // The Token contract address
        uint256 amountTokenIn,
        uint256 minAmountQuoteOut,
        uint256 expireTimestamp
    ) external nonReentrant {
        require(amountTokenIn > 0, "Router: Token amount required");
        address quote = IToken(token).quote();

        // Transfer Token from user to Router
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountTokenIn);
        // Approve Token contract to spend Token from Router
        _safeApprove(token, token, amountTokenIn); // Approve the token itself

        // Execute sell on Token contract, sending received quote tokens to msg.sender directly
        uint256 amountQuoteOut = IToken(token).sell(amountTokenIn, minAmountQuoteOut, expireTimestamp, msg.sender, referrals[msg.sender]);

        emit RouterSell(token, msg.sender, quote, amountTokenIn, amountQuoteOut);
    }

    // --- Token Creation ---

    function createTokenAndNft(
        string memory name,
        string memory symbol,
        string memory uri, // NFT metadata URI
        address quote, // Quote token for the new Token
        uint256 reserveVirtQuote // Initial virtual reserve
    ) external nonReentrant returns (address token) {
        // Call WaveFront contract to create the NFT and deploy the Token (via TokenFactory) and PreToken (via PreTokenFactory)
        token = IWaveFront(wavefront).create(
            name,
            symbol,
            uri,
            msg.sender, // The creator is the owner of the NFT
            quote,
            preTokenFactory, // Use the factory stored in the router
            reserveVirtQuote
        );

        // We don't easily get the PreToken address back here unless WaveFront emits it or returns it.
        // If needed, the frontend might have to derive it or query the Token contract's `preToken()` view function.
        emit RouterTokenCreated(msg.sender, token, address(0), name, symbol, quote, reserveVirtQuote); // Emit 0 for preToken address
    }

    // --- PreToken Interaction Functions ---

    function contributeWithNative(address token /* Token address */) external payable nonReentrant {
        require(msg.value > 0, "Router: Native value required");
        address preTokenAddr = IToken(token).preToken();
        address quote = IToken(token).quote();
        require(quote == weth, "Router: Native payment only for WETH quote tokens");

        // Wrap ETH to WETH
        IWETH(weth).deposit{value: msg.value}();
        // Approve PreToken contract to spend WETH from Router
        _safeApprove(weth, preTokenAddr, msg.value);

        // Contribute WETH
        IPreToken(preTokenAddr).contribute(msg.sender, msg.value);

        emit RouterContribute(token, msg.sender, weth, msg.value);
        _checkAndOpenMarket(preTokenAddr); // Check if market can be opened
    }

    function contributeWithQuote(address token /* Token address */, uint256 amountQuoteIn) external nonReentrant {
        require(amountQuoteIn > 0, "Router: Quote amount required");
        address preTokenAddr = IToken(token).preToken();
        address quote = IToken(token).quote();

        // Transfer quote token from user to Router
        IERC20(quote).safeTransferFrom(msg.sender, address(this), amountQuoteIn);
        // Approve PreToken contract to spend quote token from Router
        _safeApprove(quote, preTokenAddr, amountQuoteIn);

        // Contribute quote token
        IPreToken(preTokenAddr).contribute(msg.sender, amountQuoteIn);

         // If any quote dust remains, return it
        uint256 remainingQuote = IERC20(quote).balanceOf(address(this));
        if (remainingQuote > 0) {
            IERC20(quote).safeTransfer(msg.sender, remainingQuote);
        }

        emit RouterContribute(token, msg.sender, quote, amountQuoteIn);
        _checkAndOpenMarket(preTokenAddr); // Check if market can be opened
    }

    function redeem(address token /* Token address */) external nonReentrant {
        address preTokenAddr = IToken(token).preToken();
        _checkAndOpenMarket(preTokenAddr); // Ensure market is open or try to open it if possible

        require(IPreToken(preTokenAddr).ended(), "Router: Market not open yet");
        IPreToken(preTokenAddr).redeem(msg.sender); // Send redeemed tokens directly to msg.sender

        emit RouterRedeem(token, msg.sender);
    }

    // --- Internal Functions ---

    function _setAffiliate(address affiliate) internal {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit RouterAffiliateSet(msg.sender, affiliate);
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
            emit RouterMarketOpened(address(0), preTokenAddr);
        }
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Allow withdrawing accidental token transfers to the router
    function withdrawStuckTokens(address _token, address _to) external nonReentrant {
        // TODO: Add Owner check or similar authorization mechanism
        require(_to != address(0), "Router: Invalid recipient");
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Router: No balance");
        IERC20(_token).safeTransfer(_to, balance);
    }

     function withdrawStuckNative(address payable _to) external nonReentrant {
         // TODO: Add Owner check or similar authorization mechanism
         require(_to != address(0), "Router: Invalid recipient");
         uint256 balance = address(this).balance;
         require(balance > 0, "Router: No balance");
         (bool success, ) = _to.call{value: balance}("");
         require(success, "Router: Failed to send ETH");
     }
}