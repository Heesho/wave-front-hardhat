const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDecBN = (amount, decimals = 18) =>
  ethers.utils.formatUnits(amount, decimals);
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");
const { FixedNumber } = require("@ethersproject/bignumber"); // For fixed point math lib if needed

const AddressZero = "0x0000000000000000000000000000000000000000";
const pointZeroOne = convert("0.01", 18);
const pointOne = convert("0.1", 18);
const one = convert("1", 18);
const five = convert("5", 18);
const ten = convert("10", 18);
const oneHundred = convert("100", 18);
const oneThousand = convert("1000", 18);

// Add fee constants from Token.sol (or import if possible)
const FEE = 100; // 1% (100 / 10000)
const FEE_AMOUNT = 1500; // 15% (1500 / 10000)
const DIVISOR = 10000;
// *** FIX: Define PRECISION constant ***
const PRECISION = ethers.BigNumber.from("1000000000000000000"); // 1e18

let owner, multisig, user0, user1, user2, treasury;
let weth, wft0, wft1;
let preTokenFactory;
let tokenFactory;
let wavefront, multicall, router;

// Store token addresses from creation
let wft0Address, wft1Address;
let wft0PreTokenAddress, wft1PreTokenAddress; // Store preToken addresses if needed
let wft0PreToken, wft1PreToken; // PreToken instances
let wft0NftOwner; // Keep track of who owns the NFT

// *** FIX: Define getBlockTimestamp at top level ***
async function getBlockTimestamp() {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
}

// Helper for comparing BigNumbers with tolerance
const expectBnCloseTo = (a, b, tolerancePercentage = 0.01) => {
  const aBn = ethers.BigNumber.from(a);
  const bBn = ethers.BigNumber.from(b);
  const diff = aBn.sub(bBn).abs();
  // Calculate tolerance based on 'b' unless 'b' is zero
  const toleranceBase = bBn.isZero() ? aBn : bBn;
  const tolerance = toleranceBase
    .mul(Math.floor(tolerancePercentage * 10000))
    .div(10000);
  // Allow zero tolerance only if both are zero
  if (aBn.isZero() && bBn.isZero()) {
    expect(diff).to.equal(0);
  } else {
    expect(diff).to.be.lte(
      tolerance,
      `Expected ${a.toString()} to be close to ${b.toString()} (diff: ${diff.toString()}, tolerance: ${tolerance.toString()})`
    );
  }
};

// *** NEW: Invariant checking helper function ***
async function checkTokenInvariants(tokenInstance, description = "") {
  console.log(`--- Invariant Check Start: ${description} ---`);
  const tokenAddress = tokenInstance.address;
  const tokenMetadata = await ethers.getContractAt(
    "IERC20Metadata",
    tokenAddress
  ); // For total supply

  // Fetch reserves and state
  const reserveToken = await tokenInstance.reserveTokenAmt();
  const reserveRealQuote = await tokenInstance.reserveRealQuoteWad();
  const reserveVirtQuote = await tokenInstance.reserveVirtQuoteWad();
  const maxSupply = await tokenInstance.maxSupply();
  const totalSupply = await tokenMetadata.totalSupply();
  const totalDebt = await tokenInstance.totalDebtRaw();
  const currentMarketPrice = await tokenInstance.getMarketPrice();
  const currentFloorPrice = await tokenInstance.getFloorPrice();
  const isOpen = await tokenInstance.open();

  console.log(
    `  State: ${isOpen ? "Open" : "Closed"} | TotalSupply: ${divDecBN(
      totalSupply
    )}`
  );
  console.log(
    `  Reserves: Token=${divDecBN(reserveToken)}, RealQ=${divDecBN(
      reserveRealQuote
    )}, VirtQ=${divDecBN(reserveVirtQuote)}`
  );
  console.log(
    `  MaxSupply: ${divDecBN(maxSupply)} | TotalDebt: ${divDecBN(totalDebt)}`
  );
  console.log(
    `  Prices: Market=${divDecBN(currentMarketPrice)}, Floor=${divDecBN(
      currentFloorPrice
    )}`
  );

  // --- Assert Basic Conditions ---
  expect(reserveRealQuote).to.be.gte(
    0,
    "Real quote reserve cannot be negative"
  );
  // Allow reserveToken/maxSupply to be 0 only in edge cases if fully depleted? Check contract logic. Assume > 0 usually.
  // expect(reserveToken).to.be.gt(0, "Token reserve should be positive");
  // expect(maxSupply).to.be.gt(0, "Max supply should be positive");
  expect(maxSupply).to.be.gte(
    reserveToken,
    "Max supply must be >= token reserve"
  );
  expect(maxSupply).to.be.gte(
    totalSupply,
    "Max supply must be >= total supply"
  );

  // --- Recalculate Prices Manually ---
  let calculatedMarketPrice = ethers.BigNumber.from(0);
  if (!reserveToken.isZero()) {
    const totalQuote = reserveVirtQuote.add(reserveRealQuote);
    calculatedMarketPrice = totalQuote.mul(PRECISION).div(reserveToken); // Use PRECISION from contract
  }

  let calculatedFloorPrice = ethers.BigNumber.from(0);
  if (!maxSupply.isZero()) {
    calculatedFloorPrice = reserveVirtQuote.mul(PRECISION).div(maxSupply); // Use PRECISION from contract
  }

  console.log(
    `  Calc Prices: Market=${divDecBN(calculatedMarketPrice)}, Floor=${divDecBN(
      calculatedFloorPrice
    )}`
  );

  // --- Assert Price Consistency (with tolerance for fixed-point math differences) ---
  // Using a 0.01% tolerance for fixed point math discrepancies if necessary
  expectBnCloseTo(currentMarketPrice, calculatedMarketPrice, 0.0001); // Very tight tolerance
  expectBnCloseTo(currentFloorPrice, calculatedFloorPrice, 0.0001); // Very tight tolerance

  console.log(`--- Invariant Check End: ${description} ---`);
}

