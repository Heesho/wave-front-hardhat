const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";

let owner, multisig, treasury, user0, user1, user2, user3;
let usdc, wft;
let tokenFactory, saleFactory, contentFactory, rewarderFactory, feesFactory;
let wavefront, multicall, router;

describe("local: test0", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, treasury, user0, user1, user2, user3] =
      await ethers.getSigners();

    const usdcArtifact = await ethers.getContractFactory("USDC");
    usdc = await usdcArtifact.deploy();
    console.log("- USDC Initialized");

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

    const feesFactoryArtifact = await ethers.getContractFactory("FeesFactory");
    feesFactory = await feesFactoryArtifact.deploy();
    console.log("- FeesFactory Initialized");

    const wavefrontArtifact = await ethers.getContractFactory("WaveFront");
    wavefront = await wavefrontArtifact.deploy(
      usdc.address,
      tokenFactory.address,
      saleFactory.address,
      contentFactory.address,
      rewarderFactory.address,
      feesFactory.address
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

  it("User0 creates wft", async function () {
    console.log("******************************************************");

    const wftName = "wft";
    const wftSymbol = "wft";
    const wftUri = "https://wavefront.io/wft";

    await router.connect(user0).create(wftName, wftSymbol, wftUri);
    wft = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft created");
  });

  it("User0 contributes 10 usdc to wft", async function () {
    console.log("******************************************************");
    const amount = convert("10", 6);
    await usdc.connect(user0).approve(router.address, amount);
    await router.connect(user0).contribute(wft.address, amount);
    console.log("- 10 usdc contributed to wft sale");
  });

  it("User1 contributes 0 usdc to wft and fails", async function () {
    console.log("******************************************************");
    const amount = convert("0", 6);
    await usdc.connect(user1).approve(router.address, amount);
    await expect(
      router.connect(user1).contribute(wft.address, amount)
    ).to.be.revertedWith("Sale__ZeroInput");
    console.log("- 0 usdc contributed to wft sale failed");
  });

  it("User1 contributes 100 usdc to wft", async function () {
    console.log("******************************************************");
    const amount = convert("100", 6);
    await usdc.connect(user1).approve(router.address, amount);
    await router.connect(user1).contribute(wft.address, amount);
    console.log("- 100 usdc contributed to wft sale");
  });

  it("User1 contributes 100 usdc to wft", async function () {
    console.log("******************************************************");
    const amount = convert("100", 6);
    await usdc.connect(user1).approve(router.address, amount);
    await router.connect(user1).contribute(wft.address, amount);
    console.log("- 100 usdc contributed to wft sale");
  });

  it("User2 contributes 1000 usdc to wft", async function () {
    console.log("******************************************************");
    const amount = convert("1000", 6);
    await usdc.connect(user2).approve(router.address, amount);
    await router.connect(user2).contribute(wft.address, amount);
    console.log("- 1000 usdc contributed to wft sale");
  });

  it("User0 redeems wft and fails", async function () {
    console.log("******************************************************");
    await expect(router.connect(user0).redeem(wft.address)).to.be.revertedWith(
      "Sale__Open"
    );
    console.log("- wft redemption failed");
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getData(wft.address, user0.address);
    console.log(res);
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems wft contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(wft.address);
    console.log("- wft contribution redeemed");
  });

  it("User0 redeems again wft contribution and fails", async function () {
    console.log("******************************************************");
    await expect(router.connect(user0).redeem(wft.address)).to.be.revertedWith(
      "Sale__NothingToRedeem"
    );
    console.log("- wft contribution redemption failed");
  });

  it("User3 redeems wft contribution but fails", async function () {
    console.log("******************************************************");
    await expect(router.connect(user3).redeem(wft.address)).to.be.revertedWith(
      "Sale__NothingToRedeem"
    );
    console.log("- wft contribution redemption failed");
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getData(wft.address, user0.address);
    console.log(res);
  });

  it("User1 redeems wft contribution", async function () {
    console.log("******************************************************");
    await router.connect(user1).redeem(wft.address);
    console.log("- wft contribution redeemed");
  });

  it("User0 tries to contribute 1000 usdc to wft and fails", async function () {
    console.log("******************************************************");
    const amount = convert("1000", 6);
    await usdc.connect(user0).approve(router.address, amount);
    await expect(
      router.connect(user0).contribute(wft.address, amount)
    ).to.be.revertedWith("Sale__Closed");
    console.log("- 1000 usdc contribution failed");
  });
});
