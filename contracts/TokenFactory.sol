// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./library/FixedPointMathLib.sol";

interface IWaveFront {
    function treasury() external view returns (address);
}

interface ISaleFactory {
    function createSale(address token, address quote) external returns (address saleAddress);
}

interface IContentFactory {
    function createContent(string memory _name, string memory _symbol, address rewarderFactory) external returns (address, address);
}

interface IFeesFactory {
    function createFees(address rewarder, address token, address quote) external returns (address fees);
}

contract Token is ERC20, ERC20Permit, ERC20Votes, ReentrancyGuard {
    using FixedPointMathLib for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant PRECISION = 1e18;
    uint256 public constant FEE = 100;
    uint256 public constant FEE_AMOUNT = 1_500;
    uint256 public constant DIVISOR = 10_000;

    address public immutable wavefront;
    address public immutable quote;
    address public immutable sale;
    address public immutable content;
    address public immutable rewarder;
    address public immutable fees;

    uint8 public immutable quoteDecimals;
    uint256 internal immutable quoteScale;

    uint256 public maxSupply;
    bool public open = false;

    uint256 public reserveRealQuoteWad;
    uint256 public reserveVirtQuoteWad;
    uint256 public reserveTokenAmt;

    uint256 public totalDebtRaw;
    mapping(address => uint256) public account_DebtRaw;

    error Token__ZeroInput();
    error Token__QuoteDecimals();
    error Token__Expired();
    error Token__Slippage();
    error Token__MarketClosed();
    error Token__NotAuthorized();
    error Token__CollateralLocked();
    error Token__CreditExceeded();
    error Token__InvalidShift();
    error Token__DivideByZero();
    error Token__ReserveUnderflow();
    error Token__NotOwner();

    event Token__Swap(
        address indexed from,
        uint256 quoteInRaw,
        uint256 tokenIn,
        uint256 quoteOutRaw,
        uint256 tokenOut,
        address indexed to
    );
    event Token__ProviderFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    event Token__TreasuryFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    event Token__ContentFee(address indexed to, uint256 quoteRaw, uint256 tokenAmt);
    event Token__Burn(address indexed who, uint256 tokenAmt);
    event Token__Heal(address indexed who, uint256 quoteRaw);
    event Token__ReserveTokenBurn(uint256 tokenAmt);
    event Token__ReserveQuoteHeal(uint256 quoteRaw);
    event Token__Borrow(address indexed who, address indexed to, uint256 quoteRaw);
    event Token__Repay(address indexed who, address indexed to, uint256 quoteRaw);
    event Token__MarketOpened();

    modifier notZero(uint256 amount) {
        if (amount == 0) revert Token__ZeroInput();
        _;
    }

    modifier notExpired(uint256 expireTimestamp) {
        if (expireTimestamp != 0 && expireTimestamp < block.timestamp) revert Token__Expired();
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _wavefront,
        address _quote,
        uint256 _initialSupply,
        uint256 _virtQuoteRaw,
        address saleFactory,
        address contentFactory,
        address feesFactory,
        address rewarderFactory
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        wavefront = _wavefront;
        quote = _quote;

        uint8 _quoteDecimals = IERC20Metadata(_quote).decimals();
        if (_quoteDecimals > 18) revert Token__QuoteDecimals();
        quoteDecimals = _quoteDecimals;
        quoteScale = 10 ** (18 - _quoteDecimals);

        maxSupply = _initialSupply;
        reserveTokenAmt = _initialSupply;
        reserveVirtQuoteWad = rawToWad(_virtQuoteRaw);

        sale = ISaleFactory(saleFactory).createSale(address(this), _quote);
        (content, rewarder) = IContentFactory(contentFactory).createContent(_name, _symbol, rewarderFactory);
        fees = IFeesFactory(feesFactory).createFees(rewarder, address(this), _quote);
    }

    function buy(
        uint256 quoteRawIn,
        uint256 minTokenAmtOut,
        uint256 deadline,
        address to,
        address provider
    )
        external
        nonReentrant
        notZero(quoteRawIn)
        notExpired(deadline)
        returns (uint256 tokenAmtOut)
    {
        if (!open && msg.sender != sale) revert Token__MarketClosed();

        uint256 feeRaw = quoteRawIn * FEE / DIVISOR;
        uint256 netRaw = quoteRawIn - feeRaw;
        uint256 netWad = rawToWad(netRaw);

        uint256 x0 = reserveVirtQuoteWad + reserveRealQuoteWad;
        uint256 y0 = reserveTokenAmt;
        uint256 x1 = x0 + netWad;
        if (x1 == 0) revert Token__DivideByZero();

        uint256 y1 = x0.mulWadUp(y0).divWadUp(x1);
        tokenAmtOut = y0 - y1;
        if (tokenAmtOut < minTokenAmtOut) revert Token__Slippage();

        reserveRealQuoteWad += netWad;
        reserveTokenAmt = y1;

        emit Token__Swap(msg.sender, quoteRawIn, 0, 0, tokenAmtOut, to);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRawIn);

        uint256 healRaw = _processBuyFees(feeRaw, provider);
        if (healRaw > 0) _healQuoteReserves(healRaw);

        _mint(to, tokenAmtOut);
    }

    function sell(
        uint256 tokenAmtIn,
        uint256 minQuoteRawOut,
        uint256 deadline,
        address to,
        address provider
    )
        external
        nonReentrant
        notZero(tokenAmtIn)
        notExpired(deadline)
        returns (uint256 quoteRawOut)
    {
        if (!open) revert Token__MarketClosed();

        uint256 feeAmt = tokenAmtIn * FEE / DIVISOR;
        uint256 netAmt = tokenAmtIn - feeAmt;

        uint256 x0 = reserveVirtQuoteWad + reserveRealQuoteWad;
        uint256 y0 = reserveTokenAmt;
        uint256 y1 = y0 + netAmt;
        if (y1 == 0) revert Token__DivideByZero();

        uint256 x1 = x0.mulWadUp(y0).divWadUp(y1);
        uint256 quoteWadOut = x0 - x1;
        quoteRawOut = wadToRaw(quoteWadOut);

        if (quoteRawOut < minQuoteRawOut) revert Token__Slippage();
        if (x1 < reserveVirtQuoteWad) revert Token__ReserveUnderflow();

        reserveRealQuoteWad = x1 - reserveVirtQuoteWad;
        reserveTokenAmt = y1;

        emit Token__Swap(msg.sender, 0, tokenAmtIn, quoteRawOut, 0, to);
        _burn(msg.sender, tokenAmtIn);

        uint256 burned = _processSellFees(feeAmt, provider);
        if (burned > 0) _burnTokenReserves(burned);

        IERC20(quote).safeTransfer(to, quoteRawOut);
    }

    function borrow(address to, uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        uint256 credit = getAccountCredit(msg.sender);
        if (quoteRaw > credit) revert Token__CreditExceeded();

        totalDebtRaw += quoteRaw;
        account_DebtRaw[msg.sender] += quoteRaw;

        emit Token__Borrow(msg.sender, to, quoteRaw);
        IERC20(quote).safeTransfer(to, quoteRaw);
    }

    function repay(address to, uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        totalDebtRaw -= quoteRaw;
        account_DebtRaw[to] -= quoteRaw;

        emit Token__Repay(msg.sender, to, quoteRaw);
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRaw);
    }

    function heal(uint256 quoteRaw)
        external
        nonReentrant
        notZero(quoteRaw)
    {
        IERC20(quote).safeTransferFrom(msg.sender, address(this), quoteRaw);
        _healQuoteReserves(quoteRaw);
    }

    function burn(uint256 tokenAmt)
        external
        nonReentrant
        notZero(tokenAmt)
    {
        _burn(msg.sender, tokenAmt);
        _burnTokenReserves(tokenAmt);
    }

    function openMarket()
        external
    {
        if (msg.sender != sale) revert Token__NotAuthorized();
        open = true;
        emit Token__MarketOpened();
    }

    function rawToWad(uint256 raw) public view returns (uint256) {
        unchecked { return raw * quoteScale; }
    }

    function wadToRaw(uint256 wad) public view returns (uint256) {
        return wad / quoteScale;
    }

    function _processBuyFees(uint256 quoteRaw, address provider)
        internal
        returns (uint256 remainingRaw)
    {
        remainingRaw = quoteRaw;
        uint256 shareRaw = quoteRaw * FEE_AMOUNT / DIVISOR;

        if (provider != address(0) && shareRaw > 0) {
            uint256 providerFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
            if (providerFee > 0) {
                IERC20(quote).safeTransfer(provider, providerFee);
                emit Token__ProviderFee(provider, providerFee, 0);
                remainingRaw -= providerFee;
            }
        }

        if (remainingRaw > 0) {
            uint256 contentFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
            if (contentFee > 0) {
                IERC20(quote).safeTransfer(fees, contentFee);
                emit Token__ContentFee(fees, contentFee, 0);
                remainingRaw -= contentFee;
            }
        }

        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingRaw > 0) {
            uint256 treasuryFee = shareRaw <= remainingRaw ? shareRaw : remainingRaw;
            if (treasuryFee > 0) {
                IERC20(quote).safeTransfer(treasury, treasuryFee);
                emit Token__TreasuryFee(treasury, treasuryFee, 0);
                remainingRaw -= treasuryFee;
            }
        }
        return remainingRaw;
    }

    function _processSellFees(uint256 tokenAmt, address provider)
        internal
        returns (uint256 remainingAmt)
    {
        remainingAmt = tokenAmt;
        uint256 shareAmt = tokenAmt * FEE_AMOUNT / DIVISOR;

        if (provider != address(0) && shareAmt > 0) {
            uint256 providerFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
            if (providerFee > 0) {
                _mint(provider, providerFee);
                emit Token__ProviderFee(provider, 0, providerFee);
                remainingAmt -= providerFee;
            }
        }

        if (remainingAmt > 0) {
            uint256 contentFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
            if (contentFee > 0) {
                _mint(fees, contentFee);
                emit Token__ContentFee(fees, 0, contentFee);
                remainingAmt -= contentFee;
            }
        }

        address treasury = IWaveFront(wavefront).treasury();
        if (treasury != address(0) && remainingAmt > 0) {
            uint256 treasuryFee = shareAmt <= remainingAmt ? shareAmt : remainingAmt;
            if (treasuryFee > 0) {
                _mint(treasury, treasuryFee);
                emit Token__TreasuryFee(treasury, 0, treasuryFee);
                remainingAmt -= treasuryFee;
            }
        }

        return remainingAmt;
    }

    function _healQuoteReserves(uint256 quoteRaw)
        internal
    {
        uint256 quoteWad = rawToWad(quoteRaw);
        uint256 m = maxSupply;
        uint256 y = reserveTokenAmt;
        if (m <= y) revert Token__InvalidShift();

        uint256 virtAddWad = y.mulWadDown(quoteWad).divWadDown(m - y);

        reserveRealQuoteWad += quoteWad;
        reserveVirtQuoteWad += virtAddWad;

        emit Token__ReserveQuoteHeal(wadToRaw(virtAddWad));
        emit Token__Heal(msg.sender, quoteRaw);
    }

    function _burnTokenReserves(uint256 tokenAmt)
        internal
    {
        if (tokenAmt == 0) return;

        uint256 m = maxSupply;
        uint256 y = reserveTokenAmt;
        if (m <= y) revert Token__InvalidShift();

        uint256 reserveBurn = y.mulWadDown(tokenAmt).divWadDown(m - y);

        reserveTokenAmt -= reserveBurn;
        maxSupply -= (tokenAmt + reserveBurn);

        emit Token__ReserveTokenBurn(reserveBurn);
        emit Token__Burn(msg.sender, tokenAmt);
    }

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

        if (from != address(0) && account_DebtRaw[from] > 0) {
            uint256 transferrable = getAccountTransferrable(from);
            if (amount > transferrable) {
                revert Token__CollateralLocked();
            }
        }
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

    function getMarketPrice()
        external
        view
        returns (uint256 price)
    {
        if (reserveTokenAmt == 0) return 0;
        uint256 totalQuoteWad = reserveVirtQuoteWad + reserveRealQuoteWad;
        return totalQuoteWad.mulWadDown(PRECISION).divWadDown(reserveTokenAmt);
    }

    function getFloorPrice()
        external
        view
        returns (uint256 price)
    {
        if (maxSupply == 0) return 0;
        return reserveVirtQuoteWad.mulWadDown(PRECISION).divWadDown(maxSupply);
    }

    function getAccountCredit(address account)
        public
        view
        returns (uint256 creditRaw)
    {
        uint256 balance = balanceOf(account);
        if (balance == 0) return 0;

        uint256 m = maxSupply;
        uint256 xv = reserveVirtQuoteWad;
        if (balance >= m) return 0;

        uint256 requiredWad = xv.mulWadDown(m).divWadDown(m - balance);
        uint256 creditLimitWad = requiredWad - xv;
        uint256 creditLimitRaw = wadToRaw(creditLimitWad);
        uint256 debtRaw = account_DebtRaw[account];

        creditRaw = creditLimitRaw > debtRaw ? creditLimitRaw - debtRaw : 0;
        return creditRaw;
    }

    function getAccountTransferrable(address account)
        public
        view
        returns (uint256 tokenAmt)
    {
        uint256 debtRaw = account_DebtRaw[account];
        uint256 balance = balanceOf(account);
        if (debtRaw == 0) return balance;

        uint256 m = maxSupply;
        uint256 xv = reserveVirtQuoteWad;
        if (xv == 0) return 0;

        uint256 debtWad = rawToWad(debtRaw);
        uint256 requiredWad = xv + debtWad;
        if (requiredWad == 0) return 0;
        uint256 nonLocked = xv.mulWadDown(m).divWadDown(requiredWad);
        uint256 locked = m - nonLocked;

        tokenAmt = balance > locked ? balance - locked : 0;
        return tokenAmt;
    }
}


contract TokenFactory {
    address public lastToken;

    event TokenFactory__TokenCreated(address indexed token);

    function createToken(
        string memory name,
        string memory symbol,
        address wavefront,
        address quote,
        uint256 initialSupply,
        uint256 reserveVirtQuoteRaw,
        uint256 saleDuration,
        address saleFactory,
        address contentFactory,
        address feesFactory,
        address rewarderFactory
    ) external returns (address token) {
        token = address(new Token(
            name,
            symbol,
            wavefront,
            quote,
            initialSupply,
            reserveVirtQuoteRaw,
            saleDuration,
            saleFactory,
            contentFactory,
            feesFactory,
            rewarderFactory
        ));
        lastToken = token;
        emit TokenFactory__TokenCreated(token);
    }
    
}