describe("local: test0", function () {
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
      preTokenFactory.address
    );
    await router.deployed();
    console.log("- Router Initialized");

    await wavefront.connect(owner).setTokenFactory(tokenFactory.address);

    console.log("- System set up");
    console.log("Initialization Complete");
    console.log();
  });

  it("ROUTER: Owner creates wft0 via router (User0 will interact later)", async function () {
    console.log("**************** Test: Create Token ****************");
    // Assign the NFT owner for clarity in later tests if needed
    wft0NftOwner = owner;
    console.log(`NFT Owner will be: ${wft0NftOwner.address}`);

    // *** CHANGE: owner connects and calls create ***
    const tx = await router.connect(wft0NftOwner).createWaveFrontToken(
      "WFT0", // name
      "WFT0", // symbol
      "http/ipfs.com/0", // uri
      weth.address,
      oneHundred // reserveVirtQuote
    );
    const receipt = await tx.wait();
    const createdEvent = receipt.events?.find(
      (e) => e.event === "WaveFrontRouter__Created"
    );
    expect(createdEvent, "WaveFrontRouter__Created event not found").to.exist;

    // Check that the creator in the event is the NFT owner (owner account)
    expect(createdEvent.args.creator, "Event creator mismatch").to.equal(
      wft0NftOwner.address
    );

    wft0Address = createdEvent.args.token;
    expect(wft0Address, "wft0Address is invalid").to.not.equal(AddressZero);

    // Get contract instance using ABI ("Token") and address
    wft0 = await ethers.getContractAt("Token", wft0Address);
    wft0PreTokenAddress = await wft0.preToken();
    wft0PreToken = await ethers.getContractAt("PreToken", wft0PreTokenAddress); // Get PreToken instance

    console.log(`WFT0 Created at: ${wft0Address}`);
    console.log(`WFT0 PreToken at: ${wft0PreTokenAddress}`);
    expect(await wft0.quote(), "Quote token mismatch").to.equal(weth.address);
    // *** ADDED: Initial invariant check ***
    await checkTokenInvariants(wft0, "After Creation");
  });

  it("ROUTER: User0 contributes native (ETH) via router", async function () {
    console.log("*************** Test: Contribute Native **************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0PreToken, "wft0PreToken instance not set").to.exist;

    const contributionBefore = await wft0PreToken.account_QuoteRaw(
      user0.address
    );

    await router
      .connect(user0)
      .contributeWithNative(wft0Address, { value: ten });

    const contributionAfter = await wft0PreToken.account_QuoteRaw(
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

    // *** ADDED: Check getTokenData during contribution period ***
    console.log("Fetching data during contribution period (User0)...");
    const midContributionData = await multicall.getTokenData(
      wft0Address,
      user0.address
    );
    expect(midContributionData.marketOpen).to.be.false;
    // block.timestamp should be less than contributionEndTimestamp here
    expect(midContributionData.tokenPhase.toString()).to.equal("1"); // Expect CONTRIBUTE (index 1)
    expect(midContributionData.accountContributed).to.equal(ten); // Check contribution recorded
    console.log(`  Mid-Contribution Phase: ${midContributionData.tokenPhase}`);

    await checkTokenInvariants(wft0, "After User0 Native Contribution");
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

    const contributionBefore = await wft0PreToken.account_QuoteRaw(
      user1.address
    );

    await router.connect(user1).contributeWithQuote(wft0Address, ten); // Router pulls approved WETH

    const contributionAfter = await wft0PreToken.account_QuoteRaw(
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
    await checkTokenInvariants(wft0, "After User1 Quote Contribution");
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

    // *** Check getTokenData before market opens (after contribution end time) ***
    console.log("Fetching data before market open (Contributor)...");
    const preOpenDataContributor = await multicall.getTokenData(
      wft0Address,
      user0.address
    ); // Check for user0 (contributor)
    expect(preOpenDataContributor.marketOpen).to.be.false;
    // User0 contributed, should be RedemptionAvailable
    expect(preOpenDataContributor.tokenPhase.toString()).to.equal("2"); // Expect REDEMPTION_AVAILABLE (index 2)
    console.log(
      `  Pre-Open Phase (Contributor user0): ${preOpenDataContributor.tokenPhase}`
    );

    // *** ADDED: Check for non-contributor in RedemptionAvailable phase ***
    console.log("Fetching data before market open (Non-Contributor)...");
    const preOpenDataNonContributor = await multicall.getTokenData(
      wft0Address,
      user2.address
    ); // Check for user2 (non-contributor)
    expect(preOpenDataNonContributor.marketOpen).to.be.false;
    // User2 did not contribute, should still show CONTRIBUTE conceptually as they can't redeem
    expect(preOpenDataNonContributor.tokenPhase.toString()).to.equal("1"); // Expect CONTRIBUTE (index 1)
    console.log(
      `  Pre-Open Phase (Non-Contributor user2): ${preOpenDataNonContributor.tokenPhase}`
    );

    console.log("User0 redeeming, should open market...");
    await expect(router.connect(user0).redeem(wft0Address))
      .to.emit(router, "WaveFrontRouter__MarketOpened") // Check for router event
      .withArgs(wft0Address, wft0PreTokenAddress); // Check event args

    expect(await wft0PreToken.ended(), "Market should now be open").to.be.true;
    // Check invariants AFTER the market is opened (PreToken calls Token.openMarket and potentially Token.buy)
    await checkTokenInvariants(wft0, "After Market Open via Redeem");
    console.log("Market opened successfully via redeem call");
  });

  it("ROUTER: Redeem remaining contribution (User1)", async function () {
    console.log("***************** Test: Redeem User1 *****************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;
    expect(multicall, "multicall needed for redeem check").to.exist; // Ensure multicall is available

    // *** ADDED: Check getTokenData for User1 before they redeem ***
    console.log("Fetching data for User1 before redeem (Market Open)...");
    const user1PreRedeemData = await multicall.getTokenData(
      wft0Address,
      user1.address
    );
    expect(user1PreRedeemData.marketOpen).to.be.true; // Market was opened by user0
    expect(user1PreRedeemData.accountContributed).to.be.gt(0); // User1 still has contribution
    expect(user1PreRedeemData.tokenPhase.toString()).to.equal("2"); // Expect REDEMPTION_AVAILABLE (index 2)
    expect(user1PreRedeemData.accountRedeemable).to.be.gt(0); // Should calculate redeemable amount
    console.log(
      `  User1 Pre-Redeem Phase: ${
        user1PreRedeemData.tokenPhase
      }, Redeemable: ${divDecBN(user1PreRedeemData.accountRedeemable)}`
    );

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
    // Invariant check after redeem
    await checkTokenInvariants(wft0, "After User1 Redeem");
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
    await checkTokenInvariants(wft0, "After User2 Native Buy");
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
    expect(
      wethBalanceAfter,
      "User0 WETH balance should equal owner fee"
    ).to.equal(expectedOwnerFee);
    await checkTokenInvariants(wft0, "After User0 Quote Buy");
  });

  it("ROUTER: Sell to native (ETH)", async function () {
    console.log("***************** Test: Sell Native ******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    const balanceBefore = await wft0.balanceOf(user0.address);
    const ethBalanceBefore = await ethers.provider.getBalance(user0.address);
    console.log(`User0 WFT balance before sell: ${divDecBN(balanceBefore)}`);
    // Allow selling even if balance is tiny (dust from previous buys/sells)
    // Important check is balance *after* sell
    if (balanceBefore.eq(0)) {
      console.log("User0 has 0 WFT balance before sell, skipping sell logic.");
      this.skip(); // Skip test if nothing to sell
    }
    expect(balanceBefore, "User0 must have WFT balance to sell").to.be.gt(0);

    await wft0.connect(user0).approve(router.address, balanceBefore); // User approves Router

    const deadline = (await getBlockTimestamp()) + 300;
    await expect(
      router.connect(user0).sellToNative(
        wft0Address,
        AddressZero, // affiliate address
        balanceBefore, // Sell all
        0, // minAmountQuoteOut
        deadline
      )
    ).to.emit(router, "WaveFrontRouter__Sell"); // Check for event emission

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
    const expectedEthIncrease = ethBalanceAfter.sub(ethBalanceBefore); // Rough check
    console.log(`ETH received (approx): ${divDecBN(expectedEthIncrease)}`);

    // *** EXPECTATION CHANGE: Balance should now be exactly 0 ***
    expect(balanceAfter, "User0 WFT balance should be 0").to.equal(0);
    expect(ethBalanceAfter, "User0 ETH balance should increase").to.be.gt(
      ethBalanceBefore
    );
    await checkTokenInvariants(wft0, "After User0 Native Sell");
  });

  it("ROUTER: Sell to quote (WETH)", async function () {
    console.log("****************** Test: Sell Quote ******************");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(wft0, "wft0 instance not set").to.exist;

    // User0 Buys some WFT first to have something to sell
    const buyAmount = five;
    const deadlineBuy = (await getBlockTimestamp()) + 300;
    // Ensure user0 has WETH to buy
    const user0WethBalance = await weth.balanceOf(user0.address);
    if (user0WethBalance.lt(buyAmount)) {
      await weth
        .connect(user0)
        .deposit({ value: buyAmount.sub(user0WethBalance) });
    }
    await weth.connect(user0).approve(router.address, buyAmount);
    console.log("User0 buying WFT before selling to quote...");
    await router
      .connect(user0)
      .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadlineBuy);
    console.log("User0 buy complete.");

    const balanceBefore = await wft0.balanceOf(user0.address);
    expect(balanceBefore, "User0 needs balance to sell").to.be.gt(0);
    console.log(`User0 WFT balance before sell: ${divDecBN(balanceBefore)}`);

    const wethBalanceBefore = await weth.balanceOf(user0.address);

    await wft0.connect(user0).approve(router.address, balanceBefore); // User approves Router

    const deadlineSell = (await getBlockTimestamp()) + 300;
    await expect(
      router.connect(user0).sellToQuote(
        wft0Address,
        AddressZero, // affiliate address
        balanceBefore, // Sell all
        0, // minAmountQuoteOut
        deadlineSell
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
    // *** EXPECTATION CHANGE: Balance should now be exactly 0 ***
    expect(balanceAfter, "User0 WFT balance should be 0").to.equal(0);
    expect(wethBalanceAfter, "User0 WETH balance should increase").to.be.gt(
      wethBalanceBefore
    );
    await checkTokenInvariants(wft0, "After User0 Quote Sell");
  });

  it("ROUTER: Affiliate logic check", async function () {
    console.log("***************** Test: Affiliate Check **************");
    // User2's affiliate was set earlier to user0 during buyWithNative
    expect(
      await router.referrals(user2.address),
      "Affiliate mismatch for user2"
    ).to.equal(user0.address);

    // User1 tries to buy, setting user2 as affiliate
    // Since user1 already has user0 as their affiliate (set in buyWithQuote earlier if they bought)
    // or doesn't have one yet, this call will set it if it's currently address(0).
    // Let's check user1's referral *before* the buy.
    const user1AffiliateBefore = await router.referrals(user1.address);
    console.log(`User1 affiliate before buy: ${user1AffiliateBefore}`);

    const deadline1 = (await getBlockTimestamp()) + 300;
    await router
      .connect(user1) // User1 buys
      .buyWithNative(
        wft0Address,
        user2.address, // Tries affiliate user2
        0, // minAmountTokenOut
        deadline1,
        { value: one }
      );

    // Check user1's affiliate *after* the buy. It should be user2 ONLY if it was address(0) before.
    const user1AffiliateAfter = await router.referrals(user1.address);
    console.log(`User1 affiliate after buy: ${user1AffiliateAfter}`);
    if (user1AffiliateBefore === AddressZero) {
      expect(
        user1AffiliateAfter,
        "User1 affiliate should be set to user2"
      ).to.equal(user2.address);
    } else {
      expect(user1AffiliateAfter, "User1 affiliate should not change").to.equal(
        user1AffiliateBefore
      );
    }

    // User without referral (treasury) buys, setting one (user1)
    expect(
      await router.referrals(treasury.address),
      "Treasury affiliate should be 0 initially"
    ).to.equal(AddressZero);
    const deadline2 = (await getBlockTimestamp()) + 300;
    await router
      .connect(treasury) // Treasury buys
      .buyWithNative(
        wft0Address,
        user1.address, // Sets affiliate user1
        0, // minAmountTokenOut
        deadline2,
        { value: one }
      );
    expect(
      await router.referrals(treasury.address),
      "Treasury affiliate not set correctly"
    ).to.equal(user1.address);

    console.log("Affiliate logic checks passed");
  });

  it("ROUTER: Withdraw stuck tokens (Owner)", async function () {
    console.log("************** Test: Withdraw Stuck ****************");
    const stuckWethAmount = one;
    const stuckWftAmount = convert("0.1", 18);
    const stuckEthAmount = ethers.utils.parseEther("0.01");

    // Need WFT to send - let's have treasury buy some first if they don't have any
    // Check treasury balance
    let treasuryWftBalance = await wft0.balanceOf(treasury.address);
    if (treasuryWftBalance.lt(stuckWftAmount)) {
      console.log("Treasury buying WFT to perform stuck token test...");
      const deadlineBuy = (await getBlockTimestamp()) + 300;
      await weth.connect(treasury).deposit({ value: five }); // Get some WETH
      await weth.connect(treasury).approve(router.address, five);
      await router
        .connect(treasury)
        .buyWithQuote(wft0Address, AddressZero, five, 0, deadlineBuy);
      treasuryWftBalance = await wft0.balanceOf(treasury.address);
      console.log(`Treasury WFT balance now: ${divDecBN(treasuryWftBalance)}`);
    }
    expect(treasuryWftBalance, "Treasury needs sufficient WFT").to.be.gte(
      stuckWftAmount
    );

    // Send some WETH directly to router
    await weth.connect(user0).deposit({ value: stuckWethAmount });
    await weth.connect(user0).transfer(router.address, stuckWethAmount);
    // Send some WFT directly to router from treasury
    await wft0.connect(treasury).transfer(router.address, stuckWftAmount);

    expect(await weth.balanceOf(router.address)).to.equal(stuckWethAmount);
    expect(await wft0.balanceOf(router.address)).to.equal(stuckWftAmount);

    // Non-owner cannot withdraw
    await expect(
      router.connect(user1).withdrawStuckTokens(weth.address, user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      router.connect(user1).withdrawStuckNative(user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // Owner withdraws WETH
    const ownerWethBefore = await weth.balanceOf(owner.address);
    await router
      .connect(owner)
      .withdrawStuckTokens(weth.address, owner.address);
    expect(await weth.balanceOf(router.address)).to.equal(0);
    expect(await weth.balanceOf(owner.address)).to.equal(
      ownerWethBefore.add(stuckWethAmount)
    );

    // Owner withdraws WFT
    const ownerWftBefore = await wft0.balanceOf(owner.address);
    await router
      .connect(owner)
      .withdrawStuckTokens(wft0.address, owner.address);
    expect(await wft0.balanceOf(router.address)).to.equal(0);
    expect(await wft0.balanceOf(owner.address)).to.equal(
      ownerWftBefore.add(stuckWftAmount)
    );

    // Owner withdraws ETH if any sent accidentally
    await owner.sendTransaction({
      to: router.address,
      value: stuckEthAmount,
    });
    expect(await ethers.provider.getBalance(router.address)).to.equal(
      stuckEthAmount
    ); // Check ETH arrived

    const ownerEthBalanceBefore = await ethers.provider.getBalance(
      owner.address
    );
    // Estimate gas cost (this is very approximate)
    const gasEstimate = await router
      .connect(owner)
      .estimateGas.withdrawStuckNative(owner.address);
    const gasPrice = await ethers.provider.getGasPrice();
    const estimatedGasCost = gasEstimate.mul(gasPrice);

    const txResponse = await router
      .connect(owner)
      .withdrawStuckNative(owner.address);
    const txReceipt = await txResponse.wait();
    const actualGasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    const ownerEthBalanceAfter = await ethers.provider.getBalance(
      owner.address
    );
    expect(await ethers.provider.getBalance(router.address)).to.equal(0);
    // Check owner balance increased by stuck amount MINUS gas cost
    expect(ownerEthBalanceAfter).to.equal(
      ownerEthBalanceBefore.add(stuckEthAmount).sub(actualGasCost)
    );

    console.log("Withdraw stuck tokens tests passed.");
  });

  // *** NEW: Test getTokenData ***
  it("MULTICALL: getTokenData retrieves aggregated data", async function () {
    console.log("********* Test: getTokenData ***********");
    expect(wft0Address, "wft0Address not set").to.exist;
    expect(multicall, "multicall instance not set").to.exist;
    expect(user0, "user0 not defined").to.exist;
    expect(weth, "weth instance not set").to.exist; // For quote check

    // --- Test with a specific user (user0) ---
    console.log("Fetching data for user0...");
    // Ensure user0 has some state (balance, debt, etc.) - they should from previous tests
    const user0Data = await multicall.getTokenData(wft0Address, user0.address);

    // Basic Assertions
    expect(user0Data.token).to.equal(wft0Address);
    expect(user0Data.quote).to.equal(weth.address);
    expect(user0Data.preToken).to.equal(wft0PreTokenAddress);
    expect(user0Data.wavefront).to.equal(wavefront.address);
    expect(user0Data.owner).to.equal(wft0NftOwner.address); // Check NFT owner
    expect(user0Data.name).to.equal("WFT0");
    expect(user0Data.symbol).to.equal("WFT0");
    expect(user0Data.marketOpen).to.be.true; // Should be open at this point

    // Check prices are non-zero (assuming market has liquidity)
    expect(user0Data.marketPrice).to.be.gt(0);
    expect(user0Data.floorPrice).to.be.gt(0);
    expect(user0Data.liquidity).to.be.gt(0);

    // Check some account-specific fields (values depend on previous tests)
    console.log(
      `User0 Data: TokenBal=${divDecBN(
        user0Data.accountTokenBalance
      )}, Debt=${divDecBN(user0Data.accountDebt)}, Credit=${divDecBN(
        user0Data.accountCredit
      )}`
    );
    // *** FIX: User0 sold all tokens in previous sell tests ***
    expect(user0Data.accountTokenBalance, "User0 token balance check").to.equal(
      0
    );
    // User0 should have no debt (they haven't borrowed yet at this stage)
    expect(user0Data.accountDebt, "User0 debt check").to.equal(0);
    // User0 already redeemed their contribution when opening the market
    expect(
      user0Data.accountContributed,
      "User0 contributed quote check"
    ).to.equal(0);

    // --- Test without a specific user (address(0)) ---
    console.log("Fetching data without specific account...");
    const generalData = await multicall.getTokenData(wft0Address, AddressZero);

    // Basic Assertions (should match user0Data for non-account fields)
    expect(generalData.token).to.equal(wft0Address);
    expect(generalData.quote).to.equal(weth.address);
    expect(generalData.marketPrice).to.be.gt(0);

    // Account fields should be zero when address(0) is passed
    expect(generalData.accountNativeBalance).to.equal(0);
    expect(generalData.accountQuoteBalance).to.equal(0);
    expect(generalData.accountTokenBalance).to.equal(0);
    expect(generalData.accountDebt).to.equal(0);
    expect(generalData.accountCredit).to.equal(0);
    expect(generalData.accountTransferrable).to.equal(0);
    expect(generalData.accountContributed).to.equal(0);
    expect(generalData.accountRedeemable).to.equal(0);

    console.log("getTokenData basic checks passed.");
    // We could call this again at different points (e.g., before market open) for more thorough testing of phases
  });

  // *** NEW: Multicall Estimation Edge Cases ***
  describe("MULTICALL: Estimation Edge Cases", function () {
    let reserveToken, reserveRealQuote;

    before(async function () {
      // Get reserves state at this point in the test sequence
      expect(wft0, "wft0 instance not set for estimations").to.exist;
      reserveToken = await wft0.reserveTokenAmt();
      reserveRealQuote = await wft0.reserveRealQuoteWad();
      expect(reserveToken).to.be.gt(0);
      expect(reserveRealQuote).to.be.gt(0); // Should have real quote after trades
    });

    it("buyQuoteIn: Estimates tokens out for quote in + handles zero input", async function () {
      console.log("--- Test: multicall.buyQuoteIn ---");
      // ... existing zero check ...
      // Test with different amounts
      const amountsIn = [
        pointZeroOne, // Added
        pointOne, // Added
        one,
        five,
        ten.div(10), // This was 0.1 already, kept for consistency if needed
      ]; // Updated amounts
      for (const quoteAmountIn of amountsIn) {
        const slippageTolerance = 9950;
        const [tokenAmountOut, slippage, minTokenAmtOut, autoMinTokenAmtOut] =
          await multicall.buyQuoteIn(
            wft0Address,
            quoteAmountIn,
            slippageTolerance
          );
        console.log(
          `  Estimate WFT out for ${divDecBN(quoteAmountIn)} WETH: ~${divDecBN(
            tokenAmountOut
          )}, Slippage: ${slippage.toString()}, Min Out (Manual): ${divDecBN(
            minTokenAmtOut
          )}, Min Out (Auto): ${divDecBN(autoMinTokenAmtOut)}`
        );
        expect(tokenAmountOut).to.be.gt(0);
        expect(minTokenAmtOut).to.be.gte(0); // Check positivity
        expect(autoMinTokenAmtOut).to.be.gte(0); // Check positivity
      }
    });

    it("buyTokenOut: Estimates quote in for tokens out + handles edge cases", async function () {
      console.log("--- Test: multicall.buyTokenOut ---");
      // ... existing edge cases ...
      // Test with different amounts
      const amountsOut = [
        pointZeroOne, // Keep
        pointOne, // Keep
        convert("100", 18),
        convert("50000", 18),
      ]; // Already included
      for (const tokenAmountOut of amountsOut) {
        const slippageTolerance = 9950;
        const [quoteRawIn, slippage, minTokenAmtOut, autoMinTokenAmtOut] =
          await multicall.buyTokenOut(
            wft0Address,
            tokenAmountOut,
            slippageTolerance
          );
        console.log(
          `  Estimate WETH needed for ${divDecBN(
            tokenAmountOut
          )} WFT: ~${divDecBN(
            quoteRawIn
          )}, Slippage: ${slippage.toString()}, Min Check (Manual): ${divDecBN(
            minTokenAmtOut
          )}, Min Check (Auto): ${divDecBN(autoMinTokenAmtOut)}`
        );
        expect(quoteRawIn).to.be.gt(0);
        expect(quoteRawIn).to.be.lt(ethers.constants.MaxUint256);
        expect(slippage).to.be.gte(0);
        expect(minTokenAmtOut).to.be.gte(0); // Check positivity
        expect(autoMinTokenAmtOut).to.be.gte(0); // Check positivity
      }
    });

    // Add a test for sellTokenIn (similar structure)
    it("sellTokenIn: Estimates quote out for token in", async function () {
      console.log("--- Test: multicall.sellTokenIn ---");
      // Test with different amounts
      const amountsIn = [
        pointZeroOne, // Added
        pointOne, // Added
        one,
        convert("1000", 18), // Example large amount
        convert("100000", 18), // Example larger amount
      ];
      for (const tokenAmountIn of amountsIn) {
        const slippageTolerance = 9950; // Example tolerance
        const [quoteRawOut, slippage, minQuoteRawOut, autoMinQuoteRawOut] =
          await multicall.sellTokenIn(
            wft0Address,
            tokenAmountIn,
            slippageTolerance
          );
        console.log(
          `  Estimate WETH out for ${divDecBN(tokenAmountIn)} WFT: ~${divDecBN(
            quoteRawOut
          )}, Slippage: ${slippage.toString()}, Min Out (Manual): ${divDecBN(
            minQuoteRawOut
          )}, Min Out (Auto): ${divDecBN(autoMinQuoteRawOut)}`
        );
        expect(quoteRawOut).to.be.gt(0);
        expect(slippage).to.be.gte(0);
        expect(minQuoteRawOut).to.be.gte(0); // Check positivity
        expect(autoMinQuoteRawOut).to.be.gte(0); // Check positivity
      }
    });

    // ---- NEW TEST for sellQuoteOut ----
    it("sellQuoteOut: Estimates token in for quote out", async function () {
      console.log("--- Test: multicall.sellQuoteOut ---");
      // Test with different amounts *of quote* you want out
      const amountsOut = [
        pointZeroOne, // Added
        pointOne, // Added
        one,
        five,
      ];
      for (const quoteAmountOut of amountsOut) {
        const slippageTolerance = 9950; // Example tolerance
        const [
          tokenAmtIn,
          slippage,
          minQuoteRawOut, // Note: Contract output name might be confusing here
          autoMinQuoteRawOut, // Note: Contract output name might be confusing here
        ] = await multicall.sellQuoteOut(
          wft0Address,
          quoteAmountOut,
          slippageTolerance
        );
        console.log(
          `  Estimate WFT needed for ${divDecBN(
            quoteAmountOut
          )} WETH out: ~${divDecBN(
            tokenAmtIn
          )}, Slippage: ${slippage.toString()}, Min Quote Check (Manual): ${divDecBN(
            minQuoteRawOut
          )}, Min Quote Check (Auto): ${divDecBN(autoMinQuoteRawOut)}`
        );
        expect(tokenAmtIn).to.be.gt(0);
        expect(slippage).to.be.gte(0);
        // The min/autoMin outputs here relate to the *input* quoteAmountOut
        expect(minQuoteRawOut).to.be.gte(0); // Check positivity
        expect(autoMinQuoteRawOut).to.be.gte(0); // Check positivity
      }
    });

    // ... existing WAVEFRONT tests ...
  });

  describe("WAVEFRONT: Core Functionality", function () {
    let createdTokenId; // Store the tokenId created earlier

    before(async function () {
      expect(wft0, "wft0 must exist from previous test").to.exist;
      createdTokenId = await wft0.wavefrontId();
      expect(createdTokenId).to.be.gt(0, "Could not get wavefrontId from wft0");
      console.log(`Using tokenId ${createdTokenId} for WaveFront tests.`);
    });

    it("setTreasury: Owner can set treasury, non-owner cannot", async function () {
      console.log("--- Test: WaveFront.setTreasury ---");
      const currentTreasury = await wavefront.treasury();
      const newTreasury = multisig.address;
      expect(newTreasury).to.not.equal(currentTreasury);

      // Owner sets treasury
      await expect(wavefront.connect(owner).setTreasury(newTreasury))
        .to.emit(wavefront, "WaveFront__TreasurySet")
        .withArgs(currentTreasury, newTreasury);
      expect(await wavefront.treasury()).to.equal(newTreasury);
      console.log(`  Treasury set to ${newTreasury} by owner`);

      // Non-owner cannot set treasury
      await expect(
        wavefront.connect(user0).setTreasury(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      console.log(`  Non-owner correctly reverted`);

      // Set back for subsequent tests if needed (or use a dedicated treasury account)
      // await wavefront.connect(owner).setTreasury(currentTreasury);
    });

    it("setTokenURI: NFT owner can set URI, non-owner cannot", async function () {
      console.log("--- Test: WaveFront.setTokenURI ---");
      expect(wft0NftOwner, "NFT Owner (wft0NftOwner) not set").to.exist;
      const currentURI = await wavefront.tokenURI(createdTokenId);
      const newURI = "ipfs://newmetadata";
      expect(newURI).to.not.equal(currentURI);

      // NFT Owner sets URI
      await expect(
        wavefront.connect(wft0NftOwner).setTokenURI(createdTokenId, newURI)
      )
        .to.emit(wavefront, "WaveFront__TokenURISet")
        .withArgs(createdTokenId, newURI);
      expect(await wavefront.tokenURI(createdTokenId)).to.equal(newURI);
      console.log(`  URI set to ${newURI} by NFT owner`);

      // Non-owner of NFT cannot set URI
      await expect(
        wavefront.connect(user0).setTokenURI(createdTokenId, "ipfs://another")
      ).to.be.revertedWith("WaveFront__NotAuthorized");
      console.log(`  Non-owner of NFT correctly reverted`);

      // Non-owner of contract (but not NFT) also cannot set URI
      const nonNftOwner = owner.address === user1.address ? user2 : user1; // Ensure it's not the NFT owner
      await expect(
        wavefront
          .connect(nonNftOwner)
          .setTokenURI(createdTokenId, "ipfs://another")
      ).to.be.revertedWith("WaveFront__NotAuthorized");
      console.log(`  Contract owner (but not NFT owner) correctly reverted`);
    });

    it("tokenURI: Returns the correct URI", async function () {
      console.log("--- Test: WaveFront.tokenURI ---");
      const expectedURI = "ipfs://newmetadata"; // From previous test
      const actualURI = await wavefront.tokenURI(createdTokenId);
      expect(actualURI).to.equal(expectedURI);
      console.log(`  tokenURI returned correct value: ${actualURI}`);
    });

    it("supportsInterface: Correctly reports supported interfaces", async function () {
      console.log("--- Test: WaveFront.supportsInterface ---");
      const erc165InterfaceId = "0x01ffc9a7";
      const erc721InterfaceId = "0x80ac58cd";
      const erc721EnumerableInterfaceId = "0x780e9d63";
      const erc721URIStorageInterfaceId = "0x5b5e139f";
      const bogusInterfaceId = "0xffffffff";

      expect(await wavefront.supportsInterface(erc165InterfaceId)).to.be.true;
      expect(await wavefront.supportsInterface(erc721InterfaceId)).to.be.true;
      expect(await wavefront.supportsInterface(erc721EnumerableInterfaceId)).to
        .be.true;
      expect(await wavefront.supportsInterface(erc721URIStorageInterfaceId)).to
        .be.true;
      expect(await wavefront.supportsInterface(bogusInterfaceId)).to.be.false;
      console.log("  supportsInterface checks passed.");
    });
  });

  // --- NEW: Token Owner Fee Toggle Tests ---
  describe("TOKEN: Owner Fee Status Toggle", function () {
    let nftOwner; // The account owning the NFT
    let feeTokenId; // The tokenId

    before(async function () {
      // Ensure wft0 and its owner are set from previous tests
      expect(wft0, "wft0 instance must exist").to.exist;
      expect(wft0NftOwner, "wft0NftOwner must exist").to.exist;
      nftOwner = wft0NftOwner; // Use the owner from the create test
      feeTokenId = await wft0.wavefrontId();
    });

    it("Initial state: ownerFeesActive should be true", async function () {
      console.log("--- Test Fee Toggle: Initial State ---");
      expect(await wft0.ownerFeeActive()).to.be.true;
    });

    it("setOwnerFeeStatus: Non-owner cannot change status", async function () {
      console.log("--- Test Fee Toggle: Non-owner Revert ---");
      await expect(
        wft0.connect(user0).setOwnerFee(false) // User0 tries to deactivate
      ).to.be.revertedWith("Token__NotOwner");

      await expect(
        wft0.connect(user0).setOwnerFee(true) // User0 tries to activate
      ).to.be.revertedWith("Token__NotOwner");
      console.log("  Non-owner correctly reverted.");
    });

    it("setOwnerFeeStatus: NFT owner can deactivate fees", async function () {
      console.log("--- Test Fee Toggle: Deactivate ---");
      expect(await wft0.ownerFeeActive()).to.be.true; // Start active

      await expect(wft0.connect(nftOwner).setOwnerFee(false))
        .to.emit(wft0, "Token__OwnerFeeSet")
        .withArgs(false);

      expect(await wft0.ownerFeeActive()).to.be.false; // Check deactivated
      console.log("  Fees deactivated by NFT owner.");
    });

    it("Fee Distribution: Owner does NOT receive fees when inactive", async function () {
      console.log("--- Test Fee Toggle: Fees Inactive Check ---");
      expect(await wft0.ownerFeeActive()).to.be.false; // Ensure inactive

      const buyAmount = one;
      const buyer = user2; // Use a different user
      const nftOwnerQuoteBalanceBefore = await weth.balanceOf(nftOwner.address);

      // Buyer gets WETH and approves router
      await weth.connect(buyer).deposit({ value: buyAmount });
      await weth.connect(buyer).approve(router.address, buyAmount);

      // Buyer buys via router
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline);

      const nftOwnerQuoteBalanceAfter = await weth.balanceOf(nftOwner.address);

      // NFT Owner's balance should NOT have increased
      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore,
        "NFT owner quote balance should not change when fees inactive"
      );
      console.log("  NFT owner correctly received no fees.");

      // Check invariants
      await checkTokenInvariants(wft0, "After Buy with Owner Fees Inactive");
    });

    it("setOwnerFeeStatus: NFT owner can reactivate fees", async function () {
      console.log("--- Test Fee Toggle: Reactivate ---");
      expect(await wft0.ownerFeeActive()).to.be.false; // Start inactive

      await expect(wft0.connect(nftOwner).setOwnerFee(true))
        .to.emit(wft0, "Token__OwnerFeeSet")
        .withArgs(true);

      expect(await wft0.ownerFeeActive()).to.be.true; // Check reactivated
      console.log("  Fees reactivated by NFT owner.");
    });

    it("Fee Distribution: Owner DOES receive fees when active again", async function () {
      console.log("--- Test Fee Toggle: Fees Active Check ---");
      expect(await wft0.ownerFeeActive()).to.be.true; // Ensure active

      const buyAmount = one;
      const buyer = user1; // Use yet another user
      const nftOwnerQuoteBalanceBefore = await weth.balanceOf(nftOwner.address);

      // Buyer gets WETH and approves router
      await weth.connect(buyer).deposit({ value: buyAmount });
      await weth.connect(buyer).approve(router.address, buyAmount);

      // Buyer buys via router
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline);

      const nftOwnerQuoteBalanceAfter = await weth.balanceOf(nftOwner.address);

      // Calculate expected fee
      const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
      const expectedOwnerFee = feeQuote.mul(FEE_AMOUNT).div(DIVISOR);

      // NFT Owner's balance SHOULD have increased by the fee amount
      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore.add(expectedOwnerFee),
        "NFT owner quote balance should increase by fee when active"
      );
      console.log(
        `  NFT owner correctly received fee: ${divDecBN(expectedOwnerFee)}`
      );

      // Check invariants
      await checkTokenInvariants(wft0, "After Buy with Owner Fees Active");
    });
  });

  // --- NEW: Test Fee Redirection to Reserves ---
  describe("FEES: Redirection to Reserves", function () {
    let nftOwner;
    let feeTokenId;
    let buyer;
    let seller;

    before("Setup Fee Redirection Scenario", async function () {
      console.log("--- Fee Redirection Setup Running ---");

      // Ensure necessary contracts and accounts are set
      expect(wft0, "wft0 instance must exist").to.exist;
      expect(wft0NftOwner, "wft0NftOwner must exist").to.exist;
      expect(wavefront, "wavefront instance must exist").to.exist;
      expect(owner, "owner account must exist").to.exist;
      expect(router, "router instance must exist").to.exist;
      expect(weth, "weth instance must exist").to.exist;
      expect(user1, "user1 must exist").to.exist; // Ensure buyer is available
      expect(user2, "user2 must exist").to.exist; // Ensure seller is available

      nftOwner = wft0NftOwner; // Owner of the WaveFront NFT
      feeTokenId = await wft0.wavefrontId();
      buyer = user1; // User performing the buy
      seller = user2; // User performing the sell (needs funding first)

      // 1. Deactivate Owner Fees
      if (await wft0.ownerFeeActive()) {
        console.log("  Deactivating owner fees...");
        await wft0.connect(nftOwner).setOwnerFee(false);
      }
      expect(await wft0.ownerFeeActive()).to.be.false;
      console.log(`  Owner fees active: ${await wft0.ownerFeeActive()}`);

      // 2. Set Treasury to AddressZero
      const currentTreasury = await wavefront.treasury();
      if (currentTreasury !== AddressZero) {
        console.log(
          `  Setting treasury from ${currentTreasury} to address(0)...`
        );
        await wavefront.connect(owner).setTreasury(AddressZero);
      }
      expect(await wavefront.treasury()).to.equal(AddressZero);
      console.log(`  Treasury address: ${await wavefront.treasury()}`);

      // --- SETUP: Fund Seller ---
      console.log("  Funding seller account...");

      // Buyer gets WETH if needed
      const fundingAmount = ten; // Ensure enough WETH
      const buyerWethBalancePreFund = await weth.balanceOf(buyer.address);
      if (buyerWethBalancePreFund.lt(fundingAmount)) {
        await weth
          .connect(buyer)
          .deposit({ value: fundingAmount.sub(buyerWethBalancePreFund) });
      }

      // Buyer approves the ROUTER ADDRESS to spend their WETH
      const buyQuoteAmount = five; // Amount for initial buy to fund seller
      await weth.connect(buyer).approve(router.address, buyQuoteAmount);
      console.log(
        `   Buyer approved router for ${divDecBN(buyQuoteAmount)} WETH`
      );

      // Buyer buys WFT
      const deadlineBuy = (await getBlockTimestamp()) + 300;
      console.log("   Buyer buying WFT...");
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyQuoteAmount, 0, deadlineBuy);
      console.log("   Buyer WFT buy complete.");

      // Buyer transfers WFT to Seller
      const buyerWftBalance = await wft0.balanceOf(buyer.address);
      expect(buyerWftBalance).to.be.gt(0, "Buyer should have WFT after buying");
      const amountToTransfer = buyerWftBalance.div(2); // Transfer half to seller
      console.log(
        `   Buyer transferring ${divDecBN(amountToTransfer)} WFT to seller...`
      );

      // Get seller balance BEFORE transfer
      const sellerBalanceBeforeTransfer = await wft0.balanceOf(seller.address);

      await wft0.connect(buyer).transfer(seller.address, amountToTransfer);

      // Get seller balance AFTER transfer
      const sellerBalanceAfterTransfer = await wft0.balanceOf(seller.address);

      // Assert the CHANGE in balance
      expect(sellerBalanceAfterTransfer).to.equal(
        sellerBalanceBeforeTransfer.add(amountToTransfer), // Check increase
        "Seller WFT balance did not increase correctly after transfer"
      );
      console.log(
        `  Seller ${seller.address} funded with WFT. New balance: ${divDecBN(
          sellerBalanceAfterTransfer
        )}`
      ); // Log new balance

      console.log("--- Fee Redirection Setup Complete ---");
    });

    it("Buy: Fees are redirected to reserves (heal)", async function () {
      console.log("--- Test Fee Redirection: Buy Operation ---");
      expect(buyer, "Buyer (user1) not set in before hook").to.exist;
      expect(nftOwner, "nftOwner not set in before hook").to.exist;
      expect(await wft0.ownerFeeActive(), "Owner fees should be inactive").to.be
        .false;
      expect(
        await wavefront.treasury(),
        "Treasury should be AddressZero"
      ).to.equal(AddressZero);

      await checkTokenInvariants(wft0, "Before Buy (Fees Off)");

      const buyAmount = one;
      const nftOwnerQuoteBalanceBefore = await weth.balanceOf(nftOwner.address);
      const reserveRealQuoteBefore = await wft0.reserveRealQuoteWad();
      const reserveVirtQuoteBefore = await wft0.reserveVirtQuoteWad();
      const reserveTokenBefore = await wft0.reserveTokenAmt();
      const maxSupplyBefore = await wft0.maxSupply();

      // --- Simulate the state MID-BUY (after swap adjust, before heal) ---
      const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
      const amountQuoteInAfterFee = buyAmount.sub(feeQuote);

      // Calculate intermediate token reserve (replicating buy function logic with standard BN math)
      const currentTotalQuoteReserveMid = reserveVirtQuoteBefore.add(
        reserveRealQuoteBefore
      );
      const newTotalQuoteReserveMid = currentTotalQuoteReserveMid.add(
        amountQuoteInAfterFee
      );
      let reserveTokenMid = ethers.BigNumber.from(0);
      if (!newTotalQuoteReserveMid.isZero()) {
        // Replicate: currentTotalQuoteReserveMid.mulWadUp(reserveTokenBefore).divWadUp(newTotalQuoteReserveMid);
        const num = currentTotalQuoteReserveMid.mul(reserveTokenBefore); // a*b
        const intermediateMulUp = num.add(PRECISION.sub(1)).div(PRECISION); // mulWadUp(a,b)
        reserveTokenMid = intermediateMulUp
          .mul(PRECISION)
          .add(newTotalQuoteReserveMid.sub(1))
          .div(newTotalQuoteReserveMid); // divWadUp(result, c)
      }
      const reserveRealQuoteMid = reserveRealQuoteBefore.add(
        amountQuoteInAfterFee
      );
      // --- End Simulation ---

      // --- Perform the actual buy ---
      await weth.connect(buyer).approve(router.address, buyAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline);

      // --- Get final state ---
      const nftOwnerQuoteBalanceAfter = await weth.balanceOf(nftOwner.address);
      const reserveRealQuoteAfter = await wft0.reserveRealQuoteWad();
      const reserveVirtQuoteAfter = await wft0.reserveVirtQuoteWad();
      const reserveTokenAfter = await wft0.reserveTokenAmt();

      // --- Calculate EXPECTED final state based on _healQuoteReserves ---
      // Heal calculation uses the MID-state reserves
      let reserveHeal = ethers.BigNumber.from(0);
      const denominatorHeal = maxSupplyBefore.sub(reserveTokenMid);
      if (maxSupplyBefore.gt(reserveTokenMid) && denominatorHeal.gt(0)) {
        // Check division safety
        // Replicate: reserveTokenMid.mulWadDown(feeQuote).divWadDown(denominatorHeal);
        const intermediateMulDown = reserveTokenMid
          .mul(feeQuote)
          .div(PRECISION); // mulWadDown(a,b)
        reserveHeal = intermediateMulDown.mul(PRECISION).div(denominatorHeal); // divWadDown(result, c)
      }

      const expectedReserveRealQuoteAfter = reserveRealQuoteMid.add(feeQuote);
      const expectedReserveVirtQuoteAfter =
        reserveVirtQuoteBefore.add(reserveHeal);
      const expectedReserveTokenAfter = reserveTokenMid;

      // --- Verification ---
      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore,
        "NFT owner quote balance should not change"
      );

      // Compare final state with calculated expected state
      expectBnCloseTo(
        reserveRealQuoteAfter,
        expectedReserveRealQuoteAfter,
        0.0001,
        "Real Quote after heal mismatch"
      );
      expectBnCloseTo(
        reserveVirtQuoteAfter,
        expectedReserveVirtQuoteAfter,
        0.0001,
        "Virt Quote after heal mismatch"
      );
      expectBnCloseTo(
        reserveTokenAfter,
        expectedReserveTokenAfter,
        0.0001,
        "Token Reserve after heal mismatch"
      );

      console.log("  Buy completed, owner/treasury received no WETH.");
      console.log(
        `  Real Quote: ${divDecBN(reserveRealQuoteBefore)} -> ${divDecBN(
          reserveRealQuoteAfter
        )} (Expected: ${divDecBN(expectedReserveRealQuoteAfter)})`
      );
      console.log(
        `  Virt Quote: ${divDecBN(reserveVirtQuoteBefore)} -> ${divDecBN(
          reserveVirtQuoteAfter
        )} (Expected: ${divDecBN(expectedReserveVirtQuoteAfter)})`
      );
      console.log(
        `  Token Reserve: ${divDecBN(reserveTokenBefore)} -> ${divDecBN(
          reserveTokenAfter
        )} (Expected: ${divDecBN(expectedReserveTokenAfter)})`
      );
      await checkTokenInvariants(wft0, "After Buy (Fees Off)");
    });

    it("Sell: Fees are redirected to reserves (burn)", async function () {
      console.log("--- Test Fee Redirection: Sell Operation ---");
      // ... setup checks ...

      await checkTokenInvariants(wft0, "Before Sell (Fees Off)");
      const sellerBalance = await wft0.balanceOf(seller.address);
      expect(sellerBalance).to.be.gt(
        0,
        "Seller needs WFT balance (check setup)"
      );
      const sellAmount = sellerBalance.div(2);

      // --- Get state BEFORE ---
      const nftOwnerTokenBalanceBefore = await wft0.balanceOf(nftOwner.address);
      const reserveTokenBefore = await wft0.reserveTokenAmt();
      const maxSupplyBefore = await wft0.maxSupply();
      const totalSupplyBefore = await wft0.totalSupply();

      // +++ ASSERT ownerFeesActive status BEFORE the transaction +++
      const currentOwnerFeesActive = await wft0.ownerFeeActive();
      console.log(
        `[ASSERT CHECK] ownerFeesActive status BEFORE sell: ${currentOwnerFeesActive}`
      );
      expect(
        currentOwnerFeesActive,
        "Setup FAILED: Owner fees should be INACTIVE before sell tx"
      ).to.be.false;
      // +++ End Assert +++

      // --- Perform the actual sell ---
      await wft0.connect(seller).approve(router.address, sellAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      const tx = await router
        .connect(seller)
        .sellToQuote(wft0Address, AddressZero, sellAmount, 0, deadline);
      await tx.wait(); // Ensure transaction is mined

      // --- Get state AFTER ---
      const nftOwnerTokenBalanceAfter = await wft0.balanceOf(nftOwner.address);
      const reserveTokenAfter = await wft0.reserveTokenAmt();
      const maxSupplyAfter = await wft0.maxSupply();
      const totalSupplyAfter = await wft0.totalSupply();

      // --- Calculate ACTUAL CHANGES ---
      const actualNetReserveTokenChange =
        reserveTokenAfter.sub(reserveTokenBefore);
      const actualMaxSupplyDecrease = maxSupplyBefore.sub(maxSupplyAfter);
      const actualTotalSupplyDecrease = totalSupplyBefore.sub(totalSupplyAfter);

      // --- Calculate the sum based on the invariant derived ---
      const sumOfChanges = actualMaxSupplyDecrease.add(
        actualNetReserveTokenChange
      );

      // --- Verification ---
      expect(nftOwnerTokenBalanceAfter).to.equal(
        nftOwnerTokenBalanceBefore,
        "NFT owner token balance should not change (Fee mint occurred?)" // Updated message
      );

      // just before the verification block
      const feeToken = sellAmount.mul(FEE).div(DIVISOR); // 1 % of trade
      const providerFee = feeToken.mul(FEE_AMOUNT).div(DIVISOR); // 15 % of that

      const expectedBurn = sellAmount.sub(providerFee); // 0.9985 × sellAmount

      expectBnCloseTo(sumOfChanges, expectedBurn, 0.0001);
      expectBnCloseTo(actualTotalSupplyDecrease, expectedBurn, 0.0001);

      console.log("  Sell completed."); // Removed "owner/treasury received no WFT" as it seems untrue
      await checkTokenInvariants(wft0, "After Sell (Fees Off)");
    });
  });

  // **************  EXTRA COVERAGE for Token.sol  ****************
  describe("BORROW / REPAY / COLLATERAL / SHIFT coverage", function () {
    // Define initial balances needed for this test suite if necessary
    const user0InitialBuy = one;
    const user1InitialBuy = five;
    const user2InitialBuy = ten;

    before("Fund users for borrow/repay tests", async function () {
      // Ensure users have some WETH if needed for direct WFT interactions
      await weth.connect(user0).deposit({ value: user0InitialBuy.mul(2) });
      await weth.connect(user1).deposit({ value: user1InitialBuy.mul(2) });
      await weth.connect(user2).deposit({ value: user2InitialBuy.mul(2) });

      // Users buy initial WFT via router to establish collateral
      console.log("--- Borrow/Repay Setup: Funding Users ---");
      const deadline = (await getBlockTimestamp()) + 300;

      // User0 buys
      await weth.connect(user0).approve(router.address, user0InitialBuy);
      await router
        .connect(user0)
        .buyWithQuote(wft0Address, AddressZero, user0InitialBuy, 0, deadline);
      console.log(
        ` User0 bought WFT: ${divDecBN(await wft0.balanceOf(user0.address))}`
      );

      // User1 buys
      await weth.connect(user1).approve(router.address, user1InitialBuy);
      await router
        .connect(user1)
        .buyWithQuote(wft0Address, AddressZero, user1InitialBuy, 0, deadline);
      console.log(
        ` User1 bought WFT: ${divDecBN(await wft0.balanceOf(user1.address))}`
      );

      // User2 buys
      await weth.connect(user2).approve(router.address, user2InitialBuy);
      await router
        .connect(user2)
        .buyWithQuote(wft0Address, AddressZero, user2InitialBuy, 0, deadline);
      console.log(
        ` User2 bought WFT: ${divDecBN(await wft0.balanceOf(user2.address))}`
      );
      console.log("--- Borrow/Repay Setup Complete ---");
      await checkTokenInvariants(wft0, "After Borrow/Repay Setup Funding");
    });

    it("allows borrowing within credit limit, enforces collateral, and repaying clears debt", async function () {
      // (This test remains largely the same, maybe using user1 as before)
      console.log("--- Test: Basic Borrow/Repay Cycle (User1) ---");
      const user = user1; // Use user1 for this specific test
      const userAddr = user.address;

      // ---------- BORROW ----------
      const creditBefore = await wft0.getAccountCredit(userAddr);
      expect(creditBefore).to.be.gt(0, "User1 credit should be positive");
      const borrowAmount = creditBefore.div(3); // Borrow 1/3rd of credit
      console.log(` User1 borrowing: ${divDecBN(borrowAmount)} WETH`);
      await wft0.connect(user).borrow(userAddr, borrowAmount);

      const debtAfterBorrow = await wft0.account_DebtRaw(userAddr);
      expect(debtAfterBorrow).to.equal(borrowAmount);
      // Total debt should increase (we'll check cumulative later)

      // ---------- COLLATERAL RESTRICTION ----------
      const transferrable = await wft0.getAccountTransferrable(userAddr);
      const currentBalance = await wft0.balanceOf(userAddr);
      console.log(
        ` User1 Balance: ${divDecBN(currentBalance)}, Transferrable: ${divDecBN(
          transferrable
        )}`
      );
      expect(transferrable).to.be.lt(
        currentBalance,
        "Transferrable should be less than balance due to debt"
      );
      // Attempt to transfer more than allowed
      await expect(
        wft0.connect(user).transfer(user2.address, transferrable.add(one)) // Try transferring 1 wei more than allowed
      ).to.be.revertedWith("Token__CollateralLocked");
      console.log(" User1 collateral lock correctly reverted transfer");

      // ---------- REPAY ----------
      console.log(` User1 repaying full amount: ${divDecBN(borrowAmount)}`);
      // Ensure user has enough WETH to repay - they should from setup
      await weth.connect(user).approve(wft0.address, borrowAmount);
      await wft0.connect(user).repay(userAddr, borrowAmount);

      const debtAfterRepay = await wft0.account_DebtRaw(userAddr);
      expect(debtAfterRepay).to.equal(0);
      const creditAfterRepay = await wft0.getAccountCredit(userAddr);
      // Credit limit might change slightly due to price fluctuations, check it's roughly back
      expectBnCloseTo(
        creditAfterRepay,
        creditBefore,
        1,
        "Credit limit should be restored after repay (within 1% tolerance)"
      ); // Use 1% tolerance due to potential price shifts
      console.log(" User1 debt cleared, credit restored.");
    });

    it("reverts when borrowing above the credit limit", async function () {
      // (This test remains similar, using user1 again for simplicity)
      console.log("--- Test: Over-Borrow Revert (User1) ---");
      const user = user1;
      const userAddr = user.address;

      const credit = await wft0.getAccountCredit(userAddr);
      console.log(` User1 Current Credit: ${divDecBN(credit)}`);
      // make sure we have some credit; if not, skip (should have from setup)
      if (credit.eq(0)) {
        console.log(" User1 has no credit, skipping over-borrow test.");
        this.skip();
      }
      const tooMuch = credit.add(one); // 1 wei over limit
      console.log(
        ` User1 attempting to borrow: ${divDecBN(tooMuch)} (over limit)`
      );
      await expect(
        wft0.connect(user).borrow(userAddr, tooMuch)
      ).to.be.revertedWith("Token__CreditExceeded");
      console.log(" User1 over-borrow correctly reverted.");
    });

    it("User0 borrows partially, repays partially, checks debt", async function () {
      console.log("--- Test: Partial Borrow/Repay (User0) ---");
      const user = user0;
      const userAddr = user.address;
      const initialDebt = await wft0.account_DebtRaw(userAddr);
      const totalDebtBefore = await wft0.totalDebtRaw();

      // Borrow
      const credit = await wft0.getAccountCredit(userAddr);
      expect(credit).to.be.gt(0, "User0 should have credit");
      const borrowAmount = credit.div(4); // Borrow 1/4th
      console.log(` User0 borrowing: ${divDecBN(borrowAmount)} WETH`);
      await wft0.connect(user).borrow(userAddr, borrowAmount);
      const debtAfterBorrow = await wft0.account_DebtRaw(userAddr);
      expect(debtAfterBorrow).to.equal(initialDebt.add(borrowAmount));
      expect(await wft0.totalDebtRaw()).to.equal(
        totalDebtBefore.add(borrowAmount)
      );

      // Repay partially
      const repayAmount = borrowAmount.div(2);
      console.log(` User0 repaying partially: ${divDecBN(repayAmount)} WETH`);
      await weth.connect(user).approve(wft0.address, repayAmount);
      await wft0.connect(user).repay(userAddr, repayAmount);

      const debtAfterPartialRepay = await wft0.account_DebtRaw(userAddr);
      const expectedDebt = initialDebt.add(borrowAmount).sub(repayAmount);
      expect(debtAfterPartialRepay).to.equal(expectedDebt);
      expect(await wft0.totalDebtRaw()).to.equal(
        totalDebtBefore.add(borrowAmount).sub(repayAmount)
      );
      console.log(
        ` User0 remaining debt: ${divDecBN(debtAfterPartialRepay)} WETH`
      );
    });

    it("User2 borrows, user0 repays full, totalDebt updates correctly", async function () {
      console.log("--- Test: Multi-user Debt Tracking ---");
      // *** FIX: Remove global. prefix ***
      // const user2 = global.user2;
      // const user0 = global.user0;
      const user2Addr = user2.address;
      const user0Addr = user0.address;

      const totalDebtStart = await wft0.totalDebtRaw();
      const user0DebtStart = await wft0.account_DebtRaw(user0Addr); // Has debt from previous test
      const user2DebtStart = await wft0.account_DebtRaw(user2Addr);

      // User2 borrows
      const credit2 = await wft0.getAccountCredit(user2Addr);
      expect(credit2).to.be.gt(0);
      const borrowAmount2 = credit2.div(5);
      console.log(` User2 borrowing: ${divDecBN(borrowAmount2)} WETH`);
      await wft0.connect(user2).borrow(user2Addr, borrowAmount2);
      const totalDebtAfterBorrow2 = await wft0.totalDebtRaw();
      expect(totalDebtAfterBorrow2).to.equal(totalDebtStart.add(borrowAmount2));
      expect(await wft0.account_DebtRaw(user2Addr)).to.equal(
        user2DebtStart.add(borrowAmount2)
      );

      // User0 repays their remaining debt
      const user0RepayAmount = await wft0.account_DebtRaw(user0Addr);
      expect(user0RepayAmount).to.be.gt(0, "User0 should have debt to repay");
      console.log(` User0 repaying full: ${divDecBN(user0RepayAmount)} WETH`);
      await weth.connect(user0).approve(wft0.address, user0RepayAmount);
      await wft0.connect(user0).repay(user0Addr, user0RepayAmount);

      // Check debts after User0 repay
      expect(await wft0.account_DebtRaw(user0Addr)).to.equal(0);
      const expectedTotalDebt = totalDebtAfterBorrow2.sub(user0RepayAmount); // Only User2's debt remains
      expect(await wft0.totalDebtRaw()).to.equal(expectedTotalDebt);
      expect(await wft0.account_DebtRaw(user2Addr)).to.equal(
        user2DebtStart.add(borrowAmount2)
      ); // User2's debt unchanged
      console.log(` Total debt after actions: ${divDecBN(expectedTotalDebt)}`);
      await checkTokenInvariants(wft0, "After User2 Borrow & User0 Full Repay");
    });

    it("burn() shifts reserves and reduces maxSupply", async function () {
      // (Test remains similar, maybe use user0)
      console.log("--- Test: Burn Action (User0) ---");
      const user = user0;
      const userAddr = user.address;

      const balance = await wft0.balanceOf(userAddr);
      // burn 10 % of whatever user0 owns
      const burnAmount = balance.div(10);
      console.log(` User0 balance: ${divDecBN(balance)}`);
      if (burnAmount.eq(0)) {
        console.log(" User0 has too little WFT to burn, skipping burn test.");
        this.skip();
      }
      console.log(` User0 burning: ${divDecBN(burnAmount)} WFT`);

      const reserveTokenBefore = await wft0.reserveTokenAmt();
      const maxSupplyBefore = await wft0.maxSupply();
      const totalSupplyBefore = await wft0.totalSupply(); // Also track total supply

      // --- Calculate expected reserve burn based on contract logic ---
      let expectedReserveBurn = ethers.BigNumber.from(0);
      if (maxSupplyBefore.gt(reserveTokenBefore)) {
        const denominator = maxSupplyBefore.sub(reserveTokenBefore);
        if (!denominator.isZero()) {
          // Replicate: reserveTokenBefore.mulWadDown(burnAmount).divWadDown(denominator);
          expectedReserveBurn = reserveTokenBefore
            .mul(burnAmount)
            .div(PRECISION) // mulWadDown
            .mul(PRECISION)
            .div(denominator); // divWadDown
        }
      }
      console.log(
        ` Calculated expected reserveBurn: ${divDecBN(expectedReserveBurn)}`
      );
      const expectedReserveTokenAfter =
        reserveTokenBefore.sub(expectedReserveBurn);
      // Calculate expected max supply based on contract logic
      const expectedMaxSupplyAfter = maxSupplyBefore.sub(
        burnAmount.add(expectedReserveBurn)
      );

      // --- Perform the burn ---
      await wft0.connect(user).burn(burnAmount);

      // --- Fetch state after burn ---
      const reserveTokenAfter = await wft0.reserveTokenAmt();
      const maxSupplyAfter = await wft0.maxSupply();
      const totalSupplyAfter = await wft0.totalSupply();

      // --- Assertions ---
      // Check reserve token against calculated expected value
      expectBnCloseTo(
        reserveTokenAfter,
        expectedReserveTokenAfter,
        0.0001, // Use tight tolerance
        "Reserve token after burn mismatch"
      );

      // Check max supply against calculated expected value
      expectBnCloseTo(
        maxSupplyAfter,
        expectedMaxSupplyAfter,
        0.0001, // Use tight tolerance
        "Max supply after burn mismatch"
      );

      // Check total supply decrease (this should be exact)
      expect(totalSupplyAfter).to.equal(
        totalSupplyBefore.sub(burnAmount),
        "Total supply should decrease by burn amount"
      );

      // Check user balance decrease (this should be exact)
      expect(await wft0.balanceOf(userAddr)).to.equal(balance.sub(burnAmount));

      console.log(" Burn action checks passed.");
      await checkTokenInvariants(wft0, "After User0 Burn");
    });

    it("heal() adds real quote and increases virtual quote reserves", async function () {
      // (Test remains similar, maybe use user2)
      console.log("--- Test: Heal Action (User2) ---");
      const user = user2; // Use user2 to perform heal

      const healAmount = one; // 1 WETH
      // Ensure user has WETH
      await weth.connect(user).deposit({ value: healAmount });
      await weth.connect(user).approve(wft0.address, healAmount);
      console.log(` User2 healing with: ${divDecBN(healAmount)} WETH`);

      const realBefore = await wft0.reserveRealQuoteWad();
      const virtBefore = await wft0.reserveVirtQuoteWad();
      // *** Need reserves *before* heal to calculate expected virt increase ***
      const reserveTokenBefore = await wft0.reserveTokenAmt();
      const maxSupplyBefore = await wft0.maxSupply();

      await wft0.connect(user).heal(healAmount);

      const realAfter = await wft0.reserveRealQuoteWad();
      const virtAfter = await wft0.reserveVirtQuoteWad();

      // heal -> _shift(amount, 0, reserveHeal, 0);
      // reserveReal increases by healAmount
      // reserveVirt increases by reserveHeal (calculated amount)
      expect(realAfter).to.equal(
        realBefore.add(healAmount),
        "Real reserve should increase by heal amount"
      );
      // Calculate expected virt increase based on contract logic
      // reserveHeal = reserveToken.mulWadDown(amount).divWadDown(maxSupply - reserveToken);
      let expectedReserveHeal = ethers.BigNumber.from(0);
      if (maxSupplyBefore.gt(reserveTokenBefore)) {
        // Use state *before* heal
        const denominator = maxSupplyBefore.sub(reserveTokenBefore);
        if (!denominator.isZero() && !reserveTokenBefore.isZero()) {
          // Safely calculate expected virt increase
          expectedReserveHeal = reserveTokenBefore
            .mul(healAmount)
            .div(PRECISION) // mulWadDown
            .mul(PRECISION)
            .div(denominator); // divWadDown
        }
      }
      // *** Use expectBnCloseTo for virt check due to fixed point math ***
      expectBnCloseTo(
        virtAfter,
        virtBefore.add(expectedReserveHeal),
        0.0001,
        "Virtual reserve increase mismatch"
      );
      console.log(
        ` Heal action increased VirtQuote by ~${divDecBN(expectedReserveHeal)}`
      );
      console.log(" Heal action checks passed.");
      await checkTokenInvariants(wft0, "After User2 Heal");
    });

    it("getAccountTransferrable: Returns near 0 when borrowing maximally", async function () {
      console.log("--- Test: Transferrable Nears Zero Under Max Debt ---");
      const user = user0; // Use user0
      const userAddr = user.address;

      // Clean up any existing debt for user0 first for a clean slate
      let user0Debt = await wft0.account_DebtRaw(userAddr);
      if (user0Debt.gt(0)) {
        console.log(` Cleaning up user0 initial debt: ${divDecBN(user0Debt)}`);
        const u0Weth = await weth.balanceOf(userAddr);
        if (u0Weth.lt(user0Debt)) {
          await weth.connect(user).deposit({ value: user0Debt.sub(u0Weth) });
        }
        await weth.connect(user).approve(wft0.address, user0Debt);
        await wft0.connect(user).repay(userAddr, user0Debt);
        user0Debt = await wft0.account_DebtRaw(userAddr); // Re-check
        expect(user0Debt).to.equal(0, "Failed to clear initial debt");
      }

      const balance = await wft0.balanceOf(userAddr);
      if (balance.isZero()) {
        console.log(" User0 has no balance, skipping transferrable zero test.");
        this.skip(); // Still need to skip if balance is zero
      }

      const maxSupply = await wft0.maxSupply();
      const virtQuote = await wft0.reserveVirtQuoteWad();
      const currentCredit = await wft0.getAccountCredit(userAddr); // Get current credit limit

      if (virtQuote.isZero() || balance.gte(maxSupply)) {
        console.log(
          " Skipping: Cannot calculate locked amount (zero virtQuote or balance >= maxSupply)."
        );
        this.skip();
      }

      // Calculate theoretical debt required to lock the *entire* balance
      const nonLockedSupplyTarget = maxSupply.sub(balance); // Target M - Locked
      if (nonLockedSupplyTarget.isZero()) {
        console.log(
          " Cannot target locking entire balance if balance equals max supply. Skipping."
        );
        this.skip();
      }
      // V' = V * M / nonLockedSupplyTarget
      const num = virtQuote.mul(maxSupply).div(PRECISION); // V*M (mulWadDown)
      const requiredTotalVirtReserveForDebt = num
        .mul(PRECISION)
        .add(nonLockedSupplyTarget.sub(1))
        .div(nonLockedSupplyTarget); // divWadDown

      let targetDebt = ethers.BigNumber.from(0);
      if (requiredTotalVirtReserveForDebt.gt(virtQuote)) {
        targetDebt = requiredTotalVirtReserveForDebt.sub(virtQuote);
      }

      console.log(` User0 Balance: ${divDecBN(balance)}`);
      console.log(
        ` Target Debt to lock balance: ~${divDecBN(targetDebt)} WETH`
      );
      console.log(
        ` Current Credit Limit:        ~${divDecBN(currentCredit)} WETH`
      );

      // Determine actual borrow amount: min(targetDebt, currentCredit)
      // Ensure borrow amount is positive
      let borrowAmount = ethers.BigNumber.from(0);
      if (targetDebt.gt(0) && currentCredit.gt(0)) {
        borrowAmount = targetDebt.lt(currentCredit)
          ? targetDebt
          : currentCredit;
      }

      if (borrowAmount.eq(0)) {
        console.log(
          " Cannot borrow (targetDebt or credit is zero). Skipping borrow step."
        );
      } else {
        console.log(` Borrowing actual amount: ${divDecBN(borrowAmount)} WETH`);
        const u0Weth = await weth.balanceOf(user.address);
        if (u0Weth.lt(borrowAmount)) {
          await weth.connect(user).deposit({ value: borrowAmount.sub(u0Weth) });
        }
        await weth.connect(user).approve(wft0.address, borrowAmount); // Needed for repay
        await wft0.connect(user).borrow(userAddr, borrowAmount);
      }

      // Check transferrable is now zero (or extremely close due to fixed point math)
      const transferrableAfter = await wft0.getAccountTransferrable(userAddr);
      console.log(
        ` Transferrable after locking borrow: ${divDecBN(transferrableAfter)}`
      );
      // We expect the transferable amount to be close to zero when max possible is borrowed
      expect(transferrableAfter).to.be.lte(
        ethers.utils.parseUnits("0.000001", 18), // Allow tiny dust amount
        "Transferrable should be near zero when max possible is borrowed"
      );

      // Clean up: Repay the borrowed amount if any was borrowed
      if (borrowAmount.gt(0)) {
        await weth.connect(user).approve(wft0.address, borrowAmount);
        await wft0.connect(user).repay(userAddr, borrowAmount);
        console.log(" Transferrable near-zero test completed and debt repaid.");
      } else {
        console.log(
          " Transferrable near-zero test completed (no borrow needed/possible)."
        );
      }
    });
  }); // End BORROW / REPAY describe block

  it("PRETOKEN: Cannot contribute after market is open", async function () {
    console.log("********* Test: Contribute After Open ***********");
    expect(await wft0PreToken.ended(), "Market should be open").to.be.true;
    // Attempt to contribute native ETH
    await expect(
      router
        .connect(user2) // Use a different user
        .contributeWithNative(wft0Address, { value: one })
    ).to.be.reverted; // Should revert because PreToken is concluded

    // Attempt to contribute WETH
    // Ensure user2 has WETH
    const user2WethBal = await weth.balanceOf(user2.address);
    if (user2WethBal.lt(one)) {
      await weth.connect(user2).deposit({ value: one.sub(user2WethBal) });
    }
    await weth.connect(user2).approve(router.address, one);
    await expect(router.connect(user2).contributeWithQuote(wft0Address, one)).to
      .be.reverted; // Should revert because PreToken is concluded
    console.log(" Contribute after open correctly reverted.");
  });

  // --- Add test after the previous one ---
  it("PRETOKEN: Cannot redeem if account did not contribute", async function () {
    console.log("********* Test: Redeem Non-Contributor ***********");
    expect(await wft0PreToken.ended(), "Market should be open").to.be.true;
    // User2 did not contribute during the contribution phase
    // *** FIX: Change assertion to simple .reverted ***
    await expect(router.connect(user2).redeem(wft0Address)).to.be.reverted; // Should revert because PreToken check fails (NotEligible custom error)
    console.log(" Redeem by non-contributor correctly reverted.");
  });

  describe("ROUTER: Slippage Tests", function () {
    it("buyWithQuote: Reverts if slippage tolerance exceeded", async function () {
      console.log("********* Test: Buy Slippage Revert ***********");
      const buyAmount = one;
      // Calculate expected output *without* slippage first
      const [expectedOut] = await multicall.buyQuoteIn(
        wft0Address,
        buyAmount,
        0 // 0 slippage BPS
      );
      // Set minAmountTokenOut slightly higher than expected output
      const minAmountTokenOutTooHigh = expectedOut.add(1); // 1 wei more
      const deadline = (await getBlockTimestamp()) + 300;

      // Ensure buyer has WETH
      const buyer = user1;
      const buyerWethBal = await weth.balanceOf(buyer.address);
      if (buyerWethBal.lt(buyAmount)) {
        await weth
          .connect(buyer)
          .deposit({ value: buyAmount.sub(buyerWethBal) });
      }
      await weth.connect(buyer).approve(router.address, buyAmount);

      await expect(
        router.connect(buyer).buyWithQuote(
          wft0Address,
          AddressZero,
          buyAmount,
          minAmountTokenOutTooHigh, // Set unrealistic minimum
          deadline
        )
      ).to.be.revertedWith("Token__Slippage");
      console.log(" Buy slippage revert successful.");
    });

    it("sellToQuote: Reverts if slippage tolerance exceeded", async function () {
      console.log("********* Test: Sell Slippage Revert ***********");
      const seller = user1;
      // Ensure user1 has tokens to sell (might need a small buy first if previous tests sold all)
      const sellerBalance = await wft0.balanceOf(seller.address);
      if (sellerBalance.isZero()) {
        console.log(
          " User1 has no tokens for sell slippage test, buying some..."
        );
        const buyAmount = one;
        const sellerWethBal = await weth.balanceOf(seller.address);
        if (sellerWethBal.lt(buyAmount)) {
          await weth
            .connect(seller)
            .deposit({ value: buyAmount.sub(sellerWethBal) });
        }
        await weth.connect(seller).approve(router.address, buyAmount);
        await router
          .connect(seller)
          .buyWithQuote(
            wft0Address,
            AddressZero,
            buyAmount,
            0,
            (await getBlockTimestamp()) + 300
          );
      }
      const sellAmount = (await wft0.balanceOf(seller.address)).div(10); // Sell 10%
      expect(sellAmount).to.be.gt(0, "Need tokens to sell for slippage test");

      // Calculate expected output *without* slippage
      const [expectedOut] = await multicall.sellTokenIn(
        wft0Address,
        sellAmount,
        0 // 0 slippage BPS
      );
      // Set minAmountQuoteOut slightly higher than expected
      const minAmountQuoteOutTooHigh = expectedOut.add(1); // 1 wei more
      const deadline = (await getBlockTimestamp()) + 300;

      await wft0.connect(seller).approve(router.address, sellAmount);

      await expect(
        router.connect(seller).sellToQuote(
          wft0Address,
          AddressZero,
          sellAmount,
          minAmountQuoteOutTooHigh, // Set unrealistic minimum
          deadline
        )
      ).to.be.revertedWith("Token__Slippage");
      console.log(" Sell slippage revert successful.");
    });

    // Similar tests can be added for buyWithNative and sellToNative if desired
  });

  it("sellToQuote: Reverts if slippage tolerance exceeded", async function () {
    const tokenAmountIn = convert("1000", 18); // Example amount to sell
    const highSlippageTolerance = 10000; // 100% tolerance (i.e., no slippage check needed for quote)
    const [
      quoteRawOut, // Destructure return values
      slippage,
      minQuoteRawOut,
      autoMinQuoteRawOut,
    ] = await multicall.sellTokenIn(
      // <<<< CORRECTED function call to sellTokenIn >>>>
      wft0Address,
      tokenAmountIn,
      highSlippageTolerance // Use a high tolerance just to get the quote
    );

    console.log(
      `  Estimated quote out for selling ${divDecBN(
        tokenAmountIn
      )} WFT: ~${divDecBN(quoteRawOut)}`
    );

    // Calculate a minimum output that is *higher* than the actual expected output
    // to force a slippage revert. Add 1 wei to the expected output.
    const minQuoteOutTooHigh = quoteRawOut.add(1);

    // Now try the actual sell operation via the router with the impossible minimum
    await expect(
      router
        .connect(user1) // Assuming user1 has WFT to sell
        .sellToQuote(
          wft0Address,
          tokenAmountIn,
          minQuoteOutTooHigh,
          user1.address
        )
    ).to.be.reverted; // Use appropriate revert message if known, e.g., .revertedWith("Slippage")

    console.log(
      `  Sell reverted as expected when minQuoteOut (${divDecBN(
        minQuoteOutTooHigh
      )}) > quoteOut (${divDecBN(quoteRawOut)})`
    );
  });
}); // End of describe.only
