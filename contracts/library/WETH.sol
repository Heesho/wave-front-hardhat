// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETH is ERC20 {
    constructor() ERC20("WETH", "WETH") {}

    // Deposit ETH and mint WETH
    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    // Withdraw ETH and burn WETH
    function withdraw(uint amount) public {
        require(balanceOf(msg.sender) >= amount, "WETH: Insufficient balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }

    // Receive function to accept ETH
    receive() external payable {
        deposit();
    }
}
