// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRewarder {
    function DURATION() external view returns (uint256);
    function left(address token) external view returns (uint256);
    function notifyRewardAmount(address token, uint256 amount) external;
}

contract Fees {
    using SafeERC20 for IERC20;

    address public immutable rewarder;
    address public immutable quote;
    address public immutable token;

    constructor(address _rewarder, address _token, address _quote) {
        rewarder = _rewarder;
        token = _token;
        quote = _quote;
    }

    function distribute() external {
        uint256 duration = IRewarder(rewarder).DURATION();

        uint256 balanceQuote = IERC20(quote).balanceOf(address(this));
        uint256 leftQuote = IRewarder(rewarder).left(quote);
        if (balanceQuote > leftQuote && balanceQuote > duration) {
            IERC20(quote).safeApprove(rewarder, 0);
            IERC20(quote).safeApprove(rewarder, balanceQuote);
            IRewarder(rewarder).notifyRewardAmount(quote, balanceQuote);
        }

        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        uint256 leftToken = IRewarder(rewarder).left(token);
        if (balanceToken > leftToken && balanceToken > duration) {
            IERC20(token).safeApprove(rewarder, 0);
            IERC20(token).safeApprove(rewarder, balanceToken);
            IRewarder(rewarder).notifyRewardAmount(token, balanceToken);
        }
    }

}


contract FeesFactory {

    address public lastFees;

    event FeesFactory__Created(address indexed fees);

    function create(address rewarder, address token, address quote) external returns (address fees) {
        fees = address(new Fees(rewarder, token, quote));
        lastFees = fees;
        emit FeesFactory__Created(fees);
    }

}