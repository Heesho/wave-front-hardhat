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

let owner, multisig, user0, user1, user2, treasury;
let weth, usdc, wft0, wft1;
let preTokenFactory, tokenFactory, wavefront;
let multicall, router;

describe("local: test1", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, user0, user1, user2, treasury] =
      await ethers.getSigners();

    const wethArtifact = await ethers.getContractFactory("WETH");
    weth = await wethArtifact.deploy();
    console.log("- WETH Initialized");

    const usdcArtifact = await ethers.getContractFactory("USDC");
    usdc = await usdcArtifact.deploy();
    console.log("- USDC Initialized");

    const preTokenFactoryArtifact = await ethers.getContractFactory(
      "PreTokenFactory"
    );
    preTokenFactory = await preTokenFactoryArtifact.deploy();
    console.log("- PreTokenFactory Initialized");

    const tokenFactoryArtifact = await ethers.getContractFactory(
      "TokenFactory"
    );
    tokenFactory = await tokenFactoryArtifact.deploy();
    console.log("- TokenFactory Initialized");

    const wavefrontArtifact = await ethers.getContractFactory("WaveFront");
    wavefront = await wavefrontArtifact.deploy(tokenFactory.address);
    console.log("- WaveFront Initialized");

    const multicallArtifact = await ethers.getContractFactory(
      "WaveFrontMulticall"
    );
    multicall = await multicallArtifact.deploy();
    console.log("- Multicall Initialized");

    const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
    router = await routerArtifact.deploy(
      wavefront.address,
      preTokenFactory.address
    );
    await router.deployed();
    console.log("- Router Initialized");

    await usdc.connect(user0).mint(user0.address, tenThousand6);
    await usdc.connect(user1).mint(user1.address, tenThousand6);
    await usdc.connect(user2).mint(user2.address, tenThousand6);
    console.log("- System set up");

    console.log("Initialization Complete");
    console.log();
  });

  it("First Test", async function () {
    console.log("******************************************************");
    console.log("First Test");
  });

  it("User0 creates wft0 with weth as quote token", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createWaveFrontToken(
        "WFT0",
        "WFT0",
        "http/ipfs.com/0",
        weth.address,
        oneHundred
      );
    wft0 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("WFT0 Created");
  });

  it("User0 contributes 10 weth to wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .contributeWithNative(wft0.address, { value: ten });
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(wft0.address);
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: pointZeroZeroOne,
      });
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).approve(router.address, pointZeroZeroOne);
    await router
      .connect(user0)
      .sellToNative(wft0.address, AddressZero, pointZeroZeroOne, 0, 1904422437);
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: pointZeroOne,
      });
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).approve(router.address, pointZeroOne);
    await router
      .connect(user0)
      .sellToNative(wft0.address, AddressZero, pointZeroOne, 0, 1904422437);
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: pointEightZerosOne,
      });
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).approve(router.address, pointEightZerosOne);
    await router
      .connect(user0)
      .sellToNative(
        wft0.address,
        AddressZero,
        pointEightZerosOne,
        0,
        1904422437
      );
  });

  it("User0 creates wft1 with usdc as quote token", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createWaveFrontToken(
        "WFT1",
        "WFT1",
        "http/ipfs.com/1",
        usdc.address,
        oneHundred6
      );
    wft1 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("WFT1 Created");
  });

  it("User0 contributes 10 usdc to wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten6);
    await router.connect(user0).contributeWithQuote(wft1.address, ten6);
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems wft1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(wft1.address);
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, pointZeroZeroOne6);
    await router
      .connect(user0)
      .buyWithQuote(
        wft1.address,
        AddressZero,
        pointZeroZeroOne6,
        0,
        1904422437
      );
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, pointZeroZeroOne6);
    await router
      .connect(user0)
      .buyWithQuote(
        wft1.address,
        AddressZero,
        pointZeroZeroOne6,
        0,
        1904422437
      );
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, pointZeroZeroOne6);
    await router
      .connect(user0)
      .buyWithQuote(
        wft1.address,
        AddressZero,
        pointZeroZeroOne6,
        0,
        1904422437
      );
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, pointZeroZeroOne6);
    await router
      .connect(user0)
      .buyWithQuote(
        wft1.address,
        AddressZero,
        pointZeroZeroOne6,
        0,
        1904422437
      );
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, pointZeroZeroOne6);
    await router
      .connect(user0)
      .buyWithQuote(
        wft1.address,
        AddressZero,
        pointZeroZeroOne6,
        0,
        1904422437
      );
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User0 heals 100 ETH on wft0", async function () {
    console.log("******************************************************");
    await weth.connect(user0).deposit({ value: oneHundred });
    await weth.connect(user0).approve(wft0.address, oneHundred);
    await wft0.connect(user0).heal(oneHundred);
  });

  it("User0 heals 100 usdc on wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(wft1.address, oneHundred6);
    await wft1.connect(user0).heal(oneHundred6);
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten6);
    await router
      .connect(user0)
      .buyWithQuote(wft1.address, AddressZero, ten6, 0, 1904422437);
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(user0)
      .approve(router.address, await wft1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 buys wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten6);
    await router
      .connect(user0)
      .buyWithQuote(wft1.address, AddressZero, ten6, 0, 1904422437);
  });

  it("User0 burns 10 wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).burn(ten);
  });

  it("User0 burns 10 wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(wft1.address, ten6);
    await wft1.connect(user0).burn(ten6);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });
});
