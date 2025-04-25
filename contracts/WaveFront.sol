// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice Interface for the token factory contract responsible for creating new ERC-20 tokens.
 * @dev This interface defines the function signature required to deploy new WaveFrontToken instances.
 */
interface ITokenFactory {
    /**
     * @notice Creates a new WaveFrontToken (ERC-20) and its associated PreToken.
     * @dev Called by the WaveFront contract during the `create` process.
     * @param name The name of the new ERC-20 token.
     * @param symbol The symbol of the new ERC-20 token.
     * @param wavefront The address of the parent WaveFront (ERC-721) contract.
     * @param preTokenFactory The address of the factory used to create the PreToken.
     * @param quote The address of the quote token used for the AMM.
     * @param wavefrontId The unique ID of the WaveFront NFT representing this token launch.
     * @param reserveVirtQuoteRaw The initial virtual quote reserve amount (raw, 18 decimals).
     * @return token The address of the newly created WaveFrontToken.
     * @return preToken The address of the newly created PreToken.
     */
    function createToken(
        string memory name,
        string memory symbol,
        address wavefront,
        address preTokenFactory,
        address quote,
        uint256 wavefrontId,
        uint256 reserveVirtQuoteRaw
    ) external returns (address token, address preToken);
}

/**
 * @title WaveFront
 * @notice Factory contract for launching WaveFrontToken instances, represented by NFTs.
 * @dev Each NFT minted by this contract corresponds to a unique WaveFrontToken deployment.
 * @author heesho <https://github.com/heesho>
 */
