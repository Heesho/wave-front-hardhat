// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

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

contract WaveFront is Ownable {

    uint256 public constant PRETOKEN_DURATION = 2 hours;

    uint256 public index;
    mapping(uint256 => address) public index_Token;
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
    event WaveFront__TreasurySet(address indexed oldTreasury, address indexed newTreasury);
    event WaveFront__TokenFactorySet(address indexed oldTokenFactory, address indexed newTokenFactory);

    constructor(address _tokenFactory) Ownable() {
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
        returns (address token, address preToken)
    {
        index++;


        (token, preToken) = ITokenFactory(tokenFactory).createToken(
            _name,
            _symbol,
            address(this),
            _preTokenFactory,
            _quote,
            index,
            _reserveVirtQuoteRaw,
            PRETOKEN_DURATION
        );

        index_Token[index] = token;
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

}
