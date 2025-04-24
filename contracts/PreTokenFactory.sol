// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./PreToken.sol"; // The PreToken contract to be deployed

/**
 * @title PreTokenFactory
 * @notice A factory contract responsible for deploying instances of the PreToken contract.
 */
contract PreTokenFactory {
    address public lastPreToken;

    event PreTokenFactory__PreTokenCreated(address indexed preToken);

    /**
     * @notice Deploys a new instance of the PreToken contract.
     * @param token The address of the Token contract being launched.
     * @param quote The address of the quote token used for contributions in the PreToken phase.
     * @return preToken Address of the newly deployed PreToken contract.
     */
    function createPreToken(
        address token, 
        address quote
    ) external returns (address preToken) {
        preToken = address(new PreToken(token, quote));
        lastPreToken = preToken;
        emit PreTokenFactory__PreTokenCreated(preToken);
    }
}