// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWaveFrontFactory {
    function createToken(string memory name, string memory symbol, string memory uri, address account, uint256 amountIn) external returns (address);
}

interface IToken {
    function preToken() external view returns (address);
    function buy(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) external;
    function sell(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to) external;
    function claimFees(address account) external;
    function updateStatus(address account, string memory status) external;
}

interface IPreToken {
    function endTimestamp() external view returns (uint256);
    function ended() external view returns (bool);
    function totalBaseContributed() external view returns (uint256);
    function totalTokenBalance() external view returns (uint256);
    function contribute(address account, uint256 amount) external;
    function redeem(address account) external;
    function openMarket() external;
}

interface IBase {
    function deposit() external payable;
    function withdraw(uint) external;
}

contract WaveFrontRouter {

    address public immutable base;
    address public immutable factory;

    mapping(address => address) public referrals;

    event WaveFrontRouter__Buy(address indexed token, address indexed account, address indexed affiliate, uint256 amountIn, uint256 amountOut);
    event WaveFrontRouter__Sell(address indexed token, address indexed account, uint256 amountIn, uint256 amountOut);
    event WaveFrontRouter__AffiliateSet(address indexed account, address indexed affiliate);
    event WaveFrontRouter__ClaimFees(address indexed token, address indexed account);
    event WaveFrontRouter__TokenCreated(address indexed token, address indexed account);
    event WaveFrontRouter__StatusUpdated(address indexed token, address indexed account, string status);
    event WaveFrontRouter__Contributed(address indexed token, address indexed account, uint256 amount);
    event WaveFrontRouter__Redeemed(address indexed token, address indexed account, uint256 amount);
    event WaveFrontRouter__MarketOpened(address indexed token, uint256 totalBaseContributed, uint256 totalTokenBalance);
    
    constructor(address _factory, address _base) {
        factory = _factory;
        base = _base;
    }

    function buy(
        address token,
        address affiliate,
        uint256 minAmountOut,
        uint256 expireTimestamp
    ) external payable {
        if (referrals[msg.sender] == address(0) && affiliate != address(0)) {
            referrals[msg.sender] = affiliate;
            emit WaveFrontRouter__AffiliateSet(msg.sender, affiliate);
        }

        IBase(base).deposit{value: msg.value}();
        IERC20(base).approve(token, msg.value);
        IToken(token).buy(msg.value, minAmountOut, expireTimestamp, address(this), referrals[msg.sender]);

        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(msg.sender, tokenBalance);
        uint256 baseBalance = IERC20(base).balanceOf(address(this));
        IBase(base).withdraw(baseBalance);
        (bool success, ) = msg.sender.call{value: baseBalance}("");
        require(success, "Failed to send ETH");

        emit WaveFrontRouter__Buy(token, msg.sender, referrals[msg.sender], msg.value, tokenBalance);
    }

    function sell(
        address token,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 expireTimestamp
    ) external {
        IERC20(token).transferFrom(msg.sender, address(this), amountIn);
        IERC20(token).approve(token, amountIn);
        IToken(token).sell(amountIn, minAmountOut, expireTimestamp, address(this));

        uint256 baseBalance = IERC20(base).balanceOf(address(this));
        IBase(base).withdraw(baseBalance);
        (bool success, ) = msg.sender.call{value: baseBalance}("");
        require(success, "Failed to send ETH");
        IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this)));

        emit WaveFrontRouter__Sell(token, msg.sender, baseBalance, amountIn);
    }

    function claimFees(address[] calldata tokens) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            IToken(tokens[i]).claimFees(msg.sender);
            emit WaveFrontRouter__ClaimFees(tokens[i], msg.sender);
        }
    }

    function createToken(
        string memory name,
        string memory symbol,
        string memory uri
    ) external payable returns (address) {
        IBase(base).deposit{value: msg.value}();
        IERC20(base).approve(factory, msg.value);
        address token = IWaveFrontFactory(factory).createToken(name, symbol, uri, msg.sender, msg.value);
        IERC20(token).transfer(msg.sender, IERC20(token).balanceOf(address(this)));
        IERC20(base).transfer(msg.sender, IERC20(base).balanceOf(address(this)));
        emit WaveFrontRouter__Contributed(token, msg.sender, msg.value);
        emit WaveFrontRouter__TokenCreated(token, msg.sender); // add index
        return token;
    }

    function contribute(address token) external payable {
        address preToken = IToken(token).preToken();
        IBase(base).deposit{value: msg.value}();
        IERC20(base).approve(preToken, msg.value);
        IPreToken(preToken).contribute(msg.sender, msg.value);
        emit WaveFrontRouter__Contributed(token, msg.sender, msg.value);
        if (block.timestamp > IPreToken(preToken).endTimestamp() && !IPreToken(preToken).ended()) {
            IPreToken(preToken).openMarket();
            emit WaveFrontRouter__MarketOpened(token, IPreToken(preToken).totalBaseContributed(), IPreToken(preToken).totalTokenBalance());
        }
    }

    function redeem(address token) external {
        address preToken = IToken(token).preToken();
        if (block.timestamp > IPreToken(preToken).endTimestamp() && !IPreToken(preToken).ended()) {
            IPreToken(preToken).openMarket();
            emit WaveFrontRouter__MarketOpened(token, IPreToken(preToken).totalBaseContributed(), IPreToken(preToken).totalTokenBalance());
        }
        IPreToken(preToken).redeem(msg.sender);
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(msg.sender, tokenBalance);
        emit WaveFrontRouter__Redeemed(token, msg.sender, tokenBalance);
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Fallback function is called when msg.data is not empty
    fallback() external payable {}
}