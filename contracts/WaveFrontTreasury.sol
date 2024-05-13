// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMeme {
    function getAccountCredit(address account) external view returns (uint256);
    function claimFees(address account) external;
    function borrow(uint256 amountBase) external;
}

contract WaveFrontTreasury is Ownable {

    address public immutable base;
    address public treasury;

    event WaveFrontTreasury__ClaimFees(address indexed meme, address indexed account);

    constructor(address _base, address _treasury) {
        base = _base;
        treasury = _treasury;
    }

    function withdraw() external {
        IERC20(base).transfer(treasury, IERC20(base).balanceOf(address(this)));
    }

    function borrow(address[] calldata memes) external {
        for (uint256 i = 0; i < memes.length; i++) {
            IMeme(memes[i]).borrow(IMeme(memes[i]).getAccountCredit(address(this)));
        }
    }

    function claimFees(address[] calldata memes) external {
        for (uint256 i = 0; i < memes.length; i++) {
            IMeme(memes[i]).claimFees(address(this));
            emit WaveFrontTreasury__ClaimFees(memes[i], address(this));
        }
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
    
}