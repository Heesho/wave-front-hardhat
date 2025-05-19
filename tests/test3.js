const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
const one = convert("1", 6);
const one18 = convert("1", 18);
const five = convert("5", 6);
const ten = convert("10", 6);
const ten18 = convert("10", 18);
const oneHundred = convert("100", 6);
const oneHundred18 = convert("100", 18);
const oneThousand = convert("1000", 6);
const oneThousand18 = convert("1000", 18);
const tenThousand = convert("10000", 6);
const oneMillion = convert("1000000", 6);
const tenMillion = convert("10000000", 6);
const oneBillion = convert("1000000000", 6);

let owner, multisig, user0, user1, user2, treasury;
let usdc, wft0, wft1;
let tokenFactory, preTokenFactory, wavefront;
let multicall, router;

describe("local: test3 6 decimals", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, user0, user1, user2, treasury] =
      await ethers.getSigners();

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

    await usdc.connect(user0).mint(user0.address, tenThousand);
    await usdc.connect(user1).mint(user1.address, tenThousand);
    await usdc.connect(user2).mint(user2.address, tenThousand);
    console.log("- System set up");

    console.log("Initialization Complete");
    console.log();
  });

  it("First Test", async function () {
    console.log("******************************************************");
    console.log("First Test");
  });

  it("User0 creates wft0 with usdc as quote token", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createWaveFrontToken(
        "WFT0",
        "WFT0",
        "http/ipfs.com/0",
        usdc.address,
        oneHundred
      );
    wft0 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("WFT0 Created");
  });

  it("User0 contributes 10 usdc to wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await router.connect(user0).contributeWithQuote(wft0.address, ten);
  });

  it("User1 contributes 10 usdc to wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user1).approve(router.address, ten);
    await router.connect(user1).contributeWithQuote(wft0.address, ten);
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user1.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user2.address);
    console.log(res);
  });

  it("User1 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user1).redeem(wft0.address);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User1 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await expect(router.connect(user1).redeem(wft0.address)).to.be.revertedWith(
      "PreToken__NothingToRedeem"
    );
  });

  it("User0 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(wft0.address);
  });

  it("User0 redeems wft0 contribution", async function () {
    console.log("******************************************************");
    await expect(router.connect(user0).redeem(wft0.address)).to.be.revertedWith(
      "PreToken__NothingToRedeem"
    );
  });

  it("User0 tries to contribute 10 usdc to wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await expect(
      router.connect(user0).contributeWithQuote(wft0.address, ten)
    ).to.be.revertedWith("PreToken__Closed");
  });

  it("Market Prices", async function () {
    console.log("******************************************************");
    console.log("Market Price: ", await wft0.getMarketPrice());
    console.log("Floor Price: ", await wft0.getFloorPrice());
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await router
      .connect(user0)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await router
      .connect(user0)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(
        router.address,
        (await wft0.balanceOf(user0.address)).sub(oneThousand18)
      );
    await router
      .connect(user0)
      .sellToQuote(
        wft0.address,
        AddressZero,
        (await wft0.balanceOf(user0.address)).sub(oneThousand18),
        0,
        1904422437
      );
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await router
      .connect(user0)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(router.address, await wft0.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, oneThousand);
    await router
      .connect(user0)
      .buyWithQuote(wft0.address, user0.address, oneThousand, 0, 1904422437);
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user1).approve(router.address, oneThousand);
    await router
      .connect(user1)
      .buyWithQuote(wft0.address, user0.address, oneThousand, 0, 1904422437);
  });

  it("Market Prices", async function () {
    console.log("******************************************************");
    console.log("Market Price: ", await wft0.getMarketPrice());
    console.log("Floor Price: ", await wft0.getFloorPrice());
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, ten);
    await router
      .connect(user0)
      .buyWithQuote(wft0.address, user0.address, ten, 0, 1904422437);
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user1).approve(router.address, ten);
    await router
      .connect(user1)
      .buyWithQuote(wft0.address, user0.address, ten, 0, 1904422437);
  });

  it("Market Prices", async function () {
    console.log("******************************************************");
    console.log("Market Price: ", await wft0.getMarketPrice());
    console.log("Floor Price: ", await wft0.getFloorPrice());
  });

  it("User1 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user1)
      .approve(router.address, await wft0.balanceOf(user1.address));
    await router
      .connect(user1)
      .sellToQuote(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user1.address),
        0,
        1904422437
      );
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user1).approve(router.address, ten);
    await router
      .connect(user1)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("User1 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user1)
      .approve(router.address, await wft0.balanceOf(user1.address));
    await router
      .connect(user1)
      .sellToQuote(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user1.address),
        0,
        1904422437
      );
  });

  it("Quote Buy In", async function () {
    console.log("******************************************************");
    let res = await multicall
      .connect(owner)
      .buyQuoteIn(wft0.address, ten, 9800);
    console.log("USDC in", divDec6(ten));
    console.log("Slippage Tolerance", "2%");
    console.log();
    console.log("WFT0 out", divDec(res.tokenAmtOut));
    console.log("slippage", divDec(res.slippage));
    console.log("min WFT0 out", divDec(res.minTokenAmtOut));
    console.log("min USDC out", divDec6(res.autoMinTokenAmtOut));
  });

  it("Quote Sell In", async function () {
    console.log("******************************************************");
    let res = await multicall.sellTokenIn(
      wft0.address,
      await wft0.balanceOf(user0.address),
      9700
    );
    console.log("WFT0 in", divDec(await wft0.balanceOf(user0.address)));
    console.log("Slippage Tolerance", "3%");
    console.log();
    console.log("USDC out", divDec6(res.quoteRawOut));
    console.log("slippage", divDec(res.slippage));
    console.log("min USDC out", divDec6(res.minQuoteRawOut));
    console.log("min USDC out", divDec6(res.autoMinQuoteRawOut));
  });

  it("Market Prices", async function () {
    console.log("******************************************************");
    console.log("Market Price: ", await wft0.getMarketPrice());
    console.log("Floor Price: ", await wft0.getFloorPrice());
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("Quote buy out", async function () {
    console.log("******************************************************");
    let res = await multicall
      .connect(owner)
      .buyTokenOut(wft0.address, ten18, 9700);
    console.log("WFT0 out", divDec(ten18));
    console.log("Slippage Tolerance", "3%");
    console.log();
    console.log("USDC in", divDec6(res.quoteRawIn));
    console.log("slippage", divDec(res.slippage));
    console.log("min Token out", divDec(res.minTokenAmtOut));
    console.log("min Token out", divDec(res.autoMinTokenAmtOut));
  });

  it("Quote sell out", async function () {
    console.log("******************************************************");
    let res = await multicall
      .connect(owner)
      .sellQuoteOut(wft0.address, ten, 9950);
    console.log("USDC out", divDec6(ten));
    console.log("Slippage Tolerance", "0.5%");
    console.log();
    console.log("WFT0 in", divDec(res.tokenAmtIn));
    console.log("slippage", divDec(res.slippage));
    console.log("min USDC out", divDec6(res.minQuoteRawOut));
    console.log("min USDC out", divDec6(res.autoMinQuoteRawOut));
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User0 borrows against wft0", async function () {
    console.log("******************************************************");
    console.log("Contract USDC balance: ", await usdc.balanceOf(wft0.address));
    console.log("User0 Credit: ", await wft0.getAccountCredit(user0.address));
    await wft0
      .connect(user0)
      .borrow(user0.address, await wft0.getAccountCredit(user0.address));
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    await expect(
      wft0.connect(user0).transfer(user1.address, one18)
    ).to.be.revertedWith("Token__CollateralLocked");
  });

  it("User0 tries to sell wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(router.address, await wft0.balanceOf(user0.address));
    await expect(
      router
        .connect(user0)
        .sellToNative(
          wft0.address,
          AddressZero,
          await wft0.balanceOf(user0.address),
          0,
          1904422437
        )
    ).to.be.revertedWith("Token__CollateralLocked");
  });

  it("User0 repays some USDC for wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(wft0.address, one);
    await wft0.connect(user0).repay(user0.address, one);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    wft0.connect(user0).transfer(user1.address, one18);
  });

  it("User0 repays all USDC", async function () {
    console.log("******************************************************");
    await usdc
      .connect(user0)
      .approve(wft0.address, await wft0.account_DebtRaw(user0.address));
    await wft0
      .connect(user0)
      .repay(user0.address, await wft0.account_DebtRaw(user0.address));
  });

  it("User0 transfers wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).transfer(user1.address, one18);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user1.address);
    console.log(res);
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(
        router.address,
        (await wft0.balanceOf(user0.address)).sub(oneThousand18)
      );
    await router
      .connect(user0)
      .sellToQuote(
        wft0.address,
        AddressZero,
        (await wft0.balanceOf(user0.address)).sub(oneThousand18),
        0,
        1904422437
      );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(router.address, await wft0.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToQuote(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User1 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user1)
      .approve(router.address, await wft0.balanceOf(user1.address));
    await router
      .connect(user1)
      .sellToQuote(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user1.address),
        0,
        1904422437
      );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user1).approve(router.address, ten);
    await router
      .connect(user1)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("User2 buys wft0", async function () {
    console.log("******************************************************");
    await usdc.connect(user2).approve(router.address, ten);
    await router
      .connect(user2)
      .buyWithQuote(wft0.address, AddressZero, ten, 0, 1904422437);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user1.address);
    console.log(res);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("User0 heals with 1 USDC", async function () {
    console.log("******************************************************");
    console.log("User2 Credit: ", await wft0.getAccountCredit(user2.address));
    console.log(
      "User2 Transferrable: ",
      await wft0.getAccountTransferrable(user2.address)
    );
    console.log(
      "User0 USDC balance: ",
      divDec6(await usdc.balanceOf(user0.address))
    );
    await usdc.connect(user0).approve(wft0.address, one);
    await wft0.connect(user0).heal(one);
    console.log("healed");
    console.log(
      "User0 USDC balance: ",
      divDec6(await usdc.balanceOf(user0.address))
    );
    console.log("User2 Credit: ", await wft0.getAccountCredit(user2.address));
    console.log(
      "User2 Transferrable: ",
      await wft0.getAccountTransferrable(user2.address)
    );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("User0 creates wft1", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createWaveFrontToken(
        "WFT1",
        "WFT1",
        "http/ipfs.com/1",
        usdc.address,
        oneHundred
      );
    wft1 = await ethers.getContractAt("Token", await tokenFactory.lastToken());
    console.log("WFT1 Created");
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("User0 contributes 10 usdc to wft1", async function () {
    console.log("******************************************************");
    await usdc.connect(user0).approve(router.address, one);
    await router.connect(user0).contributeWithQuote(wft1.address, one);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
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

  it("User0 sells wft1", async function () {
    console.log("******************************************************");
    await wavefront.setTreasury(treasury.address);
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

  it("Treasury sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(treasury)
      .approve(router.address, await wft1.balanceOf(treasury.address));
    await router
      .connect(treasury)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
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

  it("Treasury sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(treasury)
      .approve(router.address, await wft1.balanceOf(treasury.address));
    await router
      .connect(treasury)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
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

  it("Treasury sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(treasury)
      .approve(router.address, await wft1.balanceOf(treasury.address));
    await router
      .connect(treasury)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
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

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, treasury.address);
    console.log(res);
  });

  it("Treasury sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(treasury)
      .approve(router.address, await wft1.balanceOf(treasury.address));
    await router
      .connect(treasury)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
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

  it("Treasury sells wft1", async function () {
    console.log("******************************************************");
    await wft1
      .connect(treasury)
      .approve(router.address, await wft1.balanceOf(treasury.address));
    await router
      .connect(treasury)
      .sellToQuote(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
        0,
        1904422437
      );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.wadToRaw(
      await wft0.reserveRealQuoteWad()
    );
    const reserveVirtQuote = await wft0.wadToRaw(
      await wft0.reserveVirtQuoteWad()
    );
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const usdcBalance = await usdc.balanceOf(wft0.address);
    const usdcRemaining = (await wft0.reserveRealQuoteWad())
      .add(await wft0.reserveVirtQuoteWad())
      .mul(reserveToken)
      .div(maxReserve);

    console.log("USDC Balance: ", divDec6(usdcBalance));
    console.log("Reserve USDC: ", divDec6(reserveRealQuote));
    expect(usdcBalance).to.be.at.least(reserveRealQuote);

    console.log("Max WFT Reserve: ", divDec(maxReserve));
    console.log("Max WFT Supply: ", divDec(maxSupply));
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining USDC: ", usdcRemaining);
    console.log("Initial USDC: ", await wft0.reserveVirtQuoteWad());
    expect(usdcRemaining).to.be.at.least(await wft0.reserveVirtQuoteWad());
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, treasury.address);
    console.log(res);
  });
});
