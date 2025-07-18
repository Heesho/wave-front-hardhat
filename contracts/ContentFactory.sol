// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IRewarderFactory {
    function create(address _content) external returns (address);
}

interface IRewarder {
    function DURATION() external view returns (uint256);
    function left(address token) external view returns (uint256);
    function notifyRewardAmount(address token, uint256 amount) external;
    function deposit(address account, uint256 amount) external;
    function withdraw(address account, uint256 amount) external;
    function addReward(address token) external;
}

interface IToken {
    function heal(uint256 amount) external;
}

contract Content is ERC721, ERC721Enumerable, ERC721URIStorage, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    address public immutable rewarder;
    address public immutable token;
    address public immutable quote;

    uint256 public nextTokenId;
    uint256 public initialPrice = 1e6;

    mapping(uint256 => uint256) public id_Price;
    mapping(uint256 => address) public id_Creator;

    error Content__InvalidAccount();
    error Content__InvalidPayment();
    error Content__InvalidTokenId();
    error Content__TransferDisabled();

    event Content__Created(address indexed account, uint256 indexed tokenId, string uri);
    event Content__Curated(address indexed account, uint256 indexed tokenId, uint256 price);

    constructor(string memory _name, string memory _symbol, address _token, address _quote, address rewarderFactory) ERC721(_name, _symbol) {
        token = _token;
        quote = _quote;
        rewarder = IRewarderFactory(rewarderFactory).create(address(this));
        IRewarder(rewarder).addReward(quote);
        IRewarder(rewarder).addReward(token);
    }

    function create(address account, string memory _uri) external nonReentrant returns (uint256 tokenId) {
        if (account == address(0)) revert Content__InvalidAccount();

        tokenId = ++nextTokenId;
        id_Price[tokenId] = initialPrice;
        id_Creator[tokenId] = account;

        _safeMint(account, tokenId);
        _setTokenURI(tokenId, _uri);

        IERC20(quote).safeTransferFrom(msg.sender, address(this), initialPrice);
        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, initialPrice);
        IToken(token).heal(initialPrice);
        IRewarder(rewarder).deposit(account, initialPrice);

        emit Content__Created(account, tokenId, _uri);
    }

    function curate(address account, uint256 tokenId) external nonReentrant {
        if (account == address(0)) revert Content__InvalidAccount();
        if (ownerOf(tokenId) == address(0)) revert Content__InvalidTokenId();

        address creator = id_Creator[tokenId];
        uint256 prevPrice = id_Price[tokenId];
        address prevOwner = ownerOf(tokenId);
        uint256 nextPrice = getNextPrice(tokenId);
        uint256 surplus = nextPrice - prevPrice;

        id_Price[tokenId] = nextPrice;
        _transfer(prevOwner, account, tokenId);


        IERC20(quote).safeTransferFrom(msg.sender, address(this), nextPrice);

        IERC20(quote).safeTransfer(prevOwner, prevPrice + (surplus * 3 / 9));
        IERC20(quote).safeTransfer(creator, surplus * 3 / 9);

        IERC20(quote).safeApprove(token, 0);
        IERC20(quote).safeApprove(token, surplus * 3 / 9);
        IToken(token).heal(surplus * 3 / 9);

        IRewarder(rewarder).withdraw(prevOwner, prevPrice);
        IRewarder(rewarder).deposit(account, nextPrice);

        emit Content__Curated(account, tokenId, nextPrice);
    }

    function distribute() external {
        uint256 duration = IRewarder(rewarder).DURATION();

        uint256 balanceQuote = IERC20(quote).balanceOf(address(this));
        uint256 leftQuote = IRewarder(rewarder).left(quote);
        if (balanceQuote > leftQuote && balanceQuote > duration) {
            IERC20(quote).safeApprove(rewarder, 0);
            IERC20(quote).safeApprove(rewarder, balanceQuote);
            IRewarder(rewarder).notifyRewardAmount(quote, balanceQuote);
        }

        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        uint256 leftToken = IRewarder(rewarder).left(token);
        if (balanceToken > leftToken && balanceToken > duration) {
            IERC20(token).safeApprove(rewarder, 0);
            IERC20(token).safeApprove(rewarder, balanceToken);
            IRewarder(rewarder).notifyRewardAmount(token, balanceToken);
        }
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


contract ContentFactory {

    address public lastContent;

    event ContentFactory__Created(address indexed content);

    function create(string memory name, string memory symbol, address token, address quote, address rewarderFactory) external returns (address, address) {
        Content content = new Content(name, symbol, token, quote, rewarderFactory);
        lastContent = address(content);
        emit ContentFactory__Created(lastContent);
        return (address(content), content.rewarder());
    }

}