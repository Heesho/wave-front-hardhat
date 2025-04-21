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
        uint256 reserveVirtQuote
    ) external returns (address token);
}

/**
 * @title WaveFront
 * @author heesho
 * @notice An ERC721 contract that acts as a factory for Token instances via a TokenFactory.
 * Each Token is linked to a unique WaveFront NFT (ERC721 token).
 * The owner of the NFT receives creator fees from the associated Token.
 * Manages a central treasury address for protocol fees.
 */
contract WaveFront is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {

    /*----------  STATE VARIABLES  --------------------------------------*/

    /// @notice Counter for assigning unique token IDs to WaveFront NFTs.
    uint256 public currentTokenId;
    /// @notice Mapping from WaveFront NFT token ID to the deployed Token contract address.
    mapping(uint256 => address) public tokenId_WaveFrontToken;
    /// @notice Address of the factory contract responsible for deploying Token instances.
    address public tokenFactory;
    /// @notice Address designated to receive treasury fees from all Tokens. Settable by the contract owner.
    address public treasury;

    /*----------  ERRORS ------------------------------------------------*/

    /// @notice Raised when an action is attempted by an account other than the NFT owner (e.g., setting token URI).
    error WaveFront__NotAuthorized();

    /*----------  EVENTS ------------------------------------------------*/

    /// @notice Emitted when a new Token is created and its corresponding NFT is minted.
    event WaveFront__Created(uint256 indexed tokenId, address indexed token, address indexed owner);
    /// @notice Emitted when the treasury address is updated by the contract owner.
    event WaveFront__TreasurySet(address indexed oldTreasury, address indexed newTreasury);

    /*----------  FUNCTIONS  --------------------------------------------*/

    /**
     * @notice Initializes the WaveFront NFT contract.
     */
    constructor() ERC721("WaveFront", "WF") Ownable() {}

    /**
     * @notice Creates a new Token instance via the TokenFactory and mints a corresponding WaveFront NFT.
     * Deploys a new Token contract with the specified parameters by calling the tokenFactory.
     * Mints an NFT representing ownership/creation rights over the token.
     * @param _name Name for the new Token (ERC20).
     * @param _symbol Symbol for the new Token (ERC20).
     * @param _uri URI for the WaveFront NFT metadata.
     * @param _owner Address designated as the owner of the NFT and recipient of creator fees.
     * @param _quote Address of the quote token for the new Token.
     * @param _preTokenFactory Address of the factory contract responsible for deploying pre-token contracts.
     * @param _reserveVirtQuote Initial virtual quote reserve for the new Token.
     * @return token Address of the newly deployed Token contract.
     */
    function create(
        string memory _name, 
        string memory _symbol, 
        string memory _uri, 
        address _owner,
        address _quote,
        address _preTokenFactory,
        uint256 _reserveVirtQuote
    ) 
        external // Consider making this onlyOwner or adding other access controls if needed
        returns (address token) 
    {
        uint256 tokenId = ++currentTokenId;
        // Mint the NFT to the designated owner.
        _safeMint(_owner, tokenId); 
        // Set the metadata URI for the NFT.
        _setTokenURI(tokenId, _uri); 

        // Deploy the Token via the factory, passing necessary parameters including the NFT tokenId.
        token = ITokenFactory(tokenFactory).createToken(
            _name,
            _symbol,
            address(this),
            _preTokenFactory,
            _quote,
            tokenId,
            _reserveVirtQuote
        );
        
        // Link the NFT tokenId to the deployed token address.
        tokenId_WaveFrontToken[tokenId] = token; 
        emit WaveFront__Created(tokenId, token, _owner);
    }

    /**
     * @notice Allows the owner of a WaveFront NFT to update its metadata URI.
     * @param tokenId The ID of the NFT whose URI is to be updated.
     * @param _uri The new metadata URI string.
     */
    function setTokenURI(uint256 tokenId, string memory _uri) external {
        // Only the current owner of the specific NFT can change its URI.
        if (msg.sender != ownerOf(tokenId)) revert WaveFront__NotAuthorized(); 
        _setTokenURI(tokenId, _uri);
        // Note: No specific event for URI update in this override, relies on ERC721URIStorage event.
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @notice Updates the central treasury address.
     * Only callable by the owner of the WaveFront factory contract.
     * @param _treasury The new address for the treasury.
     */
    function setTreasury(address _treasury) external onlyOwner {
        address oldTreasury = treasury;
        treasury = _treasury;
        emit WaveFront__TreasurySet(oldTreasury, _treasury);
    }

    /*----------  OVERRIDE FUNCTIONS  ------------------------------------*/

    /**
     * @dev Returns the base URI for token metadata. Can be overridden if a base URI pattern is used.
     */
    function _baseURI() internal view override returns (string memory) {
        return ""; // Return empty string as URIs seem to be set individually.
    }

    /**
     * @dev Hook called before any NFT transfer. Combined override for ERC721 and ERC721Enumerable.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
        // Add custom logic here if needed before an NFT transfer.
    }

    /**
     * @dev Hook called before burning an NFT. Combined override for ERC721 and ERC721URIStorage.
     */
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        // Unlink the NFT from its associated Token address upon burning.
        delete tokenId_WaveFrontToken[tokenId]; 
    }

    /**
     * @dev See {IERC165-supportsInterface}. Combined override for ERC721, ERC721Enumerable, and ERC721URIStorage.
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    /**
     * @dev See {IERC721Metadata-tokenURI}. Combined override for ERC721 and ERC721URIStorage.
     */
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        // Reverts if tokenId does not exist (handled by super call).
        return super.tokenURI(tokenId);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    // No specific view functions added in this contract beyond inherited ones and state variables.

}
