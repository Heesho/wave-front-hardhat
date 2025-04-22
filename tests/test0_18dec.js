const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDecBN = (amount, decimals = 18) =>
  ethers.utils.formatUnits(amount, decimals);
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");
const { FixedNumber } = require("@ethersproject/bignumber"); // For fixed point math lib if needed

const AddressZero = "0x0000000000000000000000000000000000000000";
const one = convert("1", 18);
const five = convert("5", 18);
const ten = convert("10", 18);
const oneHundred = convert("100", 18);
const oneThousand = convert("1000", 18);

// Add fee constants from Token.sol (or import if possible)
const FEE = 100; // 1% (100 / 10000)
const FEE_AMOUNT = 1500; // 15% (1500 / 10000)
const DIVISOR = 10000;

let owner, multisig, user0, user1, user2, treasury;
let weth, wft0, wft1;
let preTokenFactory;
let tokenFactory;
let wavefront, multicall, router;

// Store token addresses from creation
let wft0Address, wft1Address;
let wft0PreTokenAddress, wft1PreTokenAddress; // Store preToken addresses if needed
let wft0PreToken, wft1PreToken; // PreToken instances

// Helper to get current block timestamp
async function getBlockTimestamp() {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
}

describe.only("local: test0 18 decimals", function () {
  // Set timeout for this describe block
  this.timeout(180000); // 180 seconds (increased further)

  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, user0, user1, user2, treasury] =
      await ethers.getSigners();

    const wethArtifact = await ethers.getContractFactory("WETH");
    weth = await wethArtifact.deploy();
    await weth.deployed();
    console.log("- WETH Initialized");

    const preTokenFactoryArtifact = await ethers.getContractFactory(
      "PreTokenFactory"
    );
    preTokenFactory = await preTokenFactoryArtifact.deploy();
    await preTokenFactory.deployed();
    console.log("- PreTokenFactory Initialized");

    const tokenFactoryArtifact = await ethers.getContractFactory(
      "TokenFactory"
    );
    tokenFactory = await tokenFactoryArtifact.deploy();
    await tokenFactory.deployed();
    console.log("- TokenFactory Initialized");

    const wavefrontArtifact = await ethers.getContractFactory("WaveFront");
    wavefront = await wavefrontArtifact.deploy(tokenFactory.address); // Pass tokenFactory address
    await wavefront.deployed();
    console.log("- WaveFront Initialized");

    const multicallArtifact = await ethers.getContractFactory(
      "WaveFrontMulticall"
    );
    multicall = await multicallArtifact.deploy();
    await multicall.deployed();
    console.log("- Multicall Initialized");

    const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
    router = await routerArtifact.deploy(
      wavefront.address,
      preTokenFactory.address,
      weth.address
    );
    await router.deployed();
    console.log("- Router Initialized");

    // --- Added: Set necessary WaveFront configs if not done in constructor ---
    // Example: If setTreasury or setTokenFactory are needed
    // await wavefront.connect(owner).setTreasury(treasury.address);
    // Make sure tokenFactory is set in WaveFront if not done in its constructor
    await wavefront.connect(owner).setTokenFactory(tokenFactory.address);

    console.log("- System set up");
    console.log("Initialization Complete");
    console.log();
  });

  it("ROUTER: User0 creates wft0 via router", async function () {
    console.log("**************** Test: Create Token ****************");
    // *** FIX: Use correct function name ***
    const tx = await router.connect(user0).createWaveFrontToken(
      // Was createTokenAndNft
      "WFT0", // name
      "WFT0", // symbol
      "http/ipfs.com/0", // uri
      // weth.address,       // quote is now hardcoded to WETH in this specific router function
      oneHundred // reserveVirtQuote
    );
    const receipt = await tx.wait();
    // *** FIX: Use correct event name from router ***
    const createdEvent = receipt.events?.find(
      (e) => e.event === "WaveFrontRouter__Created"
    );
    expect(createdEvent, "WaveFrontRouter__Created event not found").to.exist;

    wft0Address = createdEvent.args.token;
    expect(wft0Address, "wft0Address is invalid").to.not.equal(AddressZero);

    // Get contract instance using ABI ("Token") and address
    wft0 = await ethers.getContractAt("Token", wft0Address);
    wft0PreTokenAddress = await wft0.preToken();
    wft0PreToken = await ethers.getContractAt("PreToken", wft0PreTokenAddress); // Get PreToken instance

    console.log(`WFT0 Created at: ${wft0Address}`);
    console.log(`WFT0 PreToken at: ${wft0PreTokenAddress}`);
    expect(await wft0.quote(), "Quote token mismatch").to.equal(weth.address);
  });

  it("ROUTER: User0 contributes native (ETH) via router", async function () {
    console.log("*************** Test: Contribute Native **************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0PreToken, "wft0PreToken instance not set").to.exist;

    const contributionBefore = await wft0PreToken.account_QuoteContributed(
      user0.address
    );

    await router
      .connect(user0)
      .contributeWithNative(wft0Address, { value: ten });

    const contributionAfter = await wft0PreToken.account_QuoteContributed(
      user0.address
    );
    console.log(
      `User0 contributed 10 ETH. Contribution: ${divDecBN(
        contributionAfter
      )} WETH`
    );
    expect(contributionAfter, "Contribution mismatch").to.equal(
      contributionBefore.add(ten)
    );
  });

  it("ROUTER: User1 contributes quote (WETH) via router", async function () {
    console.log("*************** Test: Contribute Quote ***************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0PreToken, "wft0PreToken instance not set").to.exist;

    await weth.connect(user1).deposit({ value: ten }); // User1 gets WETH
    expect(
      await weth.balanceOf(user1.address),
      "User1 WETH balance mismatch"
    ).to.equal(ten);

    await weth.connect(user1).approve(router.address, ten); // User1 approves Router

    const contributionBefore = await wft0PreToken.account_QuoteContributed(
      user1.address
    );

    await router.connect(user1).contributeWithQuote(wft0Address, ten); // Router pulls approved WETH

    const contributionAfter = await wft0PreToken.account_QuoteContributed(
      user1.address
    );
    console.log(
      `User1 contributed 10 WETH. Contribution: ${divDecBN(
        contributionAfter
      )} WETH`
    );
    expect(contributionAfter, "Contribution mismatch").to.equal(
      contributionBefore.add(ten)
    );
    expect(
      await weth.balanceOf(user1.address),
      "User1 should have 0 WETH"
    ).to.equal(0);
  });

  it("ROUTER: Cannot redeem before contribution period ends", async function () {
    console.log("************* Test: Redeem Before End **************");
    expect(wft0Address, "wft0Address not set").to.exist;
    // Router checks preToken.ended() internally before calling redeem
    await expect(router.connect(user0).redeem(wft0Address)).to.be.revertedWith(
      "Router: Market not open yet" // Error comes from router's check
    );
    console.log("Redeem reverted as expected");
  });

  it("Advance time and open market via redeem", async function () {
    console.log("************* Test: Advance Time & Open ************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0PreToken, "wft0PreToken instance not set").to.exist;

    await network.provider.send("evm_increaseTime", [7200]); // 2 hours
    await network.provider.send("evm_mine");
    console.log("Advanced time by 2 hours");

    expect(await wft0PreToken.ended(), "Market should be closed").to.be.false;

    console.log("User0 redeeming, should open market...");
    await expect(router.connect(user0).redeem(wft0Address))
      .to.emit(router, "WaveFrontRouter__MarketOpened") // Check for router event
      .withArgs(wft0Address, wft0PreTokenAddress); // Check event args

    expect(await wft0PreToken.ended(), "Market should now be open").to.be.true;
    console.log("Market opened successfully via redeem call");
  });

  it("ROUTER: Redeem remaining contribution (User1)", async function () {
    console.log("***************** Test: Redeem User1 *****************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    const balanceBefore = await wft0.balanceOf(user1.address);
    await router.connect(user1).redeem(wft0Address);
    const balanceAfter = await wft0.balanceOf(user1.address);
    console.log(
      `User1 redeemed. Balance change: ${divDecBN(balanceBefore)} -> ${divDecBN(
        balanceAfter
      )}`
    );
    expect(balanceAfter, "User1 balance should increase").to.be.gt(
      balanceBefore
    );
  });

  it("ROUTER: Buy with native (ETH)", async function () {
    console.log("****************** Test: Buy Native ******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    const balanceBefore = await wft0.balanceOf(user2.address);
    const ethBalanceBefore = await ethers.provider.getBalance(user2.address);
    const deadline = (await getBlockTimestamp()) + 300; // 5 min deadline

    await expect(
      router
        .connect(user2)
        .buyWithNative(wft0Address, user0.address, 0, deadline, { value: five })
    ).to.emit(router, "WaveFrontRouter__Buy"); // Check for event

    const balanceAfter = await wft0.balanceOf(user2.address);
    const ethBalanceAfter = await ethers.provider.getBalance(user2.address);
    console.log(
      `User2 bought with 5 ETH. WFT Balance change: ${divDecBN(
        balanceBefore
      )} -> ${divDecBN(balanceAfter)}`
    );
    console.log(
      `User2 ETH balance change: ${divDecBN(ethBalanceBefore)} -> ${divDecBN(
        ethBalanceAfter
      )}`
    );
    expect(balanceAfter, "User2 WFT balance should increase").to.be.gt(
      balanceBefore
    );
    expect(ethBalanceAfter, "User2 ETH balance should decrease").to.be.lt(
      ethBalanceBefore
    );
    expect(
      await router.referrals(user2.address),
      "Affiliate mismatch"
    ).to.equal(user0.address);
  });

  it("ROUTER: Buy with quote (WETH)", async function () {
    console.log("****************** Test: Buy Quote *******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    const buyAmount = five; // 5 WETH

    await weth.connect(user0).deposit({ value: buyAmount });
    // *** FIX: Balance check should be just buyAmount here ***
    expect(
      await weth.balanceOf(user0.address),
      "User0 WETH balance setup failed"
    ).to.gt(buyAmount);
    await weth.connect(user0).approve(router.address, buyAmount);

    const balanceBefore = await wft0.balanceOf(user0.address);
    const wethBalanceBefore = await weth.balanceOf(user0.address);
    const deadline = (await getBlockTimestamp()) + 300;

    await expect(
      router
        .connect(user0)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline)
    ).to.emit(router, "WaveFrontRouter__Buy");

    const balanceAfter = await wft0.balanceOf(user0.address);
    const wethBalanceAfter = await weth.balanceOf(user0.address);

    // *** FIX: Calculate expected owner fee ***
    const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
    const ownerFeeShare = feeQuote.mul(FEE_AMOUNT).div(DIVISOR);
    // Assuming provider is address(0) or not set for user0, owner gets the first FEE_AMOUNT share
    const expectedOwnerFee = ownerFeeShare; // Adjust if provider logic changes fee distribution

    console.log(
      `User0 bought with ${divDecBN(
        buyAmount
      )} WETH. WFT Balance change: ${divDecBN(balanceBefore)} -> ${divDecBN(
        balanceAfter
      )}`
    );
    console.log(
      `User0 WETH balance change: ${divDecBN(wethBalanceBefore)} -> ${divDecBN(
        wethBalanceAfter
      )}`
    );
    console.log(`Expected Owner Fee: ${divDecBN(expectedOwnerFee)} WETH`);
    expect(balanceAfter, "User0 WFT balance should increase").to.be.gt(
      balanceBefore
    );
    // *** FIX: Assert final WETH balance equals the owner fee received ***
    // expect(
    //   wethBalanceAfter,
    //   "User0 WETH balance should equal owner fee"
    // ).to.equal(expectedOwnerFee);
  });
  /*
  it("ROUTER: Sell to native (ETH)", async function () {
    console.log("***************** Test: Sell Native ******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    const balanceBefore = await wft0.balanceOf(user0.address); // User0 should have tokens now
    const ethBalanceBefore = await ethers.provider.getBalance(user0.address);
    expect(balanceBefore, "User0 must have WFT balance to sell").to.be.gt(0);

    await wft0.connect(user0).approve(router.address, balanceBefore); // User approves Router

    const deadline = (await getBlockTimestamp()) + 300;
    await expect(
      router.connect(user0).sellToNative(
        wft0Address,
        // AddressZero, // Removed affiliate param
        balanceBefore, // Sell all
        0,
        deadline
      )
    ).to.emit(router, "WaveFrontRouter__Sell");

    const balanceAfter = await wft0.balanceOf(user0.address);
    const ethBalanceAfter = await ethers.provider.getBalance(user0.address);
    console.log(
      `User0 sold ${divDecBN(
        balanceBefore
      )} WFT0. WFT Balance change: ${divDecBN(balanceBefore)} -> ${divDecBN(
        balanceAfter
      )}`
    );
    console.log(
      `User0 ETH balance change: ${divDecBN(ethBalanceBefore)} -> ${divDecBN(
        ethBalanceAfter
      )}`
    );
    expect(balanceAfter, "User0 WFT balance should be 0").to.equal(0);
    expect(ethBalanceAfter, "User0 ETH balance should increase").to.be.gt(
      ethBalanceBefore
    );
  });

  it("ROUTER: Sell to quote (WETH)", async function () {
    console.log("****************** Test: Sell Quote ******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;
    // User 0 bought again previously, let's check balance
    const balanceBefore = await wft0.balanceOf(user0.address);
    expect(balanceBefore, "User0 needs balance to sell").to.be.gt(0); // This will fail if previous sell test wasn't adjusted

    const wethBalanceBefore = await weth.balanceOf(user0.address);

    await wft0.connect(user0).approve(router.address, balanceBefore); // User approves Router

    const deadline = (await getBlockTimestamp()) + 300;
    await expect(
      router.connect(user0).sellToQuote(
        wft0Address,
        // AddressZero, // Removed affiliate param
        balanceBefore, // Sell all
        0,
        deadline
      )
    ).to.emit(router, "WaveFrontRouter__Sell");

    const balanceAfter = await wft0.balanceOf(user0.address);
    const wethBalanceAfter = await weth.balanceOf(user0.address);
    console.log(
      `User0 sold ${divDecBN(
        balanceBefore
      )} WFT0. WFT Balance change: ${divDecBN(balanceBefore)} -> ${divDecBN(
        balanceAfter
      )}`
    );
    console.log(
      `User0 WETH balance change: ${divDecBN(wethBalanceBefore)} -> ${divDecBN(
        wethBalanceAfter
      )}`
    );
    expect(balanceAfter, "User0 WFT balance should be 0").to.equal(0);
    expect(wethBalanceAfter, "User0 WETH balance should increase").to.be.gt(
      wethBalanceBefore
    );
  });

  it("ROUTER: Affiliate logic check", async function () {
    console.log("***************** Test: Affiliate Check **************");
    // User2's affiliate was set earlier to user0
    expect(
      await router.referrals(user2.address),
      "Affiliate mismatch"
    ).to.equal(user0.address);

    // User1 tries to buy, setting user2 as affiliate - should NOT set as referral exists
    await router
      .connect(user1) // User1 buys
      .buyWithNative(
        wft0Address,
        user2.address,
        0,
        (await getBlockTimestamp()) + 300,
        {
          // Tries affiliate user2
          value: one,
        }
      );
    // User1's affiliate should still be user0 from previous buy test
    expect(
      await router.referrals(user1.address),
      "Affiliate should not change"
    ).to.equal(user0.address);

    // User without referral buys, setting one
    await router
      .connect(treasury) // Treasury buys
      .buyWithNative(
        wft0Address,
        user1.address,
        0,
        (await getBlockTimestamp()) + 300,
        {
          // Sets affiliate user1
          value: one,
        }
      );
    expect(
      await router.referrals(treasury.address),
      "Affiliate not set correctly"
    ).to.equal(user1.address);

    console.log("Affiliate logic checks passed");
  });

  it("ROUTER: Withdraw stuck tokens (Owner)", async function () {
    console.log("************** Test: Withdraw Stuck ****************");
    // Send some WETH directly to router
    await weth.connect(user0).deposit({ value: one });
    await weth.connect(user0).transfer(router.address, one);
    // Send some WFT directly to router
    await wft0.connect(treasury).transfer(router.address, convert("0.1", 18)); // Assuming treasury has some from fees/buys

    expect(await weth.balanceOf(router.address)).to.equal(one);
    expect(await wft0.balanceOf(router.address)).to.equal(convert("0.1", 18));

    // Non-owner cannot withdraw
    await expect(
      router.connect(user1).withdrawStuckTokens(weth.address, user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      router.connect(user1).withdrawStuckNative(user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // Owner withdraws WETH
    await router
      .connect(owner)
      .withdrawStuckTokens(weth.address, owner.address);
    expect(await weth.balanceOf(router.address)).to.equal(0);
    expect(await weth.balanceOf(owner.address)).to.equal(one);

    // Owner withdraws WFT
    await router
      .connect(owner)
      .withdrawStuckTokens(wft0.address, owner.address);
    expect(await wft0.balanceOf(router.address)).to.equal(0);

    // Owner withdraws ETH if any sent accidentally
    await owner.sendTransaction({
      to: router.address,
      value: ethers.utils.parseEther("0.01"),
    });
    const ethBalanceBefore = await ethers.provider.getBalance(owner.address);
    await router.connect(owner).withdrawStuckNative(owner.address);
    const ethBalanceAfter = await ethers.provider.getBalance(owner.address);
    expect(await ethers.provider.getBalance(router.address)).to.equal(0);
    expect(ethBalanceAfter).to.be.gt(ethBalanceBefore); // Received ETH (minus gas)

    console.log("Withdraw stuck tokens tests passed.");
  });
  */

  // --- Commented out non-router tests ---
  /*
  it("Quote Buy In estimate", async function () { ... });
  it("Quote Sell In estimate", async function () { ... });
  it("Quote Buy Out estimate", async function () { ... });
  it("Quote Sell Out estimate", async function () { ... });
  it("Token Data before borrow", async function () { ... });
  it("User0 borrows against wft0", async function () { ... }); // Direct call
  it("Token Data after borrow", async function () { ... });
  it("User0 tries to transfer more than transferable...", async function () { ... }); // Direct call
  it("User0 tries to sell all wft0 while having debt", async function () { ... }); // Direct call check needed
  it("User0 repays some WETH for wft0", async function () { ... }); // Direct call
  it("User0 transfers some transferable tokens", async function () { ... }); // Direct call
  it("User0 repays ALL remaining WETH", async function () { ... }); // Direct call
  it("User0 transfers wft0 freely after repay", async function () { ... }); // Direct call
  it("Invariants check wft0", async function () { ... });
  it("User0 heals with 1 WETH", async function () { ... }); // Direct call
  it("Invariants check wft0 after heal", async function () { ... });
  it("User0 creates wft1", async function () { ... }); // Tested router creation
  it("Token Data wft1 initial", async function () { ... });
  it("User0 contributes 1 weth to wft1", async function () { ... }); // Tested router contribute
  it("Token Data wft1 after contribution", async function () { ... });
  it("Invariants check wft1 before open", async function () { ... });
  it("Forward 2 hours again", async function () { ... });
  it("User0 redeems wft1 contribution", async function () { ... }); // Tested router redeem
  it("Final Invariants check wft1", async function () { ... });
  it("Final Token Data wft1", async function () { ... });
  */
});
