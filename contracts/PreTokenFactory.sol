// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./PreToken.sol"; // The PreToken contract to be deployed

/**
 * @title PreTokenFactory
 * @notice A factory contract responsible for deploying instances of the PreToken contract.
 */
contract PreTokenFactory {

    /**
     * @notice Deploys a new instance of the PreToken contract.
     * @param tokenToLaunch The address of the Token contract being launched.
     * @param quoteToken The address of the quote token used for contributions in the PreToken phase.
     * @return preToken Address of the newly deployed PreToken contract.
     */
    function createPreToken(
        address tokenToLaunch, 
        address quoteToken
    ) external returns (address preToken) {
        preToken = address(new PreToken(tokenToLaunch, quoteToken));
    }
}