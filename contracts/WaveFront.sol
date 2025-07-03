// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ITokenFactory {
    function createToken(
        string memory name,
        string memory symbol,
        address wavefront,
        address preTokenFactory,
        address quote,
        uint256 wavefrontId,
        uint256 reserveVirtQuoteRaw,
        uint256 preTokenDuration
    ) external returns (address token, address preToken);
}

contract WaveFront is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {

    uint256 public constant PRETOKEN_DURATION = 2 hours;

    uint256 public currentTokenId;
    mapping(uint256 => address) public tokenId_WaveFrontToken;
    address public tokenFactory;
    address public treasury;

    error WaveFront__NotAuthorized();

    event WaveFront__Created(
        string name,
        string symbol,
        string uri,
        address tokenFactory,
        address preTokenFactory,
        address token,
        address preToken,
        address indexed owner,
        address quote,
        uint256 wavefrontId,
        uint256 reserveVirtQuoteRaw
    );
    event WaveFront__TokenURISet(uint256 indexed tokenId, string uri);
    event WaveFront__TreasurySet(address indexed oldTreasury, address indexed newTreasury);
    event WaveFront__TokenFactorySet(address indexed oldTokenFactory, address indexed newTokenFactory);

    constructor(address _tokenFactory) ERC721("WaveFront", "WF") Ownable() {
        tokenFactory = _tokenFactory;
    }

    function create(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner,
        address _quote,
        address _preTokenFactory,
        uint256 _reserveVirtQuoteRaw
    )
        external
        returns (address token, address preToken, uint256 tokenId)
    {
        tokenId = ++currentTokenId;
        _safeMint(_owner, tokenId);
        _setTokenURI(tokenId, _uri);

        (token, preToken) = ITokenFactory(tokenFactory).createToken(
            _name,
            _symbol,
            address(this),
            _preTokenFactory,
            _quote,
            tokenId,
            _reserveVirtQuoteRaw,
            PRETOKEN_DURATION
        );

        tokenId_WaveFrontToken[tokenId] = token;
        emit WaveFront__Created(
            _name,
            _symbol,
            _uri,
            tokenFactory,
            _preTokenFactory,
            token,
            preToken,
            _owner,
            _quote,
            tokenId,
            _reserveVirtQuoteRaw
        );
    }

    function setTokenURI(uint256 tokenId, string memory _uri) external {
        if (msg.sender != ownerOf(tokenId)) revert WaveFront__NotAuthorized();
        _setTokenURI(tokenId, _uri);
        emit WaveFront__TokenURISet(tokenId, _uri);
    }

    function setTreasury(address _treasury) external onlyOwner {
        address oldTreasury = treasury;
        treasury = _treasury;
        emit WaveFront__TreasurySet(oldTreasury, _treasury);
    }

    function setTokenFactory(address _tokenFactory) external onlyOwner {
        address oldTokenFactory = tokenFactory;
        tokenFactory = _tokenFactory;
        emit WaveFront__TokenFactorySet(oldTokenFactory, _tokenFactory);
    }

    function _baseURI() internal view override returns (string memory) {
        return "";
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

}
