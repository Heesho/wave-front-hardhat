// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./PreToken.sol";

contract PreTokenFactory {
    address public lastPreToken;

    event PreTokenFactory__PreTokenCreated(address indexed preToken);

    function createPreToken(
        address token, 
        address quote
    ) external returns (address preToken) {
        preToken = address(new PreToken(token, quote));
        lastPreToken = preToken;
        emit PreTokenFactory__PreTokenCreated(preToken);
    }
}