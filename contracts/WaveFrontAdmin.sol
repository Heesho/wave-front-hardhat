// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract WaveFrontAdmin is Ownable {

    event WaveFrontAdmin__PointsAdded(address indexed account, uint256 amount);

    function addPoints(address[] calldata account, uint256[] calldata amount) external onlyOwner {
        require(account.length == amount.length, "WaveFrontAdmin: account and amount length mismatch");
        for (uint256 i = 0; i < account.length; i++) {
            emit WaveFrontAdmin__PointsAdded(account[i], amount[i]);
        }
    }
    
}