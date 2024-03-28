// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title WaveFrontFactory
 * @author heesho
 * 
 * The WaveFrontFactory serves as a central hub and deployer for the WaveFront project,
 * facilitating the creation of new tokens without the need for initial liquidity due to the
 * utilization of a virtual bonding curve. It enables fee distribution directly to token holders,
 * allows for borrowing against tokens from their wallets, and supports dynamic supply adjustments
 * through burning, which in turn affects the bonding curve and improves borrowing conditions.
 * 
 * Tokens created through WaveFront benefit from a fair launch process, ensured by the PreToken contract, 
 * which aims to mitigate bot activity and provide equitable access at launch. 
 * 
 * The factory plays a crucial role as a directory and deployer, it maintains a registry of
 * all tokens launched, providing a structured and transparent ecosystem for WaveFront tokens.
 * 
 */

interface ITokenFactory {
    function createToken(string memory name, string memory symbol, string memory uri, address base, address account) external returns (address);
}

interface IToken {
    function preToken() external view returns (address);
}

interface IPreToken {
    function contribute(address account, uint256 amount) external;
}

contract WaveFrontFactory is Ownable {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant NAME_MAX_LENGTH = 80; // Max length of token name
    uint256 public constant SYMBOL_MAX_LENGTH = 8; // Max length of token symbol

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base; // Base token address
    address public treasury; // Treasury address
    address public tokenFactory; // Token factory address
    uint256 public minAmountIn = 0.01 ether; // Minimum amount of base token required to create a token

    uint256 public index = 1; // Current index counter
    mapping(uint256 => address) public index_Token; // Token address by index
    mapping(address => uint256) public token_Index; // Index by token address
    mapping(string => uint256) public symbol_Index; // Index by token symbol

    /*----------  ERRORS ------------------------------------------------*/

    error WaveFrontFactory__NameRequired();
    error WaveFrontFactory__SymbolRequired();
    error WaveFrontFactory__SymbolExists();
    error WaveFrontFactory__NameLimitExceeded();
    error WaveFrontFactory__SymbolLimitExceeded();
    error WaveFrontFactory__InsufficientAmountIn();
    error WaveFrontFactory__InvalidAddress();

    /*----------  EVENTS ------------------------------------------------*/
    
    event WaveFrontFactory__TokenCreated(uint256 index, address token);
    event WaveFrontFactory__TreasuryUpdated(address treasury);
    event WaveFrontFactory__MinAmountInUpdated(uint256 minAmountIn);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Initializes the WaveFrontFactory with necessary contract addresses and settings.
     * @param _tokenFactory Address of the factory contract to create new tokens.
     * @param _base Address of the base token used in the ecosystem.
     * @param _treasury Address of the treasury for fee collection and fund management.
     */
    constructor(address _tokenFactory, address _base, address _treasury) {
        tokenFactory = _tokenFactory;
        base = _base;
        treasury = _treasury;
    }

    /**
     * @dev Creates a new token through the token factory. Validates the inputs and 
     * ensures unique symbols and adherence to name and symbol length constraints.
     * @param name The name for the new token.
     * @param symbol The symbol for the new token.
     * @param uri The URI for the token’s metadata.
     * @param account The account that will be the initial status holder of the new token.
     * @param amountIn The amount of base token committed to the new token's PreToken.
     * @return The address of the newly created token.
     */
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

        address token = ITokenFactory(tokenFactory).createToken(name, symbol, uri, base, account);
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

    /**
     * @dev Updates the treasury address, which is a privileged operation only the contract owner can perform.
     * @param _treasury The new treasury address.
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert WaveFrontFactory__InvalidAddress();
        treasury = _treasury;
        emit WaveFrontFactory__TreasuryUpdated(_treasury);
    }

    /**
     * @dev Sets the minimum required amount of base tokens for creating a new token, a privileged operation for the owner.
     * @param _minAmountIn The new minimum amount of base tokens for token creation.
     */
    function setMinAmountIn(uint256 _minAmountIn) external onlyOwner {
        minAmountIn = _minAmountIn;
        emit WaveFrontFactory__MinAmountInUpdated(_minAmountIn);
    }

}