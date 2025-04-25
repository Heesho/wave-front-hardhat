// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./Token.sol";

/**
 * @title TokenFactory
 * @notice Factory contract for deploying new WaveFrontToken (Token.sol) instances.
 * @dev This contract is responsible for creating instances of the main ERC-20 token contract (`Token.sol`).
 * @author heesho <https://github.com/heesho>
 */
contract TokenFactory {
    /**
     * @notice Address of the most recently deployed WaveFrontToken contract.
     * @dev Primarily for record-keeping or potentially off-chain tracking.
     */
    address public lastToken;

    /**
     * @notice Emitted when a new WaveFrontToken and its associated PreToken are created.
     * @param token The address of the newly deployed WaveFrontToken (Token.sol).
     * @param preToken The address of the PreToken associated with the new WaveFrontToken.
     */
    event TokenFactory__TokenCreated(address indexed token, address indexed preToken);

    /**
     * @notice Deploys a new WaveFrontToken contract (Token.sol).
     * @dev Called by the `WaveFront` contract's `create` function. Instantiates a `Token` contract with the provided parameters.
     * @param name The name for the new WaveFrontToken (ERC-20).
     * @param symbol The symbol for the new WaveFrontToken (ERC-20).
     * @param wavefront The address of the parent WaveFront (ERC-721) contract.
     * @param preTokenFactory The address of the factory used to create the PreToken.
     * @param quote The address of the quote token used for the AMM.
     * @param wavefrontId The unique ID of the WaveFront NFT representing this token launch.
     * @param reserveVirtQuoteRaw The initial virtual quote reserve amount (raw, 18 decimals).
     * @return token The address of the newly created WaveFrontToken (Token.sol).
     * @return preToken The address of the PreToken created alongside the WaveFrontToken.
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
        // Fetch the PreToken address directly from the newly created Token contract.
        preToken = Token(token).preToken();
        emit TokenFactory__TokenCreated(token, preToken);
    }
    
}
