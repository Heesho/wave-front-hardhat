// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface IRewarder {

}

contract Community is ERC721, ERC721Enumerable, ERC721URIStorage {
    using Math for uint256;

    uint256 public nextTokenId;
    uint256 public initialPrice = 1 ether;

    mapping(uint256 => uint256) public id_Price;
    mapping(uint256 => address) public id_Creator;

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        nextTokenId = 1;
        id_Price[1] = initialPrice;
    }

    function mint(address creator) external payable {
        uint256 price = id_Price[nextTokenId];
        if (msg.value < price) revert Community__InsufficientPayment();
    }

}
