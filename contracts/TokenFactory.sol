// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IWaveFrontFactory {
    function treasury() external view returns (address);
}

contract PreToken is ReentrancyGuard {
    uint256 public constant DURATION = 3600;
    
    address public immutable base;
    address public immutable token;

    uint256 public immutable endTimestamp;
    bool public ended = false;

    uint256 public totalTokenBalance;
    uint256 public totalBaseContributed;
    mapping(address => uint256) public account_BaseContributed;

    error PreToken__ZeroInput();
    error PreToken__Concluded();
    error PreToken__InProgress();
    error PreToken__NotEligible();

    event PreToken__Contributed(address indexed account, uint256 amount);
    event PreToken__MarketOpened(address indexed token, uint256 totalTokenBalance, uint256 totalBaseContributed);
    event PreToken__Redeemed(address indexed account, uint256 amount);

    constructor(address _base) {
        base = _base;
        token = msg.sender;
        endTimestamp = block.timestamp + DURATION;
    }

    function contribute(address account, uint256 amount) external nonReentrant {
        if (amount == 0) revert PreToken__ZeroInput();
        if (ended) revert PreToken__Concluded();
        totalBaseContributed += amount;
        account_BaseContributed[account] += amount;
        IERC20(base).transferFrom(msg.sender, address(this), amount);
        emit PreToken__Contributed(account, amount);
    }

    function openMarket() external {
        if (endTimestamp > block.timestamp) revert PreToken__InProgress();
        if (ended) revert PreToken__Concluded();
        ended = true;
        IERC20(base).approve(token, totalBaseContributed);
        Token(token).buy(totalBaseContributed, 0, 0, address(this), address(0));
        totalTokenBalance = IERC20(token).balanceOf(address(this));
        Token(token).openMarket();
        emit PreToken__MarketOpened(token, totalTokenBalance, totalBaseContributed);
    }

    function redeem(address account) external nonReentrant {
        if (!ended) revert PreToken__InProgress();
        uint256 contribution = account_BaseContributed[account];
        if (contribution == 0) revert PreToken__NotEligible();
        account_BaseContributed[account] = 0;
        uint256 tokenAmount = totalTokenBalance * contribution / totalBaseContributed;
        IERC20(token).transfer(account, tokenAmount);
        emit PreToken__Redeemed(account, tokenAmount);
    }
    
}

contract TokenFees {

    address internal immutable base;
    address internal immutable token;

    constructor(address _base) {
        token = msg.sender;
        base = _base;
    }

    function claimFeesFor(address recipient, uint amountBase) external {
        require(msg.sender == token);
        if (amountBase > 0) IERC20(base).transfer(recipient, amountBase);
    }

}

