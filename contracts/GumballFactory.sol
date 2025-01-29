// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract GumballToken is ERC721, ERC721Enumerable, ERC721URIStorage, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 constant FEE = 200;
    uint256 constant DIVISOR = 10000;
    uint256 constant PRECISION = 1e18;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable token;
    uint256 public immutable rate;
    uint256 public immutable maxSupply;

    string public baseTokenURI;
    uint256 public currentTokenId;

    uint256[] public gumballs;
    mapping(uint256 => uint256) public gumballs_Index;

    address public treasury;

    /*----------  ERRORS ------------------------------------------------*/

    error GumballToken__SupplyMaxed();

    /*----------  EVENTS ------------------------------------------------*/

    event GumballToken__Minted(address indexed from, address indexed to, uint256 indexed tokenId);
    event GumballToken__Redeemed(address indexed from, address indexed to, uint256 indexed tokenId);


    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @notice Constructor
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param _token The address of the token
     * @param _rate The rate of the token
     * @param _baseTokenURI The base URI of the token
     * @param _treasury The address of the treasury
     */
    constructor(
        string memory name, 
        string memory symbol,
        address _token,
        uint256 _rate,
        uint256 _maxSupply,
        string memory _baseTokenURI,
        address _treasury

    ) ERC721(name, symbol) {
        token = _token;
        rate = _rate;
        maxSupply = _maxSupply;
        baseTokenURI = _baseTokenURI;
        treasury = _treasury;
    }

    /**
     * @notice Mint GBT with WFT
     * @param _to The address to mint the gumballs to
     * @param _amount The amount of gumballs to mint
     */
    function mint(address _to, uint256 _amount) external nonReentrant {
        for (uint256 i = 0; i < _amount; i++) {
            if (currentTokenId >= maxSupply) revert GumballToken__SupplyMaxed();
            uint256 tokenId = ++currentTokenId;
            _mint(_to, tokenId);
            emit GumballToken__Minted(msg.sender, _to, tokenId);
        }
        IERC20(token).safeTransferFrom(msg.sender, address(this), _amount * rate);
    }

    /**
     * @notice Swap WFT to GBT
     * @param _to The address to swap to
     * @param _gumballs The array of gumballs to swap to
     */
    function swap(address _to, uint256[] memory _gumballs) external nonReentrant {
        for (uint256 i = 0; i < _gumballs.length; i++) {
            _pop(gumballs_Index[_gumballs[i]]);
            safeTransferFrom(msg.sender, _to, _gumballs[i]);
            emit GumballToken__Swapped(msg.sender, _to, _gumballs[i]);
        }
        IERC20(token).safeTransfer(_to, _gumballs.length * rate);
    }

    /**
     * @notice Redeem GBT to WFT
     * @param _to The address to redeem to
     * @param _gumballs The array of gumballs to redeem
     */
    function redeem(address _to, uint256[] memory _gumballs) external nonReentrant {
        for (uint256 i = 0; i < _gumballs.length; i++) {
            gumballs.push(_gumballs[i]);
            gumballs_Index[_gumballs[i]] = gumballs.length - 1;
            safeTransferFrom(msg.sender, address(this), _gumballs[i]);
            emit GumballToken__Redeemed(msg.sender, _to, _gumballs[i]);
        }
        IERC20(token).safeTransfer(_to, _gumballs.length * rate);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function _pop(uint256 _index) internal {

    }

    /*----------  OVERRIDE FUNCTIONS  ------------------------------------*/

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

}

contract GumballFactory is Ownable {

}