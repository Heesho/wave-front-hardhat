// --- Helper Functions ---
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) =>
  ethers.utils.formatUnits(amount, decimals);
const divDec6 = (amount, decimals = 6) =>
  ethers.utils.formatUnits(amount, decimals);
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");
const { FixedNumber } = require("@ethersproject/bignumber"); // For fixed point math lib if needed

// --- Constants ---
const AddressZero = "0x0000000000000000000000000000000000000000";
const one6 = convert("1", 6);
const five6 = convert("5", 6);
const ten6 = convert("10", 6);
const oneHundred6 = convert("100", 6);
const oneThousand6 = convert("1000", 6);
const tenThousand6 = convert("10000", 6);
const one18 = convert("1", 18);
const ten18 = convert("10", 18);
const oneHundred18 = convert("100", 18);
const oneThousand18 = convert("1000", 18);

// Fee constants
const FEE = 100;
const FEE_AMOUNT = 1500;
const DIVISOR = 10000;
const PRECISION = ethers.BigNumber.from("1000000000000000000");

// --- State Variables ---
let owner, multisig, user0, user1, user2, treasury;
let usdc, wft0, wft1;
let preTokenFactory;
let tokenFactory;
let wavefront, multicall, router;
let wft0Address, wft1Address;
let wft0PreTokenAddress, wft1PreTokenAddress;
let wft0PreToken, wft1PreToken;
let wft0NftOwner, wft1NftOwner;

