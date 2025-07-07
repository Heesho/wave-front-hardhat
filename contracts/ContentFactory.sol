// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IRewarderFactory {
    function createRewarder(address _content) external returns (address);
}

interface IRewarder {
    function deposit(address account, uint256 amount) external;
    function withdraw(address account, uint256 amount) external;
}

contract Content is ERC721, ERC721Enumerable, ERC721URIStorage {
    using Math for uint256;

    address public immutable rewarder;

    uint256 public nextTokenId;
    uint256 public initialPrice = 1 ether;

    mapping(uint256 => uint256) public id_Price;
    mapping(uint256 => address) public id_Creator;

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        rewarder = IRewarderFactory(msg.sender).createRewarder(address(this));
    }

    function mint(address account, string memory _uri) external payable {
        if (account == address(0)) revert Content__InvalidAccount();
        if (msg.value != initialPrice) revert Content__InvalidPayment();

        uint256 tokenId = nextTokenId++;
        id_Price[tokenId] = initialPrice;
        id_Creator[tokenId] = account;

        _safeMint(account, tokenId);
        _setTokenURI(tokenId, _uri);

        IRewarder(rewarder).deposit(account, initialPrice);

        emit Content__Minted(account, tokenId, _uri);
    }

    function steal(address account, uint256 tokenId) external payable {
        if (account == address(0)) revert Content__InvalidAccount();
        if (ownerOf(tokenId) == address(0)) revert Content__InvalidTokenId();

        uint256 prevPrice = id_Price[tokenId];
        address prevOwner = ownerOf(tokenId);
        uint256 nextPrice = getNextPrice(tokenId);
        uint256 surplus = nextPrice - prevPrice;

        if (msg.value != nextPrice) revert Content__InvalidPayment();

        id_Price[tokenId] = nextPrice;
        _transfer(prevOwner, account, tokenId);

        // distribute 4 / 10 surplus to prevOwner
        // distribute 4 / 10 surplus to bonding curve
        // distribute 2 / 10 surplus to creator

        IRewarder(rewarder).withdraw(prevOwner, prevPrice);
        IRewarder(rewarder).deposit(account, nextPrice);

        emit Content__Stolen(account, tokenId, nextPrice);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function _beforeTokenTransfer(
        address from, 
        address to, 
        uint256 firsTokenId, 
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firsTokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function getNextPrice(uint256 tokenId) public view returns (uint256) {
        return id_Price[tokenId] * 11 / 10;
    }

}