contract WaveFront is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {

    /**
     * @notice Counter for assigning unique IDs to WaveFront NFTs. Incremented before minting.
     */
    uint256 public currentTokenId;
    /**
     * @notice Mapping from WaveFront NFT ID to the deployed WaveFrontToken (ERC-20) address.
     */
    mapping(uint256 => address) public tokenId_WaveFrontToken;
    /**
     * @notice Address of the factory contract used to create WaveFrontToken instances.
     */
    address public tokenFactory;
    /**
     * @notice Address where potential future fees might be collected. Currently unused.
     */
    address public treasury;

    /**
     * @notice Error thrown when an action is attempted by an address other than the NFT owner.
     * @custom:error Caller is not the owner of the specified WaveFront NFT.
     */
    error WaveFront__NotAuthorized();

    /**
     * @notice Emitted when a new WaveFront NFT and corresponding WaveFrontToken are created.
     * @param name The name of the new WaveFrontToken.
     * @param symbol The symbol of the new WaveFrontToken.
     * @param uri The URI associated with the WaveFront NFT.
     * @param tokenFactory The address of the token factory used.
     * @param preTokenFactory The address of the pre-token factory used.
     * @param token The address of the deployed WaveFrontToken.
     * @param preToken The address of the deployed PreToken.
     * @param owner The initial owner of the WaveFront NFT.
     * @param quote The quote token address for the new token's AMM.
     * @param wavefrontId The ID of the newly minted WaveFront NFT.
     * @param reserveVirtQuoteRaw The initial virtual quote reserve (raw, 18 decimals) for the AMM.
     */
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
    /**
     * @notice Emitted when the token URI of a WaveFront NFT is updated.
     * @param tokenId The ID of the WaveFront NFT whose URI was updated.
     * @param uri The new URI string.
     */
    event WaveFront__TokenURISet(uint256 indexed tokenId, string uri);
    /**
     * @notice Emitted when the treasury address is updated by the contract owner.
     * @param oldTreasury The previous treasury address.
     * @param newTreasury The new treasury address.
     */
    event WaveFront__TreasurySet(address indexed oldTreasury, address indexed newTreasury);
    /**
     * @notice Emitted when the token factory address is updated by the contract owner.
     * @param oldTokenFactory The previous token factory address.
     * @param newTokenFactory The new token factory address.
     */
    event WaveFront__TokenFactorySet(address indexed oldTokenFactory, address indexed newTokenFactory);

    /**
     * @notice Sets the initial token factory address upon deployment.
     * @param _tokenFactory The address of the `ITokenFactory` implementation.
     */
    constructor(address _tokenFactory) ERC721("WaveFront", "WF") Ownable() {
        tokenFactory = _tokenFactory;
    }

    /**
     * @notice Creates a new WaveFront NFT and deploys the associated WaveFrontToken via the `tokenFactory`.
     * @dev Mints a new ERC-721 token, sets its URI, and calls the `tokenFactory` to deploy the ERC-20.
     * @param _name Name for the new WaveFrontToken (ERC-20).
     * @param _symbol Symbol for the new WaveFrontToken (ERC-20).
     * @param _uri URI for the new WaveFront NFT (ERC-721).
     * @param _owner The address to receive ownership of the new WaveFront NFT.
     * @param _quote The quote token address for the new WaveFrontToken's AMM.
     * @param _preTokenFactory The address of the factory for creating the PreToken.
     * @param _reserveVirtQuoteRaw The initial virtual quote reserve (raw, 18 decimals) for the AMM.
     * @return token The address of the newly deployed WaveFrontToken.
     * @return preToken The address of the newly deployed PreToken.
     * @return tokenId The ID of the newly minted WaveFront NFT.
     */
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
            _reserveVirtQuoteRaw
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

    /**
     * @notice Allows the owner of a WaveFront NFT to update its token URI.
     * @dev Reverts if the caller (`msg.sender`) is not the owner of the specified `tokenId`.
     * @param tokenId The ID of the NFT whose URI is being updated.
     * @param _uri The new URI string.
     */
    function setTokenURI(uint256 tokenId, string memory _uri) external {
        // Checks if the caller is the owner of the NFT.
        if (msg.sender != ownerOf(tokenId)) revert WaveFront__NotAuthorized();
        _setTokenURI(tokenId, _uri);
        emit WaveFront__TokenURISet(tokenId, _uri);
    }

    /**
     * @notice Updates the treasury address. Only callable by the contract owner.
     * @dev Emits a `WaveFront__TreasurySet` event.
     * @param _treasury The new address for the treasury.
     */
    function setTreasury(address _treasury) external onlyOwner {
        address oldTreasury = treasury;
        treasury = _treasury;
        emit WaveFront__TreasurySet(oldTreasury, _treasury);
    }

    /**
     * @notice Updates the token factory address. Only callable by the contract owner.
     * @dev Emits a `WaveFront__TokenFactorySet` event.
     * @param _tokenFactory The new address of the `ITokenFactory` implementation.
     */
    function setTokenFactory(address _tokenFactory) external onlyOwner {
        address oldTokenFactory = tokenFactory;
        tokenFactory = _tokenFactory;
        emit WaveFront__TokenFactorySet(oldTokenFactory, _tokenFactory);
    }

    /**
     * @notice Returns the base URI for token metadata. Returns empty string as URIs are set per token.
     * @dev Overrides ERC721's `_baseURI`. Individual token URIs are managed via `_setTokenURI`.
     * @return An empty string.
     * @inheritdoc ERC721
     */
    function _baseURI() internal view override returns (string memory) {
        return "";
    }

    /**
     * @dev Hook that is called before any token transfer.
     * @inheritdoc ERC721Enumerable
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    /**
     * @dev Hook that is called before a token is burned.
     * @inheritdoc ERC721URIStorage
     */
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    /**
     * @notice Indicates support for interfaces required by inherited contracts.
     * @dev See `ERC165Checker.supportsInterface`.
     * @inheritdoc ERC721Enumerable
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for a given token ID.
     * @dev See `ERC721URIStorage.tokenURI`.
     * @inheritdoc ERC721URIStorage
     */
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        // Throws if `tokenId` does not exist.
        return super.tokenURI(tokenId);
    }

}