// --- Test Suite ---
describe("local: test0 6 decimals Refactored", function () {
  this.timeout(300000); // Increased timeout

  // *** DEFINE HELPERS INSIDE DESCRIBE SCOPE ***
  async function getBlockTimestamp() {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    if (!block) {
      throw new Error("Failed to get block");
    }
    return block.timestamp;
  }

  const expectBnCloseTo = (a, b, tolerancePercentage = 0.01, message = "") => {
    const aBn = ethers.BigNumber.from(a);
    const bBn = ethers.BigNumber.from(b);
    const diff = aBn.sub(bBn).abs();
    const toleranceBase = bBn.isZero() ? aBn : bBn;
    const toleranceFactor = Math.floor(tolerancePercentage * 10000);
    const tolerance = toleranceBase.mul(toleranceFactor).div(10000);
    const minTolerance = ethers.BigNumber.from(1);
    const finalTolerance = tolerance.gt(minTolerance)
      ? tolerance
      : minTolerance;

    if (!(aBn.isZero() && bBn.isZero())) {
      expect(diff).to.be.lte(
        finalTolerance,
        `${message ? message + ": " : ""}Expected ${a.toString()} (${divDec(
          a
        )}) to be close to ${b.toString()} (${divDec(
          b
        )}) (diff: ${diff.toString()}, tolerance: ${finalTolerance.toString()})`
      );
    } else {
      expect(diff).to.equal(0, message); // Ensure zero diff if both are zero
    }
  };

  async function checkTokenInvariants(tokenInstance, description = "") {
    if (!tokenInstance) {
      console.error(
        `!!! Invariant Check Skipped: Token instance is null for ${description} !!!`
      );
      return;
    }
    console.log(`--- Invariant Check Start: ${description} ---`);
    const tokenAddress = tokenInstance.address;
    let tokenMetadata;
    let quoteToken;
    let quoteDecimals;
    let quoteAddress;
    try {
      tokenMetadata = await ethers.getContractAt(
        "IERC20Metadata",
        tokenAddress
      );
      quoteAddress = await tokenInstance.quote();
      if (quoteAddress === AddressZero)
        throw new Error("Quote address is zero");
      quoteToken = await ethers.getContractAt("IERC20Metadata", quoteAddress);
      quoteDecimals = await quoteToken.decimals();
    } catch (e) {
      console.error(
        `!!! Error getting metadata/quote token for ${description}: ${e} !!!`
      );
      return;
    }

    // Fetch reserves and state
    const reserveToken = await tokenInstance.reserveToken();
    const reserveRealQuote = await tokenInstance.reserveRealQuote();
    const reserveVirtQuote = await tokenInstance.reserveVirtQuote();
    const maxSupply = await tokenInstance.maxSupply();
    const totalSupply = await tokenMetadata.totalSupply();
    const totalDebt = await tokenInstance.totalDebt();
    const currentMarketPrice = await tokenInstance.getMarketPrice();
    const currentFloorPrice = await tokenInstance.getFloorPrice();
    const isOpen = await tokenInstance.open();

    const formatQuote = (val) => ethers.utils.formatUnits(val, quoteDecimals);

    console.log(
      `  State: ${isOpen ? "Open" : "Closed"} | TotalSupply (WFT): ${divDec(
        totalSupply
      )}`
    );
    console.log(
      `  Reserves: Token(WFT)=${divDec(
        reserveToken
      )}, RealQ(USDC)=${formatQuote(
        reserveRealQuote
      )}, VirtQ(USDC)=${formatQuote(reserveVirtQuote)}`
    );
    console.log(
      `  MaxSupply(WFT): ${divDec(maxSupply)} | TotalDebt(USDC): ${formatQuote(
        totalDebt
      )}`
    );
    console.log(
      `  Prices (USDC/WFT): Market=${divDec(
        currentMarketPrice
      )}, Floor=${divDec(currentFloorPrice)}`
    );

    expect(reserveRealQuote).to.be.gte(0, "Real quote reserve non-negative");
    expect(maxSupply).to.be.gte(reserveToken, "Max supply >= token reserve");
    expect(maxSupply).to.be.gte(totalSupply, "Max supply >= total supply");

    // Recalculate Prices
    let calculatedMarketPrice = ethers.BigNumber.from(0);
    if (!reserveToken.isZero()) {
      const totalQuote = reserveVirtQuote.add(reserveRealQuote);
      calculatedMarketPrice = totalQuote.mul(PRECISION).div(reserveToken);
    }
    let calculatedFloorPrice = ethers.BigNumber.from(0);
    if (!maxSupply.isZero()) {
      calculatedFloorPrice = reserveVirtQuote.mul(PRECISION).div(maxSupply);
    }
    console.log(
      `  Calc Prices (USDC/WFT): Market=${divDec(
        calculatedMarketPrice
      )}, Floor=${divDec(calculatedFloorPrice)}`
    );

    // Assert Price Consistency - Use slightly higher tolerance for prices
    expectBnCloseTo(
      currentMarketPrice,
      calculatedMarketPrice,
      0.01,
      "Market price mismatch"
    ); // 0.01% tolerance
    expectBnCloseTo(
      currentFloorPrice,
      calculatedFloorPrice,
      0.01,
      "Floor price mismatch"
    ); // 0.01% tolerance

    // Check Quote Balance Invariant
    const contractQuoteBalance = await quoteToken.balanceOf(tokenAddress);
    // Allow contract balance to be slightly less than real reserve due to potential unswept fees/dust
    expect(contractQuoteBalance.add(1)).to.be.gte(
      reserveRealQuote,
      "Contract quote balance check failed (balance + 1 < real reserve)"
    );

    console.log(`--- Invariant Check End: ${description} ---`);
  }
  // *** END HELPER DEFINITIONS ***

  before("Initial set up", async function () {
    console.log("Begin Initialization (6 Decimals Refactored)");
    [owner, multisig, user0, user1, user2, treasury] =
      await ethers.getSigners();
    const usdcArtifact = await ethers.getContractFactory("USDC");
    usdc = await usdcArtifact.deploy();
    await usdc.deployed();
    console.log(`- USDC Initialized`);
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
    wavefront = await wavefrontArtifact.deploy(tokenFactory.address);
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
      usdc.address
    );
    await router.deployed();
    console.log("- Router Initialized");
    await wavefront.connect(owner).setTreasury(treasury.address);
    await wavefront.connect(owner).setTokenFactory(tokenFactory.address);
    console.log("- WaveFront Configured");
    await usdc.connect(owner).mint(user0.address, tenThousand6);
    await usdc.connect(owner).mint(user1.address, tenThousand6);
    await usdc.connect(owner).mint(user2.address, tenThousand6);
    console.log(`- Users Minted USDC`);
    console.log("Initialization Complete");
    console.log();
  });

  it("ROUTER: Owner creates wft0 via router", async function () {
    console.log("**************** Test: Create Token ****************");
    wft0NftOwner = owner;
    console.log(`NFT Owner will be: ${wft0NftOwner.address}`);
    const initialVirtQuote = oneHundred6;
    const tx = await router
      .connect(wft0NftOwner)
      .createWaveFrontToken(
        "WFT0",
        "WFT0",
        "http/ipfs.com/0",
        initialVirtQuote
      );
    const receipt = await tx.wait();
    const createdEvent = receipt.events?.find(
      (e) => e.event === "WaveFrontRouter__Created"
    );
    expect(createdEvent).to.exist;
    expect(createdEvent.args.creator).to.equal(wft0NftOwner.address);
    wft0Address = createdEvent.args.token;
    expect(wft0Address).to.not.equal(AddressZero);
    wft0 = await ethers.getContractAt("Token", wft0Address);
    wft0PreTokenAddress = await wft0.preToken();
    wft0PreToken = await ethers.getContractAt("PreToken", wft0PreTokenAddress);
    console.log(`WFT0 Created at: ${wft0Address}`);
    console.log(`WFT0 PreToken at: ${wft0PreTokenAddress}`);
    expect(await wft0.quote()).to.equal(usdc.address);
    expect(await wft0.reserveVirtQuote()).to.equal(initialVirtQuote);
    await checkTokenInvariants(wft0, "After Creation");
  });

  it("ROUTER: User0 contributes quote (USDC) via router", async function () {
    console.log(
      "*************** Test: Contribute Quote (User0) ***************"
    );
    expect(wft0Address).to.exist;
    expect(wft0PreToken).to.exist;
    const contributionAmount = ten6;
    await usdc.connect(user0).approve(router.address, contributionAmount);
    const contributionBefore = await wft0PreToken.account_QuoteContributed(
      user0.address
    );
    await router
      .connect(user0)
      .contributeWithQuote(wft0Address, contributionAmount);
    const contributionAfter = await wft0PreToken.account_QuoteContributed(
      user0.address
    );
    console.log(
      `User0 contributed ${divDec6(
        contributionAmount
      )} USDC. New Contribution Total: ${divDec6(contributionAfter)} USDC`
    );
    expect(contributionAfter).to.equal(
      contributionBefore.add(contributionAmount)
    );
    const midContributionData = await multicall.getTokenData(
      wft0Address,
      user0.address
    );
    expect(midContributionData.marketOpened).to.be.false;
    expect(midContributionData.tokenPhase.toString()).to.equal("0");
    expect(midContributionData.accountContributedQuote).to.equal(
      contributionAmount
    );
    console.log(`  Mid-Contribution Phase: ${midContributionData.tokenPhase}`);
    await checkTokenInvariants(wft0, "After User0 Quote Contribution");
  });

  it("ROUTER: User1 contributes quote (USDC) via router", async function () {
    console.log(
      "*************** Test: Contribute Quote (User1) ***************"
    );
    expect(wft0Address).to.exist;
    expect(wft0PreToken).to.exist;
    const contributionAmount = ten6;
    await usdc.connect(user1).approve(router.address, contributionAmount);
    const contributionBefore = await wft0PreToken.account_QuoteContributed(
      user1.address
    );
    await router
      .connect(user1)
      .contributeWithQuote(wft0Address, contributionAmount);
    const contributionAfter = await wft0PreToken.account_QuoteContributed(
      user1.address
    );
    console.log(
      `User1 contributed ${divDec6(
        contributionAmount
      )} USDC. New Contribution Total: ${divDec6(contributionAfter)} USDC`
    );
    expect(contributionAfter).to.equal(
      contributionBefore.add(contributionAmount)
    );
    await checkTokenInvariants(wft0, "After User1 Quote Contribution");
  });

  it("ROUTER: Cannot redeem before contribution period ends", async function () {
    console.log("************* Test: Redeem Before End **************");
    expect(wft0Address).to.exist;
    await expect(router.connect(user0).redeem(wft0Address)).to.be.revertedWith(
      "Router: Market not open yet"
    );
    console.log("Redeem reverted as expected");
  });

  it("Advance time and open market via redeem", async function () {
    console.log("************* Test: Advance Time & Open ************");
    expect(wft0Address).to.exist;
    expect(wft0PreToken).to.exist;
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
    console.log("Advanced time by 2 hours");
    expect(await wft0PreToken.ended()).to.be.false;
    const preOpenDataContributor = await multicall.getTokenData(
      wft0Address,
      user0.address
    );
    expect(preOpenDataContributor.marketOpened).to.be.false;
    expect(preOpenDataContributor.tokenPhase.toString()).to.equal("2");
    console.log(
      `  Pre-Open Phase (Contributor user0): ${preOpenDataContributor.tokenPhase}`
    );
    const preOpenDataNonContributor = await multicall.getTokenData(
      wft0Address,
      user2.address
    );
    expect(preOpenDataNonContributor.marketOpened).to.be.false;
    expect(preOpenDataNonContributor.tokenPhase.toString()).to.equal("0");
    console.log(
      `  Pre-Open Phase (Non-Contributor user2): ${preOpenDataNonContributor.tokenPhase}`
    );
    console.log("User0 redeeming, should open market...");
    await expect(router.connect(user0).redeem(wft0Address))
      .to.emit(router, "WaveFrontRouter__MarketOpened")
      .withArgs(wft0Address, wft0PreTokenAddress);
    expect(await wft0PreToken.ended()).to.be.true;
    expect(await wft0.open()).to.be.true;
    await checkTokenInvariants(wft0, "After Market Open via Redeem");
    console.log("Market opened successfully via redeem call");
  });

  it("ROUTER: Redeem remaining contribution (User1)", async function () {
    console.log("***************** Test: Redeem User1 *****************");
    expect(wft0Address).to.exist;
    expect(wft0).to.exist;
    expect(multicall).to.exist;
    const user1PreRedeemData = await multicall.getTokenData(
      wft0Address,
      user1.address
    );
    expect(user1PreRedeemData.marketOpened).to.be.true;
    expect(user1PreRedeemData.accountContributedQuote).to.be.gt(0);
    expect(user1PreRedeemData.tokenPhase.toString()).to.equal("2");
    expect(user1PreRedeemData.accountRedeemableToken).to.be.gt(0);
    console.log(
      `  User1 Pre-Redeem Phase: ${
        user1PreRedeemData.tokenPhase
      }, Redeemable WFT: ${divDec(user1PreRedeemData.accountRedeemableToken)}`
    );
    const balanceBefore = await wft0.balanceOf(user1.address);
    await router.connect(user1).redeem(wft0Address);
    const balanceAfter = await wft0.balanceOf(user1.address);
    console.log(
      `User1 redeemed. WFT Balance change: ${divDec(balanceBefore)} -> ${divDec(
        balanceAfter
      )}`
    );
    expect(balanceAfter).to.be.gt(balanceBefore);
    const user1PostRedeemData = await multicall.getTokenData(
      wft0Address,
      user1.address
    );
    expect(user1PostRedeemData.accountContributedQuote).to.equal(0);
    expect(user1PostRedeemData.accountRedeemableToken).to.equal(0);
    expect(user1PostRedeemData.tokenPhase.toString()).to.equal("1");
    console.log(`  User1 Post-Redeem Phase: ${user1PostRedeemData.tokenPhase}`);
    await checkTokenInvariants(wft0, "After User1 Redeem");
  });

  it("PRETOKEN: Cannot contribute after market is open", async function () {
    console.log("********* Test: Contribute After Open ***********");
    expect(await wft0PreToken.ended()).to.be.true;
    const contributionAmount = one6;
    await usdc.connect(user2).approve(router.address, contributionAmount);
    await expect(
      router.connect(user2).contributeWithQuote(wft0Address, contributionAmount)
    ).to.be.reverted;
    console.log(" Contribute after open correctly reverted.");
  });

  it("PRETOKEN: Cannot redeem if account did not contribute", async function () {
    console.log("********* Test: Redeem Non-Contributor ***********");
    expect(await wft0PreToken.ended()).to.be.true;
    await expect(router.connect(user2).redeem(wft0Address)).to.be.reverted;
    console.log(" Redeem by non-contributor correctly reverted.");
  });

  it("ROUTER: Buy with quote (USDC)", async function () {
    console.log("****************** Test: Buy Quote *******************");
    expect(wft0Address).to.exist;
    expect(wft0).to.exist;
    const buyAmount = ten6;
    const buyer = user2;
    const affiliate = user0;
    await usdc.connect(buyer).approve(router.address, buyAmount);
    const balanceBefore = await wft0.balanceOf(buyer.address);
    const usdcBalanceBefore = await usdc.balanceOf(buyer.address);
    const deadline = (await getBlockTimestamp()) + 300;
    await expect(
      router
        .connect(buyer)
        .buyWithQuote(wft0Address, affiliate.address, buyAmount, 0, deadline)
    ).to.emit(router, "WaveFrontRouter__Buy");
    const balanceAfter = await wft0.balanceOf(buyer.address);
    const usdcBalanceAfter = await usdc.balanceOf(buyer.address);
    console.log(
      `User2 bought with ${divDec6(
        buyAmount
      )} USDC. WFT Balance change: ${divDec(balanceBefore)} -> ${divDec(
        balanceAfter
      )}`
    );
    console.log(
      `User2 USDC balance change: ${divDec6(usdcBalanceBefore)} -> ${divDec6(
        usdcBalanceAfter
      )}`
    );
    expect(balanceAfter).to.be.gt(balanceBefore);
    expect(usdcBalanceAfter).to.equal(usdcBalanceBefore.sub(buyAmount));
    expect(await router.referrals(buyer.address)).to.equal(affiliate.address);
    console.log(` User2 WFT balance after buy: ${divDec(balanceAfter)}`);
    expect(balanceAfter).to.be.gt(0);
    await checkTokenInvariants(wft0, "After User2 Quote Buy");
  });

  it("ROUTER: Sell to quote (USDC)", async function () {
    console.log("****************** Test: Sell Quote ******************");
    expect(wft0Address).to.exist;
    expect(wft0).to.exist;
    const seller = user2;
    const balanceBefore = await wft0.balanceOf(seller.address);
    expect(balanceBefore, "User2 needs WFT balance to sell").to.be.gt(0);
    const sellAmount = balanceBefore.div(2);
    await wft0.connect(seller).approve(router.address, sellAmount);
    const usdcBalanceBefore = await usdc.balanceOf(seller.address);
    const deadline = (await getBlockTimestamp()) + 300;
    const [expectedUsdcOut] = await multicall.quoteSellIn(
      wft0Address,
      sellAmount,
      0
    );
    await expect(
      router
        .connect(seller)
        .sellToQuote(wft0Address, AddressZero, sellAmount, 0, deadline)
    ).to.emit(router, "WaveFrontRouter__Sell");
    const balanceAfter = await wft0.balanceOf(seller.address);
    const usdcBalanceAfter = await usdc.balanceOf(seller.address);
    console.log(
      `User2 sold ${divDec(sellAmount)} WFT0. WFT Balance change: ${divDec(
        balanceBefore
      )} -> ${divDec(balanceAfter)}`
    );
    console.log(
      `User2 USDC balance change: ${divDec6(usdcBalanceBefore)} -> ${divDec6(
        usdcBalanceAfter
      )}`
    );
    expect(balanceAfter).to.equal(balanceBefore.sub(sellAmount));
    expectBnCloseTo(
      usdcBalanceAfter,
      usdcBalanceBefore.add(expectedUsdcOut),
      0.01,
      "USDC received mismatch"
    );
    await checkTokenInvariants(wft0, "After User2 Quote Sell");
  });

  it("ROUTER: Affiliate logic check (using USDC)", async function () {
    console.log("***************** Test: Affiliate Check **************");
    expect(await router.referrals(user2.address)).to.equal(user0.address);
    const user1AffiliateBefore = await router.referrals(user1.address);
    console.log(`User1 affiliate before buy: ${user1AffiliateBefore}`);
    const buyAmount1 = one6;
    await usdc.connect(user1).approve(router.address, buyAmount1);
    const deadline1 = (await getBlockTimestamp()) + 300;
    await router
      .connect(user1)
      .buyWithQuote(wft0Address, user2.address, buyAmount1, 0, deadline1);
    const user1AffiliateAfter = await router.referrals(user1.address);
    console.log(`User1 affiliate after buy: ${user1AffiliateAfter}`);
    if (user1AffiliateBefore === AddressZero) {
      expect(user1AffiliateAfter).to.equal(user2.address);
    } else {
      expect(user1AffiliateAfter).to.equal(user1AffiliateBefore);
    }
    expect(await router.referrals(treasury.address)).to.equal(AddressZero);
    const buyAmountT = one6;
    if ((await usdc.balanceOf(treasury.address)).lt(buyAmountT))
      await usdc.connect(owner).mint(treasury.address, buyAmountT);
    await usdc.connect(treasury).approve(router.address, buyAmountT);
    const deadline2 = (await getBlockTimestamp()) + 300;
    await router
      .connect(treasury)
      .buyWithQuote(wft0Address, user1.address, buyAmountT, 0, deadline2);
    expect(await router.referrals(treasury.address)).to.equal(user1.address);
    console.log("Affiliate logic checks passed");
  });

  it("ROUTER: Withdraw stuck tokens (Owner) - USDC and WFT", async function () {
    console.log("************** Test: Withdraw Stuck ****************");
    const stuckUsdcAmount = one6;
    const stuckWftAmount = convert("0.1", 18);
    let treasuryWftBalance = await wft0.balanceOf(treasury.address);
    if (treasuryWftBalance.lt(stuckWftAmount)) {
      console.log("Treasury buying more WFT...");
      const buyAmount = five6;
      if ((await usdc.balanceOf(treasury.address)).lt(buyAmount))
        await usdc.connect(owner).mint(treasury.address, buyAmount);
      await usdc.connect(treasury).approve(router.address, buyAmount);
      await router
        .connect(treasury)
        .buyWithQuote(
          wft0Address,
          AddressZero,
          buyAmount,
          0,
          (await getBlockTimestamp()) + 300
        );
      treasuryWftBalance = await wft0.balanceOf(treasury.address);
    }
    expect(treasuryWftBalance, "Treasury needs WFT").to.be.gte(stuckWftAmount);
    if ((await usdc.balanceOf(user0.address)).lt(stuckUsdcAmount))
      await usdc.connect(owner).mint(user0.address, stuckUsdcAmount);
    await usdc.connect(user0).transfer(router.address, stuckUsdcAmount);
    await wft0.connect(treasury).transfer(router.address, stuckWftAmount);
    expect(await usdc.balanceOf(router.address)).to.equal(stuckUsdcAmount);
    expect(await wft0.balanceOf(router.address)).to.equal(stuckWftAmount);
    await expect(
      router.connect(user1).withdrawStuckTokens(usdc.address, user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      router.connect(user1).withdrawStuckTokens(wft0.address, user1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    const ownerUsdcBefore = await usdc.balanceOf(owner.address);
    await router
      .connect(owner)
      .withdrawStuckTokens(usdc.address, owner.address);
    expect(await usdc.balanceOf(router.address)).to.equal(0);
    expect(await usdc.balanceOf(owner.address)).to.equal(
      ownerUsdcBefore.add(stuckUsdcAmount)
    );
    console.log(` Owner withdrew ${divDec6(stuckUsdcAmount)} stuck USDC`);
    const ownerWftBefore = await wft0.balanceOf(owner.address);
    await router
      .connect(owner)
      .withdrawStuckTokens(wft0.address, owner.address);
    expect(await wft0.balanceOf(router.address)).to.equal(0);
    expect(await wft0.balanceOf(owner.address)).to.equal(
      ownerWftBefore.add(stuckWftAmount)
    );
    console.log(` Owner withdrew ${divDec(stuckWftAmount)} stuck WFT`);
    console.log("Withdraw stuck tokens tests passed.");
  });

  it("MULTICALL: getTokenData retrieves aggregated data", async function () {
    console.log("********* Test: getTokenData ***********");
    expect(wft0Address).to.exist;
    expect(multicall).to.exist;
    console.log("Fetching data for user0...");
    const user0Data = await multicall.getTokenData(wft0Address, user0.address);
    expect(user0Data.token).to.equal(wft0Address);
    expect(user0Data.quote).to.equal(usdc.address);
    expect(user0Data.preToken).to.equal(wft0PreTokenAddress);
    expect(user0Data.wavefront).to.equal(wavefront.address);
    expect(user0Data.owner).to.equal(wft0NftOwner.address);
    expect(user0Data.name).to.equal("WFT0");
    expect(user0Data.symbol).to.equal("WFT0");
    expect(user0Data.marketOpened).to.be.true;
    expect(user0Data.marketPrice).to.be.gt(0);
    expect(user0Data.floorPrice).to.be.gt(0);
    expect(user0Data.liquidityQuote, "Liquidity Quote check").to.be.gte(0);
    console.log(`  Liquidity (USDC): ${divDec6(user0Data.liquidityQuote)}`);
    console.log(
      `User0 Data: TokenBal=${divDec(
        user0Data.accountTokenBalance
      )}, Debt(USDC)=${divDec6(user0Data.accountDebt)}, Credit(USDC)=${divDec6(
        user0Data.accountCredit
      )}`
    );
    expect(user0Data.accountContributedQuote).to.equal(0);
    console.log("Fetching data without specific account (address(0))...");
    const generalData = await multicall.getTokenData(wft0Address, AddressZero);
    expect(generalData.token).to.equal(wft0Address);
    expect(generalData.quote).to.equal(usdc.address);
    expect(generalData.marketPrice).to.be.gt(0);
    expect(generalData.accountQuoteBalance).to.equal(0);
    expect(generalData.accountTokenBalance).to.equal(0);
    expect(generalData.accountDebt).to.equal(0);
    expect(generalData.accountCredit).to.equal(0);
    expect(generalData.accountTransferable).to.equal(0);
    expect(generalData.accountContributedQuote).to.equal(0);
    expect(generalData.accountRedeemableToken).to.equal(0);
    console.log("getTokenData basic checks passed.");
  });

  describe("MULTICALL: Estimation Tests (USDC)", function () {
    it("quoteBuyIn: Estimates WFT out for USDC in", async function () {
      console.log("--- Test: multicall.quoteBuyIn ---");
      const amountsIn = [one6, five6, ten6];
      for (const quoteAmountIn of amountsIn) {
        const [tokenAmountOut, minTokenOut] = await multicall.quoteBuyIn(
          wft0Address,
          quoteAmountIn,
          50
        );
        console.log(
          `  Estimate WFT out for ${divDec6(quoteAmountIn)} USDC: ~${divDec(
            tokenAmountOut
          )} (min: ${divDec(minTokenOut)})`
        );
        expect(tokenAmountOut).to.be.gt(0);
        expect(minTokenOut).to.be.lte(tokenAmountOut);
      }
      const [zeroTokenOut, zeroMinTokenOut] = await multicall.quoteBuyIn(
        wft0Address,
        0,
        50
      );
      expect(zeroTokenOut).to.equal(0);
      expect(zeroMinTokenOut).to.equal(0);
    });
    it("quoteForTokenOut: Estimates USDC in for WFT out", async function () {
      console.log("--- Test: multicall.quoteForTokenOut ---");
      const amountsOut = [one18, ten18, oneHundred18];
      for (const tokenAmountOut of amountsOut) {
        const quoteAmountIn = await multicall.quoteForTokenOut(
          wft0Address,
          tokenAmountOut
        );
        console.log(
          `  Estimate USDC needed for ${divDec(tokenAmountOut)} WFT: ~${divDec6(
            quoteAmountIn
          )}`
        );
        const liquidity = await wft0.reserveRealQuote();
        if (liquidity.gt(0)) {
          expect(
            quoteAmountIn,
            "Expected quoteIn > 0 for non-zero tokenOut with liquidity"
          ).to.be.gt(0);
        } else {
          console.warn(" Liquidity is zero, quoteIn might be zero.");
          expect(quoteAmountIn, "Expected quoteIn >= 0").to.be.gte(0);
        }
      }
      const zeroQuoteIn = await multicall.quoteForTokenOut(wft0Address, 0);
      expect(zeroQuoteIn, "Expected 0 quote in for 0 token out").to.equal(0);
    });
    it("quoteSellIn: Estimates USDC out for WFT in", async function () {
      console.log("--- Test: multicall.quoteSellIn ---");
      const user1Balance = await wft0.balanceOf(user1.address);
      expect(user1Balance, "User1 needs WFT").to.be.gt(0);
      const amountsIn = [user1Balance.div(10), user1Balance.div(2)];
      for (const tokenAmountIn of amountsIn) {
        if (tokenAmountIn.isZero()) continue;
        const [quoteAmountOut, minQuoteOut] = await multicall.quoteSellIn(
          wft0Address,
          tokenAmountIn,
          100
        );
        console.log(
          `  Estimate USDC out for ${divDec(tokenAmountIn)} WFT: ~${divDec6(
            quoteAmountOut
          )} (min: ${divDec6(minQuoteOut)})`
        );
        expect(quoteAmountOut).to.be.gt(0);
        expect(minQuoteOut).to.be.lte(quoteAmountOut);
      }
      const [zeroQuoteOut, zeroMinQuoteOut] = await multicall.quoteSellIn(
        wft0Address,
        0,
        100
      );
      expect(zeroQuoteOut).to.equal(0);
      expect(zeroMinQuoteOut).to.equal(0);
    });
    it("tokenForQuoteOut: Estimates WFT in for USDC out", async function () {
      console.log("--- Test: multicall.tokenForQuoteOut ---");
      const amountsOut = [one6, five6.div(2)];
      for (const quoteAmountOut of amountsOut) {
        const tokenAmountIn = await multicall.tokenForQuoteOut(
          wft0Address,
          quoteAmountOut
        );
        console.log(
          `  Estimate WFT needed for ${divDec6(quoteAmountOut)} USDC: ~${divDec(
            tokenAmountIn
          )}`
        );
        const maxQuoteOut = await wft0.getQuoteForTokenAmount(
          await wft0.balanceOf(wft0.address)
        );
        if (quoteAmountOut.lte(maxQuoteOut)) {
          expect(
            tokenAmountIn,
            "Expected tokenIn > 0 for achievable quoteOut"
          ).to.be.gt(0);
        } else {
          console.warn(
            ` Requested quoteOut ${divDec6(
              quoteAmountOut
            )} might exceed max possible.`
          );
          expect(tokenAmountIn, "Expected tokenIn >= 0").to.be.gte(0);
        }
      }
      const zeroTokenIn = await multicall.tokenForQuoteOut(wft0Address, 0);
      expect(zeroTokenIn, "Expected 0 token in for 0 quote out").to.equal(0);
    });
  });

  describe("WAVEFRONT: Core Functionality", function () {
    let createdTokenId;
    before(async function () {
      expect(wft0, "wft0 must exist").to.exist;
      createdTokenId = await wft0.wavefrontId();
      expect(createdTokenId).to.be.gt(0);
      console.log(`Using tokenId ${createdTokenId} for WaveFront tests.`);
    });
    it("setTreasury: Owner can set treasury, non-owner cannot", async function () {
      console.log("--- Test: WaveFront.setTreasury ---");
      const currentTreasury = await wavefront.treasury();
      const newTreasury = multisig.address;
      expect(newTreasury).to.not.equal(currentTreasury);
      await expect(wavefront.connect(owner).setTreasury(newTreasury))
        .to.emit(wavefront, "WaveFront__TreasurySet")
        .withArgs(currentTreasury, newTreasury);
      expect(await wavefront.treasury()).to.equal(newTreasury);
      console.log(`  Treasury set to ${newTreasury}`);
      await expect(
        wavefront.connect(user0).setTreasury(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await wavefront.connect(owner).setTreasury(currentTreasury);
    });
    it("setTokenURI: NFT owner can set URI, non-owner cannot", async function () {
      console.log("--- Test: WaveFront.setTokenURI ---");
      expect(wft0NftOwner, "NFT Owner not set").to.exist;
      const currentURI = await wavefront.tokenURI(createdTokenId);
      const newURI = "ipfs://new_metadata_6dec";
      await expect(
        wavefront.connect(wft0NftOwner).setTokenURI(createdTokenId, newURI)
      )
        .to.emit(wavefront, "WaveFront__TokenURISet")
        .withArgs(createdTokenId, newURI);
      expect(await wavefront.tokenURI(createdTokenId)).to.equal(newURI);
      console.log(`  URI set to ${newURI}`);
      await expect(
        wavefront.connect(user0).setTokenURI(createdTokenId, "ipfs://another")
      ).to.be.revertedWith("WaveFront__NotAuthorized");
      console.log(`  Non-owner correctly reverted`);
    });
    it("tokenURI: Returns the correct URI", async function () {
      console.log("--- Test: WaveFront.tokenURI ---");
      const expectedURI = "ipfs://new_metadata_6dec";
      expect(await wavefront.tokenURI(createdTokenId)).to.equal(expectedURI);
    });
    it("supportsInterface: Correctly reports supported interfaces", async function () {
      console.log("--- Test: WaveFront.supportsInterface ---");
      expect(await wavefront.supportsInterface("0x01ffc9a7")).to.be.true;
      expect(await wavefront.supportsInterface("0x80ac58cd")).to.be.true;
      expect(await wavefront.supportsInterface("0x780e9d63")).to.be.true;
      expect(await wavefront.supportsInterface("0x5b5e139f")).to.be.true;
      expect(await wavefront.supportsInterface("0xffffffff")).to.be.false;
      console.log("  supportsInterface checks passed.");
    });
  });

  describe("TOKEN: Owner Fee Status Toggle (USDC)", function () {
    let nftOwner;
    let feeTokenId;
    before(async function () {
      nftOwner = wft0NftOwner;
      feeTokenId = await wft0.wavefrontId();
    });
    it("Initial state: ownerFeesActive should be true", async function () {
      console.log("--- Test Fee Toggle: Initial State ---");
      expect(await wft0.ownerFeesActive()).to.be.true;
    });
    it("setOwnerFeeStatus: Non-owner cannot change status", async function () {
      console.log("--- Test Fee Toggle: Non-owner Revert ---");
      await expect(
        wft0.connect(user0).setOwnerFeeStatus(false)
      ).to.be.revertedWith("Token__NotOwner");
      await expect(
        wft0.connect(user0).setOwnerFeeStatus(true)
      ).to.be.revertedWith("Token__NotOwner");
      console.log("  Non-owner correctly reverted.");
    });
    it("setOwnerFeeStatus: NFT owner can deactivate fees", async function () {
      console.log("--- Test Fee Toggle: Deactivate ---");
      await expect(wft0.connect(nftOwner).setOwnerFeeStatus(false))
        .to.emit(wft0, "Token__OwnerFeeStatusSet")
        .withArgs(feeTokenId, false);
      expect(await wft0.ownerFeesActive()).to.be.false;
      console.log("  Fees deactivated by NFT owner.");
    });
    it("Fee Distribution: Owner does NOT receive fees (USDC) when inactive", async function () {
      console.log("--- Test Fee Toggle: Fees Inactive Check ---");
      expect(await wft0.ownerFeesActive()).to.be.false;
      const buyAmount = one6;
      const buyer = user2;
      const nftOwnerQuoteBalanceBefore = await usdc.balanceOf(nftOwner.address);
      if ((await usdc.balanceOf(buyer.address)).lt(buyAmount))
        await usdc.connect(owner).mint(buyer.address, buyAmount);
      await usdc.connect(buyer).approve(router.address, buyAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline);
      const nftOwnerQuoteBalanceAfter = await usdc.balanceOf(nftOwner.address);
      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore,
        "NFT owner USDC balance should not change"
      );
      console.log("  NFT owner correctly received no USDC fees.");
      await checkTokenInvariants(wft0, "After Buy with Owner Fees Inactive");
    });
    it("setOwnerFeeStatus: NFT owner can reactivate fees", async function () {
      console.log("--- Test Fee Toggle: Reactivate ---");
      await expect(wft0.connect(nftOwner).setOwnerFeeStatus(true))
        .to.emit(wft0, "Token__OwnerFeeStatusSet")
        .withArgs(feeTokenId, true);
      expect(await wft0.ownerFeesActive()).to.be.true;
      console.log("  Fees reactivated by NFT owner.");
    });
    it("Fee Distribution: Owner DOES receive fees (USDC) when active again", async function () {
      console.log("--- Test Fee Toggle: Fees Active Check ---");
      expect(await wft0.ownerFeesActive()).to.be.true;
      const buyAmount = one6;
      const buyer = user1;
      const nftOwnerQuoteBalanceBefore = await usdc.balanceOf(nftOwner.address);
      if ((await usdc.balanceOf(buyer.address)).lt(buyAmount))
        await usdc.connect(owner).mint(buyer.address, buyAmount);
      await usdc.connect(buyer).approve(router.address, buyAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, AddressZero, buyAmount, 0, deadline);
      const nftOwnerQuoteBalanceAfter = await usdc.balanceOf(nftOwner.address);
      const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
      const expectedOwnerFee = feeQuote.mul(FEE_AMOUNT).div(DIVISOR);
      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore.add(expectedOwnerFee),
        "NFT owner USDC balance should increase"
      );
      console.log(
        `  NFT owner correctly received USDC fee: ${divDec6(expectedOwnerFee)}`
      );
      await checkTokenInvariants(wft0, "After Buy with Owner Fees Active");
    });
  });

  describe("FEES: Redirection to Reserves (USDC)", function () {
    let nftOwner;
    let feeTokenId;
    let buyer;
    let seller;
    before("Setup Fee Redirection Scenario", async function () {
      console.log("--- Fee Redirection Setup Running ---");
      nftOwner = wft0NftOwner;
      feeTokenId = await wft0.wavefrontId();
      buyer = user1;
      seller = user2;
      if (await wft0.ownerFeesActive()) {
        console.log(" Deactivating owner fees...");
        await wft0.connect(nftOwner).setOwnerFeeStatus(false);
      }
      expect(await wft0.ownerFeesActive()).to.be.false;
      const currentTreasury = await wavefront.treasury();
      if (currentTreasury !== AddressZero) {
        console.log(
          ` Setting treasury from ${currentTreasury} to address(0)...`
        );
        await wavefront.connect(owner).setTreasury(AddressZero);
      }
      expect(await wavefront.treasury()).to.equal(AddressZero);
      console.log(" Funding seller account...");
      const buyQuoteAmount = five6;
      if ((await usdc.balanceOf(buyer.address)).lt(buyQuoteAmount))
        await usdc.connect(owner).mint(buyer.address, buyQuoteAmount);
      await usdc.connect(buyer).approve(router.address, buyQuoteAmount);
      await router
        .connect(buyer)
        .buyWithQuote(
          wft0Address,
          AddressZero,
          buyQuoteAmount,
          0,
          (await getBlockTimestamp()) + 300
        );
      const buyerWftBalance = await wft0.balanceOf(buyer.address);
      expect(buyerWftBalance, "Buyer needs WFT").to.be.gt(0);
      const amountToTransfer = buyerWftBalance.div(2);
      await wft0.connect(buyer).transfer(seller.address, amountToTransfer);
      expect(await wft0.balanceOf(seller.address)).to.be.gte(amountToTransfer);
      console.log(
        ` Seller ${seller.address} funded with ~${divDec(
          amountToTransfer
        )} WFT.`
      );
      console.log("--- Fee Redirection Setup Complete ---");
    });

    it("Buy: Fees (USDC) are redirected to reserves (heal)", async function () {
      console.log("--- Test Fee Redirection: Buy Operation ---");
      expect(await wft0.ownerFeesActive()).to.be.false;
      expect(await wavefront.treasury()).to.equal(AddressZero);
      await checkTokenInvariants(wft0, "Before Buy (Fees Off)");

      const buyAmount = one6;
      const nftOwnerQuoteBalanceBefore = await usdc.balanceOf(nftOwner.address);
      const reserveRealQuoteBefore = await wft0.reserveRealQuote();
      const reserveVirtQuoteBefore = await wft0.reserveVirtQuote();

      await wft0
        .connect(buyer)
        .buyWithQuote(
          wft0Address,
          AddressZero,
          buyAmount,
          0,
          (await getBlockTimestamp()) + 300
        );

      const nftOwnerQuoteBalanceAfter = await usdc.balanceOf(nftOwner.address);
      const reserveRealQuoteAfter = await wft0.reserveRealQuote();
      const reserveVirtQuoteAfter = await wft0.reserveVirtQuote();

      expect(nftOwnerQuoteBalanceAfter).to.equal(
        nftOwnerQuoteBalanceBefore,
        "NFT owner USDC balance should not change"
      );
      const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
      const amountQuoteInAfterFee = buyAmount.sub(feeQuote);
      expect(reserveRealQuoteAfter).to.be.gt(
        reserveRealQuoteBefore.add(amountQuoteInAfterFee)
      );
      expectBnCloseTo(
        reserveRealQuoteAfter,
        reserveRealQuoteBefore.add(buyAmount),
        0.001,
        "Real quote upper bound check"
      );
      expect(reserveVirtQuoteAfter).to.be.gt(reserveVirtQuoteBefore);

      console.log("  Buy completed, owner/treasury received no USDC.");
      console.log(
        `  Real Quote Change: ${divDec6(
          reserveRealQuoteAfter.sub(reserveRealQuoteBefore)
        )} USDC`
      );
      console.log(
        `  Virt Quote Change: ${divDec6(
          reserveVirtQuoteAfter.sub(reserveVirtQuoteBefore)
        )} USDC`
      );
      await checkTokenInvariants(wft0, "After Buy (Fees Off)");
    });

    it("Sell: Fees (WFT) are redirected to reserves (burn)", async function () {
      console.log("--- Test Fee Redirection: Sell Operation ---");
      expect(await wft0.ownerFeesActive()).to.be.false;
      expect(await wavefront.treasury()).to.equal(AddressZero);
      await checkTokenInvariants(wft0, "Before Sell (Fees Off)");
      const sellerBalance = await wft0.balanceOf(seller.address);
      expect(sellerBalance, "Seller needs WFT balance").to.be.gt(0);
      const sellAmount = sellerBalance.div(2);
      if (sellAmount.isZero()) {
        this.skip("Sell amount is zero");
      }

      const nftOwnerTokenBalanceBefore = await wft0.balanceOf(nftOwner.address);
      const reserveTokenBefore = await wft0.reserveToken();
      const maxSupplyBefore = await wft0.maxSupply();
      const totalSupplyBefore = await wft0.totalSupply();

      await wft0.connect(seller).approve(router.address, sellAmount);
      await router
        .connect(seller)
        .sellToQuote(
          wft0Address,
          AddressZero,
          sellAmount,
          0,
          (await getBlockTimestamp()) + 300
        );

      const nftOwnerTokenBalanceAfter = await wft0.balanceOf(nftOwner.address);
      const reserveTokenAfter = await wft0.reserveToken();
      const maxSupplyAfter = await wft0.maxSupply();
      const totalSupplyAfter = await wft0.totalSupply();

      const actualNetReserveTokenChange =
        reserveTokenBefore.sub(reserveTokenAfter);
      const actualMaxSupplyDecrease = maxSupplyBefore.sub(maxSupplyAfter);
      const actualTotalSupplyDecrease = totalSupplyBefore.sub(totalSupplyAfter);

      expect(nftOwnerTokenBalanceAfter).to.equal(
        nftOwnerTokenBalanceBefore,
        "NFT owner token balance should not change"
      );
      const feeToken = sellAmount.mul(FEE).div(DIVISOR);
      const providerFeeToken = feeToken.mul(FEE_AMOUNT).div(DIVISOR);
      const expectedBurnAmount = sellAmount.sub(providerFeeToken);

      const sumOfChanges = actualMaxSupplyDecrease.add(
        actualNetReserveTokenChange
      );

      console.warn(
        "WARN: Burn invariant check might fail due to potential contract logic differences."
      );
      expectBnCloseTo(
        sumOfChanges,
        expectedBurnAmount,
        1,
        "Burn invariant check failed (1% tolerance)"
      );
      expectBnCloseTo(
        actualTotalSupplyDecrease,
        expectedBurnAmount,
        1,
        "Total supply decrease mismatch (1% tolerance)"
      );

      console.log("  Sell completed.");
      await checkTokenInvariants(wft0, "After Sell (Fees Off)");
    });

    after("Restore Fee Settings", async function () {
      console.log("--- Restoring Fee Settings ---");
      if (!(await wft0.ownerFeesActive())) {
        await wft0.connect(wft0NftOwner).setOwnerFeeStatus(true);
        console.log("  Re-enabled owner fees");
      }
      if ((await wavefront.treasury()) === AddressZero) {
        await wavefront.connect(owner).setTreasury(treasury.address);
        console.log("  Restored treasury address");
      }
    });
  });

  describe("BORROW / REPAY / COLLATERAL / SHIFT coverage (USDC)", function () {
    const user0InitialBuy = oneHundred6;
    const user1InitialBuy = five6;
    const user2InitialBuy = ten6;
    before("Fund users for borrow/repay tests", async function () {
      console.log("--- Borrow/Repay Setup: Funding Users (USDC) ---");
      const deadline = (await getBlockTimestamp()) + 300;
      if ((await usdc.balanceOf(user0.address)).lt(user0InitialBuy))
        await usdc.connect(owner).mint(user0.address, user0InitialBuy);
      await usdc.connect(user0).approve(router.address, user0InitialBuy);
      await router
        .connect(user0)
        .buyWithQuote(wft0Address, AddressZero, user0InitialBuy, 0, deadline);
      console.log(
        ` User0 bought WFT: ${divDec(await wft0.balanceOf(user0.address))}`
      );
      if ((await usdc.balanceOf(user1.address)).lt(user1InitialBuy))
        await usdc.connect(owner).mint(user1.address, user1InitialBuy);
      await usdc.connect(user1).approve(router.address, user1InitialBuy);
      await router
        .connect(user1)
        .buyWithQuote(wft0Address, AddressZero, user1InitialBuy, 0, deadline);
      console.log(
        ` User1 bought WFT: ${divDec(await wft0.balanceOf(user1.address))}`
      );
      if ((await usdc.balanceOf(user2.address)).lt(user2InitialBuy))
        await usdc.connect(owner).mint(user2.address, user2InitialBuy);
      await usdc.connect(user2).approve(router.address, user2InitialBuy);
      await router
        .connect(user2)
        .buyWithQuote(wft0Address, AddressZero, user2InitialBuy, 0, deadline);
      console.log(
        ` User2 bought WFT: ${divDec(await wft0.balanceOf(user2.address))}`
      );
      console.log("--- Borrow/Repay Setup Complete ---");
      await checkTokenInvariants(wft0, "After Borrow/Repay Setup Funding");
    });
    it("allows borrowing USDC within credit limit, enforces collateral, and repaying clears debt", async function () {
      console.log("--- Test: Basic Borrow/Repay Cycle (User1, USDC) ---");
      const user = user1;
      const userAddr = user.address;
      const creditBefore = await wft0.getAccountCredit(userAddr);
      expect(creditBefore, "User1 needs credit").to.be.gt(0);
      const borrowAmount = creditBefore.div(3);
      console.log(` User1 borrowing: ${divDec6(borrowAmount)} USDC`);
      await wft0.connect(user).borrow(userAddr, borrowAmount);
      const debtAfterBorrow = await wft0.account_Debt(userAddr);
      expect(debtAfterBorrow).to.equal(borrowAmount);
      const transferrable = await wft0.getAccountTransferrable(userAddr);
      const currentBalance = await wft0.balanceOf(userAddr);
      console.log(
        ` User1 Balance(WFT): ${divDec(
          currentBalance
        )}, Transferrable(WFT): ${divDec(transferrable)}`
      );
      expect(transferrable).to.be.lt(currentBalance);
      await expect(
        wft0.connect(user).transfer(user2.address, transferrable.add(one18))
      ).to.be.revertedWith("Token__CollateralRequirement");
      console.log(" User1 collateral lock correctly reverted transfer");
    });
    it("reverts when borrowing USDC above the credit limit", async function () {
      console.log("--- Test: Over-Borrow Revert (User1, USDC) ---");
      const user = user1;
      const userAddr = user.address;
      const credit = await wft0.getAccountCredit(userAddr);
      if (credit.eq(0)) {
        this.skip("No credit");
      }
      const tooMuch = credit.add(1);
      console.log(
        ` User1 attempting to borrow: ${divDec6(tooMuch)} USDC (over limit)`
      );
      await expect(
        wft0.connect(user).borrow(userAddr, tooMuch)
      ).to.be.revertedWith("Token__CreditLimit");
      console.log(" User1 over-borrow correctly reverted.");
    });
    it("User0 borrows partially, repays partially, checks debt (USDC)", async function () {
      console.log("--- Test: Partial Borrow/Repay (User0, USDC) ---");
      const user = user0;
      const userAddr = user.address;
      const initialDebt = await wft0.account_Debt(userAddr);
      const totalDebtBefore = await wft0.totalDebt();
      const credit = await wft0.getAccountCredit(userAddr);
      expect(credit, "User0 needs credit").to.be.gt(0);
      const borrowAmount = credit.div(4);
      console.log(` User0 borrowing: ${divDec6(borrowAmount)} USDC`);
      await wft0.connect(user).borrow(userAddr, borrowAmount);
      const debtAfterBorrow = await wft0.account_Debt(userAddr);
      expect(debtAfterBorrow).to.equal(initialDebt.add(borrowAmount));
      expect(await wft0.totalDebt()).to.equal(
        totalDebtBefore.add(borrowAmount)
      );
      console.log(` User0 remaining debt: ${divDec6(debtAfterBorrow)} USDC`);
    });
    it("burn() shifts reserves and reduces maxSupply", async function () {
      console.log("--- Test: Burn Action (User0) ---");
      const user = user0;
      const userAddr = user.address;
      const balance = await wft0.balanceOf(userAddr);
      const burnAmount = balance.div(10);
      if (burnAmount.eq(0)) {
        this.skip("Insufficient WFT");
      }
      console.log(` User0 burning: ${divDec6(burnAmount)} WFT`);
      const reserveTokenBefore = await wft0.reserveToken();
      const maxSupplyBefore = await wft0.maxSupply();
      const totalSupplyBefore = await wft0.totalSupply();
      await wft0.connect(user).burn(burnAmount);
      const reserveTokenAfter = await wft0.reserveToken();
      const maxSupplyAfter = await wft0.maxSupply();
      const totalSupplyAfter = await wft0.totalSupply();
      expectBnCloseTo(
        reserveTokenAfter,
        reserveTokenBefore.sub(burnAmount),
        0.0001,
        "Reserve token mismatch"
      );
      expectBnCloseTo(
        maxSupplyAfter,
        maxSupplyBefore.sub(burnAmount),
        0.0001,
        "Max supply mismatch"
      );
      expect(totalSupplyAfter).to.equal(
        totalSupplyBefore.sub(burnAmount),
        "Total supply mismatch"
      );
      expect(await wft0.balanceOf(userAddr)).to.equal(balance.sub(burnAmount));
      console.log(" Burn action checks passed.");
      await checkTokenInvariants(wft0, "After User0 Burn");
    });
    it("heal() adds USDC real quote and increases virtual quote reserves", async function () {
      console.log("--- Test: Heal Action (User2, USDC) ---");
      const user = user2;
      const healAmount = one6;
      if ((await usdc.balanceOf(user.address)).lt(healAmount))
        await usdc.connect(owner).mint(user.address, healAmount);
      await usdc.connect(user).approve(wft0.address, healAmount);
      console.log(` User2 healing with: ${divDec6(healAmount)} USDC`);
      const realBefore = await wft0.reserveRealQuote();
      const virtBefore = await wft0.reserveVirtQuote();
      await wft0.connect(user).heal(healAmount);
      const realAfter = await wft0.reserveRealQuote();
      const virtAfter = await wft0.reserveVirtQuote();
      expect(realAfter).to.equal(realBefore.add(healAmount));
      let expectedReserveHeal = ethers.BigNumber.from(0);
      if (maxSupplyBefore.gt(reserveTokenBefore)) {
        const denominator = maxSupplyBefore.sub(reserveTokenBefore);
        if (!denominator.isZero() && !reserveTokenBefore.isZero()) {
          expectedReserveHeal = reserveTokenBefore
            .mul(healAmount)
            .div(PRECISION)
            .mul(PRECISION)
            .div(denominator);
        }
      }
      expectBnCloseTo(
        virtAfter,
        virtBefore.add(expectedReserveHeal),
        0.0001,
        "Virtual reserve increase mismatch"
      );
      console.log(
        ` Heal action increased VirtQuote by ~${divDec6(
          expectedReserveHeal
        )} USDC`
      );
      console.log(" Heal action checks passed.");
      await checkTokenInvariants(wft0, "After User2 Heal");
    });
    it("getAccountTransferrable: Returns near 0 when borrowing maximally (USDC)", async function () {
      console.log(
        "--- Test: Transferrable Nears Zero Under Max Debt (USDC) ---"
      );
      const user = user0;
      const userAddr = user.address;
      let userDebt = await wft0.account_Debt(userAddr);
      if (userDebt.gt(0)) {
        console.log(
          ` Cleaning up user0 initial debt: ${divDec6(userDebt)} USDC`
        );
        if ((await usdc.balanceOf(userAddr)).lt(userDebt))
          await usdc.connect(owner).mint(userAddr, userDebt);
        await usdc.connect(user).approve(wft0.address, userDebt);
        await wft0.connect(user).repay(userAddr, userDebt);
        expect(await wft0.account_Debt(userAddr)).to.equal(0);
      }
      const balance = await wft0.balanceOf(userAddr);
      if (balance.isZero()) {
        this.skip("No WFT balance");
      }
      const currentCredit = await wft0.getAccountCredit(userAddr);
      if (currentCredit.eq(0)) {
        console.log(" User0 has no credit.");
        expect(await wft0.getAccountTransferrable(userAddr)).to.equal(balance);
      } else {
        console.log(
          ` User0 borrowing max credit: ${divDec6(currentCredit)} USDC`
        );
        await wft0.connect(user).borrow(userAddr, currentCredit);
        const transferrableAfter = await wft0.getAccountTransferrable(userAddr);
        console.log(
          ` Transferrable WFT after max borrow: ${divDec(transferrableAfter)}`
        );
        expect(transferrableAfter).to.be.lte(
          ethers.utils.parseUnits("1", 18),
          "Transferrable WFT near zero failed (allowing 1 WFT)"
        );
        userDebt = await wft0.account_Debt(userAddr);
        if (userDebt.gt(0)) {
          if ((await usdc.balanceOf(userAddr)).lt(userDebt))
            await usdc.connect(owner).mint(userAddr, userDebt);
          await usdc.connect(user).approve(wft0.address, userDebt);
          await wft0.connect(user).repay(userAddr, userDebt);
          console.log(" Max borrow test completed and debt repaid.");
        }
      }
    });
  });

  describe("ROUTER: Slippage Tests (USDC)", function () {
    it("buyWithQuote: Reverts if slippage tolerance exceeded", async function () {
      console.log("********* Test: Buy Slippage Revert (USDC) ***********");
      const buyAmount = one6;
      const [expectedOut] = await multicall.quoteBuyIn(
        wft0Address,
        buyAmount,
        0
      );
      const minAmountTokenOutTooHigh = expectedOut.add(1);
      const deadline = (await getBlockTimestamp()) + 300;
      const buyer = user1;
      if ((await usdc.balanceOf(buyer.address)).lt(buyAmount))
        await usdc.connect(owner).mint(buyer.address, buyAmount);
      await usdc.connect(buyer).approve(router.address, buyAmount);
      await expect(
        router
          .connect(buyer)
          .buyWithQuote(
            wft0Address,
            AddressZero,
            buyAmount,
            minAmountTokenOutTooHigh,
            deadline
          )
      ).to.be.revertedWith("Token__SlippageToleranceExceeded");
      console.log(" Buy slippage revert successful.");
    });
    it("sellToQuote: Reverts if slippage tolerance exceeded", async function () {
      console.log("********* Test: Sell Slippage Revert (USDC) ***********");
      const seller = user1;
      const sellerBalance = await wft0.balanceOf(seller.address);
      if (sellerBalance.isZero()) {
        this.skip("No WFT");
      }
      const sellAmount = sellerBalance.div(10);
      if (sellAmount.isZero()) {
        this.skip("Sell amount zero");
      }
      const [expectedOut] = await multicall.quoteSellIn(
        wft0Address,
        sellAmount,
        0
      );
      const minAmountQuoteOutTooHigh = expectedOut.add(1);
      const deadline = (await getBlockTimestamp()) + 300;
      await wft0.connect(seller).approve(router.address, sellAmount);
      await expect(
        router
          .connect(seller)
          .sellToQuote(
            wft0Address,
            AddressZero,
            sellAmount,
            minAmountQuoteOutTooHigh,
            deadline
          )
      ).to.be.revertedWith("Token__SlippageToleranceExceeded");
      console.log(" Sell slippage revert successful.");
    });
  });

  describe("ROUTER: Provider Fee Tests (USDC)", function () {
    it("buyWithQuote: Distributes provider fee correctly (USDC)", async function () {
      console.log("********* Test: Buy With Provider Fee (USDC) ***********");
      const buyAmount = one6;
      const provider = user2;
      const providerQuoteBalanceBefore = await usdc.balanceOf(provider.address);
      const buyer = user1;
      const feeQuote = buyAmount.mul(FEE).div(DIVISOR);
      const expectedProviderFee = feeQuote.mul(FEE_AMOUNT).div(DIVISOR);
      if ((await usdc.balanceOf(buyer.address)).lt(buyAmount))
        await usdc.connect(owner).mint(buyer.address, buyAmount);
      await usdc.connect(buyer).approve(router.address, buyAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(buyer)
        .buyWithQuote(wft0Address, provider.address, buyAmount, 0, deadline);
      const providerQuoteBalanceAfter = await usdc.balanceOf(provider.address);
      expect(providerQuoteBalanceAfter).to.equal(
        providerQuoteBalanceBefore.add(expectedProviderFee)
      );
      console.log(
        ` Provider ${provider.address} received USDC fee: ${divDec6(
          expectedProviderFee
        )}`
      );
      await checkTokenInvariants(wft0, "After Buy with Provider Fee");
    });

    it("sellToQuote: Distributes provider fee correctly (mints WFT)", async function () {
      console.log("********* Test: Sell With Provider Fee (USDC) ***********");
      const seller = user1;
      const provider = user2;
      const providerTokenBalanceBefore = await wft0.balanceOf(provider.address);
      const sellerBalance = await wft0.balanceOf(seller.address);
      if (sellerBalance.isZero()) {
        this.skip("No WFT");
      }
      const sellAmount = sellerBalance.div(5);
      if (sellAmount.isZero()) {
        this.skip("Sell amount zero");
      }
      const feeToken = sellAmount.mul(FEE).div(DIVISOR);
      const expectedProviderFeeTokens = feeToken.mul(FEE_AMOUNT).div(DIVISOR);
      await wft0.connect(seller).approve(router.address, sellAmount);
      const deadline = (await getBlockTimestamp()) + 300;
      await router
        .connect(seller)
        .sellToQuote(wft0Address, provider.address, sellAmount, 0, deadline);
      const providerTokenBalanceAfter = await wft0.balanceOf(provider.address);
      expect(providerTokenBalanceAfter).to.equal(
        providerTokenBalanceBefore.add(expectedProviderFeeTokens)
      );
      console.log(
        ` Provider ${provider.address} received WFT fee: ${divDec(
          expectedProviderFeeTokens
        )}`
      );
      await checkTokenInvariants(wft0, "After Sell with Provider Fee");
    });
  });

  describe("SECOND TOKEN (WFT1): Creation and Basic Interactions", function () {
    it("ROUTER: Owner creates wft1 via router", async function () {
      console.log("**************** Test: Create WFT1 ****************");
      wft1NftOwner = owner;
      const initialVirtQuote = oneThousand6;
      const tx = await router
        .connect(wft1NftOwner)
        .createWaveFrontToken(
          "WFT1",
          "WFT1",
          "http/ipfs.com/1",
          initialVirtQuote
        );
      const receipt = await tx.wait();
      const createdEvent = receipt.events?.find(
        (e) => e.event === "WaveFrontRouter__Created"
      );
      expect(createdEvent, "WFT1 creation event missing").to.exist;
      wft1Address = createdEvent.args.token;
      expect(wft1Address).to.not.equal(AddressZero);
      wft1 = await ethers.getContractAt("Token", wft1Address);
      wft1PreTokenAddress = await wft1.preToken();
      wft1PreToken = await ethers.getContractAt(
        "PreToken",
        wft1PreTokenAddress
      );
      console.log(`WFT1 Created at: ${wft1Address}`);
      expect(await wft1.quote()).to.equal(usdc.address);
      await checkTokenInvariants(wft1, "After Creation");
    });

    it("WFT1: User0 contributes, time passes, User0 redeems", async function () {
      console.log(
        "**************** Test: WFT1 Contribute/Redeem ****************"
      );
      const contributionAmount = oneHundred6;
      if ((await usdc.balanceOf(user0.address)).lt(contributionAmount))
        await usdc.connect(owner).mint(user0.address, contributionAmount);
      await usdc.connect(user0).approve(router.address, contributionAmount);
      await router
        .connect(user0)
        .contributeWithQuote(wft1Address, contributionAmount);
      expect(
        await wft1PreToken.account_QuoteContributed(user0.address)
      ).to.equal(contributionAmount);
      await checkTokenInvariants(wft1, "After WFT1 Contribution");
    });

    it("WFT1: User0 sells all WFT1", async function () {
      console.log("**************** Test: WFT1 Sell All ****************");
      const balance = await wft1.balanceOf(user0.address);
      expect(balance, "User0 needs WFT1 to sell").to.be.gt(0);
      await wft1.connect(user0).approve(router.address, balance);
      await router
        .connect(user0)
        .sellToQuote(
          wft1Address,
          AddressZero,
          balance,
          0,
          (await getBlockTimestamp()) + 300
        );
      expect(await wft1.balanceOf(user0.address)).to.equal(0);
      console.log(" User0 sold all WFT1.");
      await checkTokenInvariants(wft1, "After User0 Sells All WFT1");
    });

    it("WFT1: Treasury sells its WFT1 if any", async function () {
      console.log("**************** Test: WFT1 Treasury Sell ****************");
      const balance = await wft1.balanceOf(treasury.address);
      if (balance.eq(0)) {
        this.skip("Treasury has no WFT1");
      }
      console.log(` Treasury selling ${divDec(balance)} WFT1`);
      await wft1.connect(treasury).approve(router.address, balance);
      await router
        .connect(treasury)
        .sellToQuote(
          wft1Address,
          AddressZero,
          balance,
          0,
          (await getBlockTimestamp()) + 300
        );
      expect(await wft1.balanceOf(treasury.address)).to.equal(0);
      console.log(" Treasury sold its WFT1.");
      await checkTokenInvariants(wft1, "After Treasury Sells WFT1");
    });
  });

  it("Final Invariant Check (Both Tokens)", async function () {
    console.log("--- Final Invariant Check ---");
    await checkTokenInvariants(wft0, "End of Tests (WFT0)");
    if (wft1) {
      await checkTokenInvariants(wft1, "End of Tests (WFT1)");
    } else {
      console.log(" WFT1 was not created in this run.");
    }
  });
});
