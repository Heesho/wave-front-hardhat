// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./PreToken.sol";

/**
 * @title PreTokenFactory
 * @notice Factory contract for deploying new PreToken instances.
 * @dev Responsible for creating `PreToken` contracts, which handle the initial distribution/sale phase for a WaveFrontToken.
 * @author heesho <https://github.com/heesho>
 */
contract PreTokenFactory {
    /**
     * @notice Address of the most recently deployed PreToken contract.
     * @dev Useful for tracking or off-chain verification.
     */
    address public lastPreToken;

    /**
     * @notice Emitted when a new PreToken contract is successfully deployed.
     * @param preToken The address of the newly created PreToken instance.
     */
    event PreTokenFactory__PreTokenCreated(address indexed preToken);

    /**
     * @notice Deploys a new PreToken contract instance.
     * @dev Called by the main `Token` contract's constructor during its deployment process.
     * @param token The address of the main WaveFrontToken (Token.sol) this PreToken will manage.
     * @param quote The address of the quote token used for the initial sale/distribution.
     * @return preToken The address of the newly deployed PreToken contract.
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