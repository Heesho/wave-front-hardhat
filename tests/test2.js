const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
const one = convert("1", 18);
const five = convert("5", 18);
const ten = convert("10", 18);
const oneHundred = convert("100", 18);
const oneThousand = convert("1000", 18);

let owner, multisig, user0, user1, user2, treasury;
let weth, wft0, wft1;
let tokenFactory, preTokenFactory, wavefront;
let multicall, router;

describe("local: test2 18 decimals", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, user0, user1, user2, treasury] =
      await ethers.getSigners();

    const wethArtifact = await ethers.getContractFactory("WETH");
    weth = await wethArtifact.deploy();
    console.log("- WETH Initialized");

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

  it("User1 contributes 10 weth to wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .contributeWithNative(wft0.address, { value: ten });
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

  it("User0 tries to contribute 10 weth to wft0", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user0).contributeWithNative(wft0.address, { value: ten })
    ).to.be.revertedWith("PreToken__Closed");
  });

  it("Market Prices", async function () {
    console.log("******************************************************");
    console.log("Market Price: ", await wft0.getMarketPrice());
    console.log("Floor Price: ", await wft0.getFloorPrice());
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(
        router.address,
        (await wft0.balanceOf(user0.address)).sub(oneThousand)
      );
    await router
      .connect(user0)
      .sellToNative(
        wft0.address,
        AddressZero,
        (await wft0.balanceOf(user0.address)).sub(oneThousand),
        0,
        1904422437
      );
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(router.address, await wft0.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToNative(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user0.address),
        0,
        1904422437
      );
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: oneThousand,
      });
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .buyWithNative(wft0.address, user0.address, 0, 1904422437, {
        value: oneThousand,
      });
  });

  it("User0 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User1 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user1)
      .approve(router.address, await wft0.balanceOf(user1.address));
    await router
      .connect(user1)
      .sellToNative(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user1.address),
        0,
        1904422437
      );
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("User1 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user1)
      .approve(router.address, await wft0.balanceOf(user1.address));
    await router
      .connect(user1)
      .sellToNative(
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
    console.log("WETH in", divDec(ten));
    console.log("Slippage Tolerance", "2%");
    console.log();
    console.log("WFT0 out", divDec(res.tokenAmtOut));
    console.log("slippage", divDec(res.slippage));
    console.log("min WFT0 out", divDec(res.minTokenAmtOut));
    console.log("auto min WFT0 out", divDec(res.autoMinTokenAmtOut));
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
    console.log("WETH out", divDec(res.quoteRawOut));
    console.log("slippage", divDec(res.slippage));
    console.log("min WETH out", divDec(res.minQuoteRawOut));
    console.log("auto min WETH out", divDec(res.autoMinQuoteRawOut));
  });

  it("Quote buy out", async function () {
    console.log("******************************************************");
    let res = await multicall
      .connect(owner)
      .buyTokenOut(wft0.address, ten, 9700);
    console.log("WFT0 out", divDec(ten));
    console.log("Slippage Tolerance", "3%");
    console.log();
    console.log("WETH in", divDec(res.quoteRawIn));
    console.log("slippage", divDec(res.slippage));
    console.log("min WFT0 out", divDec(res.minTokenAmtOut));
    console.log("auto min WFT0 out", divDec(res.autoMinTokenAmtOut));
  });

  it("Quote sell out", async function () {
    console.log("******************************************************");
    let res = await multicall
      .connect(owner)
      .sellQuoteOut(wft0.address, five, 9950);
    console.log("WETH out", divDec(five));
    console.log("Slippage Tolerance", "0.5%");
    console.log();
    console.log("WFT0 in", divDec(res.tokenAmtIn));
    console.log("slippage", divDec(res.slippage));
    console.log("min WFT0 in", divDec(res.minQuoteRawOut));
    console.log("auto min WFT0 in", divDec(res.autoMinQuoteRawOut));
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User0 borrows against meme1", async function () {
    console.log("******************************************************");
    console.log("Contract WETH balance: ", await weth.balanceOf(wft0.address));
    console.log("User0 Credit: ", await wft0.getAccountCredit(user0.address));
    await wft0
      .connect(user0)
      .borrow(user0.address, await wft0.getAccountCredit(user0.address));
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    await expect(
      wft0.connect(user0).transfer(user1.address, one)
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

  it("User0 repays some WETH for wft0", async function () {
    console.log("******************************************************");
    await weth.connect(user0).approve(wft0.address, one);
    await wft0.connect(user0).repay(user0.address, one);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    wft0.connect(user0).transfer(user1.address, one);
  });

  it("User0 repays all WETH", async function () {
    console.log("******************************************************");
    await weth
      .connect(user0)
      .approve(wft0.address, await wft0.account_DebtRaw(user0.address));
    await wft0
      .connect(user0)
      .repay(user0.address, await wft0.account_DebtRaw(user0.address));
  });

  it("User0 transfers wft0", async function () {
    console.log("******************************************************");
    await wft0.connect(user0).transfer(user1.address, one);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
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
        (await wft0.balanceOf(user0.address)).sub(oneThousand)
      );
    await router
      .connect(user0)
      .sellToNative(
        wft0.address,
        AddressZero,
        (await wft0.balanceOf(user0.address)).sub(oneThousand),
        0,
        1904422437
      );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
  });

  it("User0 sells wft0", async function () {
    console.log("******************************************************");
    await wft0
      .connect(user0)
      .approve(router.address, await wft0.balanceOf(user0.address));
    await router
      .connect(user0)
      .sellToNative(
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
      .sellToNative(
        wft0.address,
        AddressZero,
        await wft0.balanceOf(user1.address),
        0,
        1904422437
      );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user0.address);
    console.log(res);
  });

  it("User1 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
  });

  it("User2 buys wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user2)
      .buyWithNative(wft0.address, AddressZero, 0, 1904422437, {
        value: ten,
      });
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft0.address, user1.address);
    console.log(res);
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
  });

  it("User0 heals with 1 WETH", async function () {
    console.log("******************************************************");
    console.log("User2 Credit: ", await wft0.getAccountCredit(user2.address));
    console.log(
      "User2 Transferrable: ",
      await wft0.getAccountTransferrable(user2.address)
    );
    console.log(
      "User0 WETH balance: ",
      divDec(await weth.balanceOf(user0.address))
    );
    await weth.connect(user0).approve(wft0.address, one);
    await wft0.connect(user0).heal(one);
    console.log("healed");
    console.log(
      "User0 WETH balance: ",
      divDec(await weth.balanceOf(user0.address))
    );
    console.log("User2 Credit: ", await wft0.getAccountCredit(user2.address));
    console.log(
      "User2 Transferrable: ",
      await wft0.getAccountTransferrable(user2.address)
    );
  });

  it("Invariants wft0", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft0.reserveRealQuoteWad();
    const reserveVirtQuote = await wft0.reserveVirtQuoteWad();
    const reserveToken = await wft0.reserveTokenAmt();
    const totalSupply = await wft0.totalSupply();
    const maxSupply = await wft0.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft0.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
  });

  it("User0 creates wft1", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createWaveFrontToken(
        "WFT1",
        "WFT1",
        "http/ipfs.com/1",
        weth.address,
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

  it("User0 contributes 10 weth to wft0", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .contributeWithNative(wft1.address, { value: one });
  });

  it("Token Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(wft1.address, user0.address);
    console.log(res);
  });

  it("Invariants wft1", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft1.reserveRealQuoteWad();
    const reserveVirtQuote = await wft1.reserveVirtQuoteWad();
    const reserveToken = await wft1.reserveTokenAmt();
    const totalSupply = await wft1.totalSupply();
    const maxSupply = await wft1.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft1.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
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
      .sellToNative(
        wft1.address,
        AddressZero,
        await wft1.balanceOf(treasury.address),
        0,
        1904422437
      );
  });

  it("Invariants wft1", async function () {
    console.log("******************************************************");
    const reserveRealQuote = await wft1.reserveRealQuoteWad();
    const reserveVirtQuote = await wft1.reserveVirtQuoteWad();
    const reserveToken = await wft1.reserveTokenAmt();
    const totalSupply = await wft1.totalSupply();
    const maxSupply = await wft1.maxSupply();
    const maxReserve = reserveToken.add(totalSupply);
    const wethBalance = await weth.balanceOf(wft1.address);
    const wethRemaining = reserveRealQuote
      .add(reserveVirtQuote)
      .mul(reserveToken)
      .div(maxReserve);

    console.log("WETH Balance: ", wethBalance);
    console.log("Reserve WETH: ", reserveRealQuote);
    expect(wethBalance).to.be.at.least(reserveRealQuote);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", wethRemaining);
    console.log("Initial Base: ", reserveVirtQuote);
    expect(wethRemaining).to.be.at.least(reserveVirtQuote);
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
