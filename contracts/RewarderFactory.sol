// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract Rewarder is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DURATION = 7 days;

    address public immutable content;

    mapping(address => Reward) public rewardData;
    mapping(address => bool) public isRewardToken;
    address[] public rewardTokens;

    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    struct Reward {
        uint256 periodFinish;
        uint256 rewardRate;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    error Rewarder__NotContent();
    error Rewarder__RewardSmallerThanDuration();
    error Rewarder__RewardSmallerThanLeft();
    error Rewarder__NotRewardToken();
    error Rewarder__RewardTokenAlreadyAdded();
    error Rewarder__InvalidZeroInput();

    event Rewarder__RewardAdded(address indexed rewardToken);
    event Rewarder__RewardNotified(address indexed rewardToken, uint256 reward);
    event Rewarder__Deposited(address indexed user, uint256 amount);
    event Rewarder__Withdrawn(address indexed user, uint256 amount);
    event Rewarder__RewardPaid(address indexed user, address indexed rewardsToken, uint256 reward);

    modifier updateReward(address account) {
        for (uint256 i; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            rewardData[token].rewardPerTokenStored = rewardPerToken(token);
            rewardData[token].lastUpdateTime = lastTimeRewardApplicable(token);
            if (account != address(0)) {
                rewards[account][token] = earned(account, token);
                userRewardPerTokenPaid[account][token] = rewardData[token]
                    .rewardPerTokenStored;
            }
        }
        _;
    }

    modifier onlyContent() {
        if (msg.sender != content) {
            revert Rewarder__NotContent();
        }
        _;
    }

    modifier nonZeroInput(uint256 _amount) {
        if (_amount == 0) revert Rewarder__InvalidZeroInput();
        _;
    }

    constructor(address _content) {
        content = _content;
    }

    function getReward(address account) 
        external 
        nonReentrant 
        updateReward(account) 
    {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address _rewardsToken = rewardTokens[i];
            uint256 reward = rewards[account][_rewardsToken];
            if (reward > 0) {
                rewards[account][_rewardsToken] = 0;
                emit Rewarder__RewardPaid(account, _rewardsToken, reward);

                IERC20(_rewardsToken).safeTransfer(account, reward);
            }
        }
    }

    function notifyRewardAmount(address _rewardsToken, uint256 reward) 
        external 
        nonReentrant
        updateReward(address(0))
    {
        if (reward < DURATION) revert Rewarder__RewardSmallerThanDuration();
        if (reward < left(_rewardsToken)) revert Rewarder__RewardSmallerThanLeft();
        if (!isRewardToken[_rewardsToken]) revert Rewarder__NotRewardToken();

        IERC20(_rewardsToken).safeTransferFrom(msg.sender, address(this), reward);
        if (block.timestamp >= rewardData[_rewardsToken].periodFinish) {
            rewardData[_rewardsToken].rewardRate = reward / DURATION;
        } else {
            uint256 remaining = rewardData[_rewardsToken].periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardData[_rewardsToken].rewardRate;
            rewardData[_rewardsToken].rewardRate = (reward + leftover) / DURATION;
        }
        rewardData[_rewardsToken].lastUpdateTime = block.timestamp;
        rewardData[_rewardsToken].periodFinish = block.timestamp + DURATION;
        emit Rewarder__RewardNotified(_rewardsToken, reward);
    }

    function deposit(address account, uint256 amount) 
        external 
        onlyContent
        nonZeroInput(amount)
        updateReward(account) 
    {
        _totalSupply = _totalSupply + amount;
        _balances[account] = _balances[account] + amount;
        emit Rewarder__Deposited(account, amount);
    }

    function withdraw(address account, uint256 amount) 
        external 
        onlyContent
        nonZeroInput(amount)
        updateReward(account) 
    {
        _totalSupply = _totalSupply - amount;
        _balances[account] = _balances[account] - amount;
        emit Rewarder__Withdrawn(account, amount);
    }

    function addReward(address _rewardsToken) 
        external 
        onlyContent
    {
        if (isRewardToken[_rewardsToken]) revert Rewarder__RewardTokenAlreadyAdded();
        isRewardToken[_rewardsToken] = true;
        rewardTokens.push(_rewardsToken);
        emit Rewarder__RewardAdded(_rewardsToken);
    }

    function left(address _rewardsToken) public view returns (uint256 leftover) {
        if (block.timestamp >= rewardData[_rewardsToken].periodFinish) return 0;
        uint256 remaining = rewardData[_rewardsToken].periodFinish - block.timestamp;
        return remaining * rewardData[_rewardsToken].rewardRate;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable(address _rewardsToken) public view returns (uint256) {
        return Math.min(block.timestamp, rewardData[_rewardsToken].periodFinish);
    }

    function rewardPerToken(address _rewardsToken) public view returns (uint256) {
        if (_totalSupply == 0) return rewardData[_rewardsToken].rewardPerTokenStored;
        return
            rewardData[_rewardsToken].rewardPerTokenStored + ((lastTimeRewardApplicable(_rewardsToken) - rewardData[_rewardsToken].lastUpdateTime) 
            * rewardData[_rewardsToken].rewardRate * 1e18 / _totalSupply);
    }

    function earned(address account, address _rewardsToken) public view returns (uint256) {
        return
            (_balances[account] * (rewardPerToken(_rewardsToken) - userRewardPerTokenPaid[account][_rewardsToken]) / 1e18) 
            + rewards[account][_rewardsToken];
    }

    function getRewardForDuration(address _rewardsToken) external view returns (uint256) {
        return rewardData[_rewardsToken].rewardRate * DURATION;
    }

    function getRewardTokens() external view returns (address[] memory) {
        return rewardTokens;
    }

}


contract RewarderFactory {

    address public lastRewarder;

    event RewarderFactory__RewarderCreated(address indexed rewarder);

    function createRewarder(address _content) external returns (address) {
        Rewarder rewarder = new Rewarder(_content);
        lastRewarder = address(rewarder);
        emit RewarderFactory__RewarderCreated(lastRewarder);
        return address(rewarder);
    }
    
}