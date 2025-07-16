const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
const pointEightZerosOne = convert("0.000000001", 18);
const pointZeroZeroOne = convert("0.001", 18);
const pointZeroZeroOne6 = convert("0.001", 6);
const pointZeroOne = convert("0.01", 18);
const ten = convert("10", 18);
const ten6 = convert("10", 6);
const oneHundred = convert("100", 18);
const oneHundred6 = convert("100", 6);
const tenThousand = convert("10000", 18);
const tenThousand6 = convert("10000", 6);

let owner, multisig, treasury, user0, user1, user2, user3;
let usdc, wft0, wft1;
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

    await usdc.connect(owner).mint(user0.address, tenThousand6);
    await usdc.connect(owner).mint(user1.address, tenThousand6);
    await usdc.connect(owner).mint(user2.address, tenThousand6);
    await usdc.connect(owner).mint(user3.address, tenThousand6);
    console.log("- System set up");

    console.log("Initialization Complete");
    console.log();
  });

  it("User0 creates wft0", async function () {
    console.log("******************************************************");

    const wft0Name = "wft0";
    const wft0Symbol = "WFT0";
    const wft0Uri = "https://wavefront.io/wft0";

    await router.connect(user0).create(wft0Name, wft0Symbol, wft0Uri);
    wft0 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("- wft0 created");
  });

  it("User0 contributes 10 usdc to wft0 sale", async function () {
    console.log("******************************************************");

    const amount = convert("10", 6);
    await usdc.connect(user0).approve(router.address, amount);
    await router.connect(user0).contribute(wft0.address, amount);
    console.log("- 10 usdc contributed to wft0 sale");
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
    console.log("- 2 hours forwarded");
  });

  it("User0 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(wft0.address);
    console.log("- wft0 contribution redeemed");
  });

  it("User0 buys wft0 with 10 usdc", async function () {
    console.log("******************************************************");
    const amount = convert("10", 6);
    await usdc.connect(user0).approve(router.address, amount);
    await router
      .connect(user0)
      .buy(wft0.address, AddressZero, amount, 0, 2000000000);
    console.log("- 10 usdc bought wft0");
  });
});
