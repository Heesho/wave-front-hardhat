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
    event WaveFrontTreasury__Withdraw(address indexed treasury, uint256 amount);
    event WaveFrontTreasury__Borrowed(address indexed meme, uint256 amount);
    event WaveFrontTreasury__SetTreasury(address indexed oldTreasury, address indexed newTreasury);

    constructor(address _base, address _treasury) {
        base = _base;
        treasury = _treasury;
    }

    function withdraw() external {
        uint256 balance = IERC20(base).balanceOf(address(this));
        emit WaveFrontTreasury__Withdraw(treasury, balance);
        IERC20(base).transfer(treasury, balance);
    }

    function borrow(address[] calldata memes) external {
        for (uint256 i = 0; i < memes.length; i++) {
            uint256 credit = IMeme(memes[i]).getAccountCredit(address(this));
            if (credit > 0) {
                IMeme(memes[i]).borrow(credit);
                emit WaveFrontTreasury__Borrowed(memes[i], credit);
            }
        }
    }

    function setTreasury(address newTreasury) external onlyOwner {
        emit WaveFrontTreasury__SetTreasury(treasury, newTreasury);
        treasury = newTreasury;
    }
    
}