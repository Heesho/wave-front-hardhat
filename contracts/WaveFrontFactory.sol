// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokenFactory {
    function createToken(string memory name, string memory symbol, string memory uri, address base) external returns (address);
}

interface IToken {
    function preToken() external view returns (address);
}

interface IPreToken {
    function contribute(address account, uint256 amount) external;
}

contract WaveFrontFactory is Ownable {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant NAME_MAX_LENGTH = 80;
    uint256 public constant SYMBOL_MAX_LENGTH = 8;

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base;
    address public treasury;
    address public tokenFactory;
    uint256 public minAmountIn = 0.1 ether;

    uint256 public index = 1;
    mapping(uint256=>address) public index_Token;
    mapping(address=>uint256) public token_Index;
    mapping(string=>uint256) public symbol_Index;

    /*----------  ERRORS ------------------------------------------------*/

    error WaveFrontFactory__NameRequired();
    error WaveFrontFactory__SymbolRequired();
    error WaveFrontFactory__SymbolExists();
    error WaveFrontFactory__NameLimitExceeded();
    error WaveFrontFactory__SymbolLimitExceeded();
    error WaveFrontFactory__InsufficientAmountIn();

    /*----------  EVENTS ------------------------------------------------*/
    
    event WaveFrontFactory__TokenCreated(uint256 index, address token);
    event WaveFrontFactory__TreasuryUpdated(address treasury);

    /*----------  MODIFIERS  --------------------------------------------*/

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor(address _tokenFactory, address _base, address _treasury) {
        tokenFactory = _tokenFactory;
        base = _base;
        treasury = _treasury;
    }
        
    function createToken(
        string memory name,
        string memory symbol,
        string memory uri,
        address account,
        uint256 amountIn
    ) external returns (address) {
        if (amountIn < minAmountIn) revert WaveFrontFactory__InsufficientAmountIn();
        if (symbol_Index[symbol] != 0) revert WaveFrontFactory__SymbolExists();
        if (bytes(name).length == 0) revert WaveFrontFactory__NameRequired();
        if (bytes(symbol).length == 0) revert WaveFrontFactory__SymbolRequired();
        if (bytes(name).length > NAME_MAX_LENGTH) revert WaveFrontFactory__NameLimitExceeded();
        if (bytes(symbol).length > SYMBOL_MAX_LENGTH) revert WaveFrontFactory__SymbolLimitExceeded();

        address token = ITokenFactory(tokenFactory).createToken(name, symbol, uri, base);
        address preToken = IToken(token).preToken();
        index_Token[index] = token;
        token_Index[token] = index;
        symbol_Index[symbol] = index;

        emit WaveFrontFactory__TokenCreated(index, token);
        index++;

        IERC20(base).transferFrom(msg.sender, address(this), amountIn);
        IERC20(base).approve(preToken, amountIn);
        IPreToken(preToken).contribute(account, amountIn);

        return token;
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit WaveFrontFactory__TreasuryUpdated(_treasury);
    }

    function setMinAmountIn(uint256 _minAmountIn) external onlyOwner {
        minAmountIn = _minAmountIn;
    }

}