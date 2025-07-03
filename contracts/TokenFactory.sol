// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./Token.sol";

contract TokenFactory {
    address public lastToken;

    event TokenFactory__TokenCreated(address indexed token, address indexed preToken);

    function createToken(
        string memory name,
        string memory symbol,
        address wavefront,
        address preTokenFactory,
        address quote,
        uint256 wavefrontId,
        uint256 reserveVirtQuoteRaw,
        uint256 preTokenDuration
    ) external returns (address token, address preToken) {
        token = address(new Token(
            name,
            symbol,
            wavefront,
            preTokenFactory,
            quote,
            wavefrontId,
            reserveVirtQuoteRaw,
            preTokenDuration
        ));
        lastToken = token;
        preToken = Token(token).preToken();
        emit TokenFactory__TokenCreated(token, preToken);
    }
    
}
