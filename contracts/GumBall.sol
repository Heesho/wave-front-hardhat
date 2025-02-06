// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract GumBallToken is ERC721, ERC721Enumerable, ERC721URIStorage, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 constant FEE = 200;
    uint256 constant DIVISOR = 10000;

    /*----------  STATE VARIABLES  --------------------------------------*/

    address public immutable factory;
    address public immutable token;
    uint256 public immutable gumballId;
    uint256 public immutable rate;
    uint256 public immutable maxSupply;

    string public baseTokenURI;
    uint256 public currentTokenId;

    uint256[] public gumballs;
    mapping(uint256 => uint256) public gumballs_Index;

    /*----------  ERRORS ------------------------------------------------*/

    error GumballToken__SupplyMaxed();
    error GumballToken__InvalidGumball();

    /*----------  EVENTS ------------------------------------------------*/

    event GumballToken__Minted(address indexed from, address indexed to, uint256 indexed tokenId);
    event GumballToken__Redeemed(address indexed from, address indexed to, uint256 indexed tokenId);
    event GumballToken__Swapped(address indexed from, address indexed to, uint256 indexed tokenId);
    event GumballToken__BaseTokenURIUpdated(string indexed baseTokenURI);

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
        string memory _name, 
        string memory _symbol,
        address _token,
        uint256 _gumballId,
        uint256 _rate,
        uint256 _maxSupply,
        string memory _baseTokenURI
    ) ERC721(_name, _symbol) {
        factory = msg.sender;
        gumballId = _gumballId;
        token = _token;
        rate = _rate;
        maxSupply = _maxSupply;
        baseTokenURI = _baseTokenURI;
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
            _pop(_gumballs[i]);
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
        if (GumBall(factory).ownerOf(gumballId) != address(0)) {
            uint256 fee = _gumballs.length * rate * FEE / DIVISOR;
            IERC20(token).safeTransfer(GumBall(factory).ownerOf(gumballId), fee);
            IERC20(token).safeTransfer(_to, _gumballs.length * rate - fee);
        } else {
            IERC20(token).safeTransfer(_to, _gumballs.length * rate);
        }
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function setBaseTokenURI(string memory _baseTokenURI) external {
        if (GumBall(factory).ownerOf(gumballId) != msg.sender) revert GumballToken__NotAuthorized();
        baseTokenURI = _baseTokenURI;
        emit GumballToken__BaseTokenURIUpdated(_baseTokenURI);
    }

    function _pop(uint256 _gumballId) internal {
        uint256 index = gumballs_Index[_gumballId];
        if (index == 0) revert GumballToken__InvalidGumball();
        if (gumballs.length > 1 && index != gumballs.length - 1) {
            uint256 lastId = gumballs[gumballs.length - 1];
            gumballs[index] = lastId;
            gumballs_Index[lastId] = index;
        }
        gumballs_Index[_gumballId] = 0;
        gumballs.pop();
    }

    /*----------  OVERRIDE FUNCTIONS  ------------------------------------*/

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

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
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

}

contract GumBall is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable  {

    /*----------  CONSTANTS  --------------------------------------------*/

    /*----------  STATE VARIABLES  --------------------------------------*/

    uint256 public currentTokenId;
    mapping(uint256 => address) public tokenId_GumBallToken;
    address public treasury;

    /*----------  ERRORS ------------------------------------------------*/

    error GumBall__NotAuthorized();

    /*----------  EVENTS ------------------------------------------------*/

    event GumBall__Created(address indexed token);
    event GumBall__TreasurySet(address indexed treasury);

    /*----------  FUNCTIONS  --------------------------------------------*/

    constructor() ERC721("GumBall", "GB") {}

    function create(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner,
        address _token,
        uint256 _rate,
        uint256 _maxSupply,
        string memory _baseTokenURI
    ) 
        external 
        returns (address)
    {
        uint256 tokenId = ++currentTokenId;
        _safeMint(_owner, tokenId);
        _setTokenURI(tokenId, _uri);

        address token = address(new GumBallToken(_name, _symbol, _token, tokenId, _rate, _maxSupply, _baseTokenURI));
        tokenId_GumBallToken[tokenId] = token;
        emit GumBall__Created(token);
        return token;
    }

    function setTokenURI(uint256 tokenId, string memory _uri) external {
        if (msg.sender != ownerOf(tokenId)) revert GumBall__NotAuthorized();
        _setTokenURI(tokenId, _uri);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit GumBall__TreasurySet(_treasury);
    }

    /*----------  OVERRIDE FUNCTIONS  ------------------------------------*/

    function _baseURI() internal view override returns (string memory) {
        return ""; // Return base URI if needed
    }

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
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

}