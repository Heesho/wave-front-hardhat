// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title WaveFrontFactory
 * @author heesho
 * 
 * The WaveFrontFactory serves as a central hub and deployer for the WaveFront project,
 * facilitating the creation of new meme tokens without the need for initial liquidity due to the
 * utilization of a virtual bonding curve. It enables fee distribution directly to meme holders,
 * allows for borrowing against memes from their wallets, and supports dynamic supply adjustments
 * through burning, which in turn affects the bonding curve and improves borrowing conditions.
 * 
 * Memes created through WaveFront benefit from a fair launch process, ensured by the PreMeme contract, 
 * which aims to mitigate bot activity and provide equitable access at launch. 
 * 
 * The factory plays a crucial role as a directory and deployer, it maintains a registry of
 * all memes launched, providing a structured and transparent ecosystem for WaveFront tokens.
 * 
 */

interface IMemeFactory {
    function createMeme(string memory name, string memory symbol, string memory uri, address base, address account) external returns (address);
}

interface IMeme {
    function preMeme() external view returns (address);
}

interface IPreMeme {
    function contribute(address account, uint256 amount) external;
}

contract WaveFrontFactory is Ownable {

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant NAME_MAX_LENGTH = 80; // Max length of meme token name
    uint256 public constant SYMBOL_MAX_LENGTH = 8; // Max length of meme token symbol

    /*----------  STATE VARIABLES  --------------------------------------*/
    
    address public immutable base; // Base token address
    address public immutable memeFactory; // Meme factory address
    
    address public treasury; // Treasury address
    uint256 public minAmountIn = 0.001 ether; // Minimum amount of base token required to create a token

    uint256 public index = 1; // Current index counter
    mapping(uint256 => address) public index_Meme; // Meme address by index
    mapping(address => uint256) public meme_Index; // Index by meme address
    mapping(string => uint256) public symbol_Index; // Index by meme symbol

    /*----------  ERRORS ------------------------------------------------*/

    error WaveFrontFactory__NameRequired();
    error WaveFrontFactory__SymbolRequired();
    error WaveFrontFactory__SymbolExists();
    error WaveFrontFactory__NameLimitExceeded();
    error WaveFrontFactory__SymbolLimitExceeded();
    error WaveFrontFactory__InsufficientAmountIn();
    error WaveFrontFactory__InvalidAddress();

    /*----------  EVENTS ------------------------------------------------*/
    
    event WaveFrontFactory__MemeCreated(address meme, address preMeme, string name, string symbol, string uri, address account);
    event WaveFrontFactory__TreasuryUpdated(address treasury);
    event WaveFrontFactory__MinAmountInUpdated(uint256 minAmountIn);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @dev Initializes the WaveFrontFactory with necessary contract addresses and settings.
     * @param _memeFactory Address of the factory contract to create new memes.
     * @param _base Address of the base meme used in the ecosystem.
     * @param _treasury Address of the treasury for fee collection and fund management.
     */
    constructor(address _memeFactory, address _base, address _treasury) {
        memeFactory = _memeFactory;
        base = _base;
        treasury = _treasury;
    }

    /**
     * @dev Creates a new meme through the meme factory. Validates the inputs and 
     * ensures unique symbols and adherence to name and symbol length constraints.
     * @param name The name for the new meme.
     * @param symbol The symbol for the new meme.
     * @param uri The URI for the meme’s metadata.
     * @param account The account that will be the initial status holder of the new meme.
     * @param amountIn The amount of base meme committed to the new meme's PreMeme.
     * @return The address of the newly created meme.
     */
    function createMeme(
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

        address meme = IMemeFactory(memeFactory).createMeme(name, symbol, uri, base, account);
        address preMeme = IMeme(meme).preMeme();
        uint256 currentIndex = index;
        index_Meme[currentIndex] = meme;
        meme_Index[meme] = currentIndex;
        symbol_Index[symbol] = currentIndex;

        emit WaveFrontFactory__MemeCreated(meme, preMeme, name, symbol, uri, account);
        index++;

        IERC20(base).transferFrom(msg.sender, address(this), amountIn);
        IERC20(base).approve(preMeme, amountIn);
        IPreMeme(preMeme).contribute(account, amountIn);

        return meme;
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
     * @dev Sets the minimum required amount of base tokens for creating a new meme, a privileged operation for the owner.
     * @param _minAmountIn The new minimum amount of base tokens for meme creation.
     */
    function setMinAmountIn(uint256 _minAmountIn) external onlyOwner {
        minAmountIn = _minAmountIn;
        emit WaveFrontFactory__MinAmountInUpdated(_minAmountIn);
    }

}