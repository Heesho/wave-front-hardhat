const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";

let owner, multisig, treasury, user0, user1, user2, user3;
let usdc, usdt, wft0, wft1, wft2, wft3;
let tokenFactory, saleFactory, contentFactory, rewarderFactory;
let wavefront, multicall, router;

describe("local: test2", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, treasury, user0, user1, user2, user3] =
      await ethers.getSigners();

    const usdcArtifact = await ethers.getContractFactory("USDC");
    usdc = await usdcArtifact.deploy();
    usdt = await usdcArtifact.deploy();
    console.log("- USDC Initialized");
    console.log("- USDT Initialized");

    const tokenFactoryArtifact = await ethers.getContractFactory(
      "TokenFactory"
    );
    tokenFactory = await tokenFactoryArtifact.deploy();
    console.log("- TokenFactory Initialized");

    const saleFactoryArtifact = await ethers.getContractFactory("SaleFactory");
    saleFactory = await saleFactoryArtifact.deploy();
    console.log("- SaleFactory Initialized");

    const contentFactoryArtifact = await ethers.getContractFactory(
      "ContentFactory"
    );
    contentFactory = await contentFactoryArtifact.deploy();
    console.log("- ContentFactory Initialized");

    const rewarderFactoryArtifact = await ethers.getContractFactory(
      "RewarderFactory"
    );
    rewarderFactory = await rewarderFactoryArtifact.deploy();
    console.log("- RewarderFactory Initialized");

    const wavefrontArtifact = await ethers.getContractFactory("WaveFront");
    wavefront = await wavefrontArtifact.deploy(
      usdc.address,
      tokenFactory.address,
      saleFactory.address,
      contentFactory.address,
      rewarderFactory.address
    );
    console.log("- WaveFront Initialized");

    const multicallArtifact = await ethers.getContractFactory(
      "WaveFrontMulticall"
    );
    multicall = await multicallArtifact.deploy(wavefront.address);
    console.log("- Multicall Initialized");

    const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
    router = await routerArtifact.deploy(wavefront.address);
    console.log("- Router Initialized");

    const amount = convert("100000", 6);
    await usdc.connect(owner).mint(user0.address, amount);
    await usdc.connect(owner).mint(user1.address, amount);
    await usdc.connect(owner).mint(user2.address, amount);
    await usdc.connect(owner).mint(user3.address, amount);
    console.log("- System set up");

    console.log("Initialization Complete");
    console.log();
  });

  it("User0 creates wft0", async function () {
    console.log("******************************************************");

    const wftName = "wft0";
    const wftSymbol = "wft0";
    const wftUri = "https://wavefront.io/wft0";

    await router.connect(user0).createToken(wftName, wftSymbol, wftUri, false);
    wft0 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft0 created");
  });

  it("User1 creates wft1", async function () {
    console.log("******************************************************");

    const wftName = "wft1";
    const wftSymbol = "wft1";
    const wftUri = "https://wavefront.io/wft1";

    await router.connect(user1).createToken(wftName, wftSymbol, wftUri, false);
    wft1 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft1 created");
  });

  it("User2 creates wft2", async function () {
    console.log("******************************************************");

    const wftName = "wft2";
    const wftSymbol = "wft2";
    const wftUri = "https://wavefront.io/wft2";

    await router.connect(user2).createToken(wftName, wftSymbol, wftUri, false);
    wft2 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft2 created");
  });

  it("User3 creates wft3", async function () {
    console.log("******************************************************");

    const wftName = "wft3";
    const wftSymbol = "wft3";
    const wftUri = "https://wavefront.io/wft3";

    await router.connect(user3).createToken(wftName, wftSymbol, wftUri, false);
    wft3 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft3 created");
  });

  it("wavefront coverage", async function () {
    console.log("******************************************************");
    console.log("quote: ", await wavefront.quote());
    console.log("tokenFactory: ", await wavefront.tokenFactory());
    console.log("saleFactory: ", await wavefront.saleFactory());
    console.log("contentFactory: ", await wavefront.contentFactory());
    console.log("rewarderFactory: ", await wavefront.rewarderFactory());
    console.log("treasury: ", await wavefront.treasury());
    console.log("index: ", await wavefront.index());
    console.log("index_Token[0]: ", await wavefront.index_Token(0));
    console.log("index_Token[1]: ", await wavefront.index_Token(1));
    console.log("index_Token[2]: ", await wavefront.index_Token(2));
    console.log("index_Token[3]: ", await wavefront.index_Token(3));
    console.log(
      "token_Index[wft0]: ",
      await wavefront.token_Index(wft0.address)
    );
    console.log(
      "token_Index[wft1]: ",
      await wavefront.token_Index(wft1.address)
    );
    console.log(
      "token_Index[wft2]: ",
      await wavefront.token_Index(wft2.address)
    );
    console.log(
      "token_Index[wft3]: ",
      await wavefront.token_Index(wft3.address)
    );
    console.log("token_Uri[wft0]: ", await wavefront.token_Uri(wft0.address));
    console.log("token_Uri[wft1]: ", await wavefront.token_Uri(wft1.address));
    console.log("token_Uri[wft2]: ", await wavefront.token_Uri(wft2.address));
    console.log("token_Uri[wft3]: ", await wavefront.token_Uri(wft3.address));

    await wavefront.connect(owner).setTreasury(AddressZero);
    await wavefront.connect(owner).setTreasury(treasury.address);
    await expect(wavefront.connect(user0).setTreasury(treasury.address)).to.be
      .reverted;

    await wavefront.connect(owner).setTokenFactory(AddressZero);
    await wavefront.connect(owner).setTokenFactory(tokenFactory.address);
    await expect(wavefront.connect(user0).setTokenFactory(AddressZero)).to.be
      .reverted;

    await wavefront.connect(owner).setSaleFactory(AddressZero);
    await wavefront.connect(owner).setSaleFactory(saleFactory.address);
    await expect(wavefront.connect(user0).setSaleFactory(AddressZero)).to.be
      .reverted;

    await wavefront.connect(owner).setContentFactory(AddressZero);
    await wavefront.connect(owner).setContentFactory(contentFactory.address);
    await expect(wavefront.connect(user0).setContentFactory(AddressZero)).to.be
      .reverted;

    await wavefront.connect(owner).setRewarderFactory(AddressZero);
    await wavefront.connect(owner).setRewarderFactory(rewarderFactory.address);
    await expect(wavefront.connect(user0).setRewarderFactory(AddressZero)).to.be
      .reverted;
  });

  it("Rewarder coverage", async function () {
    console.log("******************************************************");
    console.log("- content reward added");
    await usdc.connect(owner).mint(owner.address, convert("10", 6));
    await usdc.connect(owner).approve(router.address, convert("2", 6));
    await router
      .connect(owner)
      .notifyContentRewardAmount(wft0.address, usdc.address, convert("2", 6));
    console.log("- content reward notified");
    await usdc.connect(owner).approve(router.address, convert("1", 6));
    await expect(
      router
        .connect(owner)
        .notifyContentRewardAmount(wft0.address, usdc.address, convert("1", 6))
    ).to.be.revertedWith("Rewarder__RewardSmallerThanLeft");
    await usdc.connect(owner).approve(router.address, convert("0.1", 6));
    await expect(
      router
        .connect(owner)
        .notifyContentRewardAmount(
          wft0.address,
          usdc.address,
          convert("0.1", 6)
        )
    ).to.be.revertedWith("Rewarder__RewardSmallerThanDuration");
  });
});
