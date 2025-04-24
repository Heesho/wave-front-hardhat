// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./Token.sol"; // The Token contract to be deployed

/**
 * @title TokenFactory
 * @notice A factory contract responsible for deploying instances of the Token contract.
 */
contract TokenFactory {
    address public lastToken;

    event TokenFactory__TokenCreated(address indexed token, address indexed preToken);

    /**
     * @notice Deploys a new instance of the Token contract.
     * @param name Name for the new Token (ERC20).
     * @param symbol Symbol for the new Token (ERC20).
     * @param wavefront Address of the parent WaveFront contract.
     * @param preTokenFactory Address of the factory for deploying associated PreToken contracts.
     * @param quote Address of the quote token for the new Token.
     * @param wavefrontId The ID of the WaveFront NFT associated with this Token.
     * @param reserveVirtQuoteRaw Initial virtual quote reserve for the new Token's bonding curve.
     * @return token Address of the newly deployed Token contract.
     * @return preToken Address of the newly deployed PreToken contract.
     */
    function createToken(
        string memory name,
        string memory symbol,
        address wavefront,
        address preTokenFactory,
        address quote,
        uint256 wavefrontId,
        uint256 reserveVirtQuoteRaw
    ) external returns (address token, address preToken) {
        token = address(new Token(
            name,
            symbol,
            wavefront,
            preTokenFactory,
            quote,
            wavefrontId,
            reserveVirtQuoteRaw
        ));
        lastToken = token;
        preToken = Token(token).preToken();
        emit TokenFactory__TokenCreated(token, preToken);
    }
}