contract Token is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PRECISION = 1e18;
    uint256 public constant RESERVE_VIRTUAL_BASE = 1000 * PRECISION;
    uint256 public constant INITIAL_SUPPLY = 1000000000 * PRECISION;
    uint256 public constant FEE = 100;
    uint256 public constant FEE_AMOUNT = 2000;
    uint256 public constant DIVISOR = 10000;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable base;
    address public immutable fees;
    address public immutable waveFrontFactory;
    address public immutable preToken;
    string public uri;

    uint256 public maxSupply = INITIAL_SUPPLY;
    bool public open = false;

    // bonding curve state
    uint256 public reserveBase = 0;
    uint256 public reserveToken = INITIAL_SUPPLY;

    // fees state
    uint256 public totalFeesBase;
    uint256 public indexBase;
    mapping(address => uint256) public supplyIndexBase;
    mapping(address => uint256) public claimableBase;

    // borrowing
    uint256 public totalDebt;
    mapping(address => uint256) public account_Debt;

    /*----------  ERRORS ------------------------------------------------*/

    error Token__ZeroInput();
    error Token__Expired();
    error Token__SlippageToleranceExceeded();
    error Token__MarketNotOpen();
    error Token__NotAuthorized();
    error Token__CollateralRequirement();
    error Token__CreditLimit();

    /*----------  EVENTS ------------------------------------------------*/

    event Token__Buy(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Token__Sell(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event Token__Fees(address indexed account, uint256 amountBase, uint256 amountToken);
    event Token__Claim(address indexed account, uint256 amountBase);
    event Token__ProviderFee(address indexed account, uint256 amountBase);
    event Token__ProtocolFee(address indexed account, uint256 amountBase);
    event Token__Burn(address indexed account, uint256 amountToken);
    event Token__ReserveBurn(uint256 amountToken);
    event Token__Borrow(address indexed account, uint256 amountBase);
    event Token__Repay(address indexed account, uint256 amountBase);

    /*----------  MODIFIERS  --------------------------------------------*/

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Token__Expired();
        _;
    }

    modifier notZeroInput(uint256 _amount) {
        if (_amount == 0) revert Token__ZeroInput();
        _;
    }

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor(string memory _name, string memory _symbol, string memory _uri, address _base, address _waveFrontFactory)
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        uri = _uri; 
        waveFrontFactory = _waveFrontFactory;
        base = _base;
        fees = address(new TokenFees(_base));
        preToken = address(new PreToken(_base));
    }

    function buy(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to, address provider) 
        external 
        nonReentrant
        notZeroInput(amountIn)
        notExpired(expireTimestamp) 
    {
        if (!open && msg.sender != preToken) revert Token__MarketNotOpen();

        uint256 feeBase = amountIn * FEE / DIVISOR;
        uint256 newReserveBase = RESERVE_VIRTUAL_BASE + reserveBase + amountIn - feeBase;
        uint256 newReserveToken = (RESERVE_VIRTUAL_BASE + reserveBase) * reserveToken / newReserveBase;
        uint256 amountOut = reserveToken - newReserveToken;

        if (amountOut < minAmountOut) revert Token__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveToken = newReserveToken;

        emit Token__Buy(msg.sender, to, amountIn, amountOut);

        IERC20(base).transferFrom(msg.sender, address(this), amountIn);
        uint256 feeAmount = feeBase * FEE_AMOUNT / DIVISOR;
        if (provider != address(0)) {
            IERC20(base).transfer(provider, feeAmount);
            emit Token__ProviderFee(provider, feeAmount);
            feeBase -= feeAmount;
        } 
        IERC20(base).transfer(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        emit Token__ProtocolFee(IWaveFrontFactory(waveFrontFactory).treasury(), feeAmount);
        feeBase -= feeAmount;

        _mint(to, amountOut);
        _updateBase(feeBase); 
    }

    function sell(uint256 amountIn, uint256 minAmountOut, uint256 expireTimestamp, address to) 
        external 
        nonReentrant
        notZeroInput(amountIn)
        notExpired(expireTimestamp) 
    {
        uint256 feeToken = amountIn * FEE / DIVISOR;
        uint256 newReserveToken = reserveToken + amountIn - feeToken;
        uint256 newReserveBase = (RESERVE_VIRTUAL_BASE + reserveBase) * reserveToken / newReserveToken;
        uint256 amountOut = RESERVE_VIRTUAL_BASE + reserveBase - newReserveBase;

        if (amountOut < minAmountOut) revert Token__SlippageToleranceExceeded();

        reserveBase = newReserveBase - RESERVE_VIRTUAL_BASE;
        reserveToken = newReserveToken;

        emit Token__Sell(msg.sender, to, amountIn, amountOut);

        _burn(msg.sender, amountIn - feeToken);
        burn(feeToken);
        IERC20(base).transfer(to, amountOut);
    }

    function borrow(uint256 amountBase) 
        external 
        nonReentrant
        notZeroInput(amountBase)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (credit < amountBase) revert Token__CreditLimit();
        totalDebt += amountBase;
        account_Debt[msg.sender] += amountBase;
        emit Token__Borrow(msg.sender, amountBase);
        IERC20(base).transfer(msg.sender, amountBase);
    }

    function repay(uint256 amountBase) 
        external 
        nonReentrant
        notZeroInput(amountBase)
    {
        totalDebt -= amountBase;
        account_Debt[msg.sender] -= amountBase;
        emit Token__Repay(msg.sender, amountBase);
        IERC20(base).transferFrom(msg.sender, address(this), amountBase);
    }

    function claimFees(address account) 
        external 
        returns (uint256 claimedBase) 
    {
        _updateFor(account);

        claimedBase = claimableBase[account];

        if (claimedBase > 0) {
            claimableBase[account] = 0;

            TokenFees(fees).claimFeesFor(account, claimedBase);

            emit Token__Claim(account, claimedBase);
        }
    }

    function burn(uint256 amount) 
        public 
        notZeroInput(amount)
    {
        if (maxSupply > reserveToken) {
            uint256 reserveBurn = reserveToken * amount / (maxSupply - reserveToken);
            reserveToken -= reserveBurn;
            maxSupply -= (amount + reserveBurn);
            emit Token__ReserveBurn(reserveBurn);
        } else {
            maxSupply -= amount;
        }
        _burn(msg.sender, amount);
        emit Token__Burn(msg.sender, amount);
    }

    function donate(uint256 amount) 
        external 
        nonReentrant
        notZeroInput(amount)
    {
        IERC20(base).transferFrom(msg.sender, address(this), amount);
        _updateBase(amount);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function openMarket() external {
        if (msg.sender != preToken) revert Token__NotAuthorized();
        open = true;
    }

    function _updateBase(uint256 amount) internal {
        IERC20(base).transfer(fees, amount);
        totalFeesBase += amount;
        uint256 _ratio = amount * 1e18 / totalSupply();
        if (_ratio > 0) {
            indexBase += _ratio;
        }
        emit Token__Fees(msg.sender, amount, 0);
    }
    
    function _updateFor(address recipient) internal {
        uint256 _supplied = balanceOf(recipient);
        if (_supplied > 0) {
            uint256 _supplyIndexBase = supplyIndexBase[recipient];
            uint256 _indexBase = indexBase; 
            supplyIndexBase[recipient] = _indexBase;
            uint256 _deltaBase = _indexBase - _supplyIndexBase;
            if (_deltaBase > 0) {
                uint256 _share = _supplied * _deltaBase / 1e18;
                claimableBase[recipient] += _share;
            }
        } else {
            supplyIndexBase[recipient] = indexBase; 
        }
    }

    /*----------  FUNCTION OVERRIDES  -----------------------------------*/

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20)
    {
        super._beforeTokenTransfer(from, to, amount);
        if (account_Debt[from] > 0 && amount > getAccountTransferrable(from)) revert Token__CollateralRequirement();
        _updateFor(from);
        _updateFor(to);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    function getMarketPrice() external view returns (uint256) {
        return ((RESERVE_VIRTUAL_BASE + reserveBase) * PRECISION) / reserveToken;
    }

    function getFloorPrice() external view returns (uint256) {
        return (RESERVE_VIRTUAL_BASE * PRECISION) / maxSupply;
    }

    function getAccountCredit(address account) public view returns (uint256) {
        if (balanceOf(account) == 0) return 0;
        return ((RESERVE_VIRTUAL_BASE * maxSupply / (maxSupply - balanceOf(account))) - RESERVE_VIRTUAL_BASE) - account_Debt[account];
    }

    function getAccountTransferrable(address account) public view returns (uint256) {
        if (account_Debt[account] == 0) return balanceOf(account);
        return balanceOf(account) - (maxSupply - (RESERVE_VIRTUAL_BASE * maxSupply / (account_Debt[account] + RESERVE_VIRTUAL_BASE)));
    }

}

contract TokenFactory {
    
    address public lastToken;

    event TokenFactory__TokenCreated(address Token);

    function createToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address base
    ) external returns (address) {

        lastToken = address(new Token(name, symbol, uri, base, msg.sender));
        emit TokenFactory__TokenCreated(lastToken);

        return lastToken;
    }
}