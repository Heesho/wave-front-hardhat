const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
const pointZeroZeroOne = convert("0.001", 18);
const one = convert("1", 18);
const two = convert("2", 18);
const three = convert("3", 18);
const five = convert("5", 18);
const ten = convert("10", 18);
const twenty = convert("20", 18);
const eighty = convert("80", 18);
const ninety = convert("90", 18);
const oneHundred = convert("100", 18);
const twoHundred = convert("200", 18);
const fiveHundred = convert("500", 18);
const sixHundred = convert("600", 18);
const eightHundred = convert("800", 18);
const oneThousand = convert("1000", 18);
const fourThousand = convert("4000", 18);
const tenThousand = convert("10000", 18);
const oneHundredThousand = convert("100000", 18);

let owner, multisig, user0, user1, user2;
let memeFactory, meme1, meme2, meme3;
let factory, multicallSubgraph, multicallFrontend, router;
let base, treasury;

describe("local: test0", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, user0, user1, user2] = await ethers.getSigners();

    const baseArtifact = await ethers.getContractFactory("Base");
    base = await baseArtifact.deploy();
    console.log("- BASE Initialized");

    const treasuryArtifact = await ethers.getContractFactory(
      "WaveFrontTreasury"
    );
    treasury = await treasuryArtifact.deploy(base.address, owner.address);
    console.log("- Treasury Initialized");

    const memeFactoryArtifact = await ethers.getContractFactory("MemeFactory");
    memeFactory = await memeFactoryArtifact.deploy();
    console.log("- MemeFactory Initialized");

    const factoryArtifact = await ethers.getContractFactory("WaveFrontFactory");
    factory = await factoryArtifact.deploy(
      memeFactory.address,
      base.address,
      treasury.address
    );
    console.log("- WaveFront Factory Initialized");

    const multicallSubgraphArtifact = await ethers.getContractFactory(
      "WaveFrontMulticallSubgraph"
    );
    multicallSubgraph = await multicallSubgraphArtifact.deploy(
      factory.address,
      base.address
    );
    console.log("- Subgraph Multicall Initialized");

    const multicallFrontendArtifact = await ethers.getContractFactory(
      "WaveFrontMulticallFrontend"
    );
    multicallFrontend = await multicallFrontendArtifact.deploy(
      factory.address,
      base.address
    );
    console.log("- Frontend Multicall Initialized");

    const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
    router = await routerArtifact.deploy(factory.address, base.address);
    console.log("- Router Initialized");

    await memeFactory.setWaveFrontFactory(factory.address);
    console.log("- System set up");

    console.log("Initialization Complete");
    console.log();
  });

  it("First Test", async function () {
    console.log("******************************************************");
    console.log("First Test");
  });

  it("User0 creates meme1", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createMeme("Meme 1", "MEME1", "http/ipfs.com", { value: ten });
    meme1 = await ethers.getContractAt("Meme", await factory.index_Meme(1));
    console.log("Meme1 Created");
  });

  it("User0 creates meme2", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createMeme("Meme 2", "MEME2", "http/ipfs.com", { value: ten });
    meme2 = await ethers.getContractAt("Meme", await factory.index_Meme(2));
    console.log("Meme0 Created");
  });

  it("User0 contributes 10 ETH to meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).contribute(meme1.address, { value: ten });
  });

  it("User1 contributes 10 ETH to meme1", async function () {
    console.log("******************************************************");
    await router.connect(user1).contribute(meme1.address, { value: ten });
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("User1 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user1).redeem(meme1.address);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("User1 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user1).redeem(meme1.address)
    ).to.be.revertedWith("PreMeme__NotEligible");
  });

  it("User0 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(meme1.address);
  });

  it("User0 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user0).redeem(meme1.address)
    ).to.be.revertedWith("PreMeme__NotEligible");
  });

  it("User0 tries to contribute 10 ETH to meme1", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user0).contribute(meme1.address, { value: ten })
    ).to.be.revertedWith("PreMeme__Concluded");
  });

  it("User0 contributes 10 ETH to meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).contribute(meme2.address, { value: ten });
  });

  it("User1 redeems meme2 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user1).redeem(meme2.address)
    ).to.be.revertedWith("PreMeme__NotEligible");
  });

  it("User0 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User0 buys meme0", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(
        router.address,
        (await meme1.balanceOf(user0.address)).sub(oneThousand)
      );
    await router
      .connect(user0)
      .sell(
        meme1.address,
        (await meme1.balanceOf(user0.address)).sub(oneThousand),
        0,
        1904422437
      );
  });

  it("User0 buys meme0", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(router.address, await meme1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme1.address, await meme1.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: oneThousand,
    });
  });

  it("User1 buys meme1", async function () {
    console.log("******************************************************");
    await router
      .connect(user1)
      .buy(meme1.address, user0.address, 0, 1904422437, {
        value: oneThousand,
      });
  });

  it("User0 buys meme0", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User1 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user1).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User1 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user1)
      .approve(router.address, await meme1.balanceOf(user1.address));
    await router
      .connect(user1)
      .sell(meme1.address, await meme1.balanceOf(user1.address), 0, 1904422437);
  });

  it("User1 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user1).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User1 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user1)
      .approve(router.address, await meme1.balanceOf(user1.address));
    await router
      .connect(user1)
      .sell(meme1.address, await meme1.balanceOf(user1.address), 0, 1904422437);
  });

  it("Quote Buy In", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend
      .connect(owner)
      .quoteBuyIn(meme1.address, ten, 9800);
    console.log("BASE in", divDec(ten));
    console.log("Slippage Tolerance", "2%");
    console.log();
    console.log("MEME out", divDec(res.output));
    console.log("slippage", divDec(res.slippage));
    console.log("min MEME out", divDec(res.minOutput));
  });

  it("Quote Sell In", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.quoteSellIn(
      meme1.address,
      await meme1.balanceOf(user0.address),
      9700
    );
    console.log("MEME in", divDec(await meme1.balanceOf(user1.address)));
    console.log("Slippage Tolerance", "3%");
    console.log();
    console.log("BASE out", divDec(res.output));
    console.log("slippage", divDec(res.slippage));
    console.log("min BASE out", divDec(res.minOutput));
  });

  it("Quote buy out", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend
      .connect(owner)
      .quoteBuyOut(meme1.address, ten, 9700);
    console.log("MEME out", divDec(ten));
    console.log("Slippage Tolerance", "3%");
    console.log();
    console.log("BASE in", divDec(res.output));
    console.log("slippage", divDec(res.slippage));
    console.log("min MEME out", divDec(res.minOutput));
  });

  it("Quote sell out", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend
      .connect(owner)
      .quoteSellOut(meme1.address, five, 9950);
    console.log("BASE out", divDec(five));
    console.log("Slippage Tolerance", "0.5%");
    console.log();
    console.log("MEME in", divDec(res.output));
    console.log("slippage", divDec(res.slippage));
    console.log("min BASE out", divDec(res.minOutput));
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("Meme Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getMemeData(meme1.address);
    console.log(res);
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user0.address
    );
    console.log(res);
  });

  it("User0 borrows against meme1", async function () {
    console.log("******************************************************");
    console.log("Contract BASE balance: ", await base.balanceOf(meme1.address));
    console.log("User0 Credit: ", await meme1.getAccountCredit(user0.address));
    await meme1
      .connect(user0)
      .borrow(await meme1.getAccountCredit(user0.address));
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user0.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    await expect(
      meme1.connect(user0).transfer(user1.address, one)
    ).to.be.revertedWith("Meme__CollateralRequirement");
  });

  it("User0 tries to sell meme0", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(router.address, await meme1.balanceOf(user0.address));
    await expect(
      router
        .connect(user0)
        .sell(
          meme1.address,
          await meme1.balanceOf(user0.address),
          0,
          1904422437
        )
    ).to.be.revertedWith("Meme__CollateralRequirement");
  });

  it("User0 repays some WETH for meme1", async function () {
    console.log("******************************************************");
    await base.connect(user0).approve(meme1.address, one);
    await meme1.connect(user0).repay(one);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    meme1.connect(user0).transfer(user1.address, one);
  });

  it("User0 repays all WETH", async function () {
    console.log("******************************************************");
    await base
      .connect(user0)
      .approve(meme1.address, await meme1.account_Debt(user0.address));
    await meme1.connect(user0).repay(await meme1.account_Debt(user0.address));
  });

  it("User0 transfers meme0", async function () {
    console.log("******************************************************");
    await meme1.connect(user0).transfer(user1.address, one);
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("Invariants Meme2", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme2.reserveRealBase();
    const reserveMeme = await meme2.reserveMeme();
    const totalSupply = await meme2.totalSupply();
    const maxSupply = await meme2.maxSupply();
    const baseBalance = await base.balanceOf(meme2.address);
    const initialBase = await meme2.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user0.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("User0 updates status through router", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(router.address, await meme1.getNextStatusFee());
    await router.connect(user0).updateStatus(meme1.address, "Sup everybody?");
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user0.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(
        router.address,
        (await meme1.balanceOf(user0.address)).sub(oneThousand)
      );
    await router
      .connect(user0)
      .sell(
        meme1.address,
        (await meme1.balanceOf(user0.address)).sub(oneThousand),
        0,
        1904422437
      );
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user0)
      .approve(router.address, await meme1.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme1.address, await meme1.balanceOf(user0.address), 0, 1904422437);
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user1.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user0.address);
    console.log(res);
  });

  it("User1 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user1).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user1.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user1.address);
    console.log(res);
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("User1 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user1).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: oneHundred,
    });
  });

  it("User1 updates status through router", async function () {
    console.log("******************************************************");
    await meme1
      .connect(user1)
      .approve(router.address, await meme1.getNextStatusFee());
    await router
      .connect(user1)
      .updateStatus(meme1.address, "Buy pepecoin for my familia");
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getAccountData(
      meme1.address,
      user1.address
    );
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, user1.address);
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme1.address, AddressZero);
    console.log(res);
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("User0 donates 1 WETH", async function () {
    console.log("******************************************************");
    console.log(
      "User0 BASE balance: ",
      divDec(await base.balanceOf(user0.address))
    );
    await base.connect(user0).approve(meme1.address, one);
    await expect(meme1.connect(user0).donate(one)).to.be.revertedWith(
      "Meme__NotAuthorized"
    );
    await expect(
      meme1.connect(owner).setCanDonateBurn(user0.address, true)
    ).to.be.revertedWith("Meme__NotAuthorized");
    await meme1.connect(user0).setCanDonateBurn(user0.address, true);
    await meme1.connect(user0).donate(one);
    console.log(
      "User0 BASE balance: ",
      divDec(await base.balanceOf(user0.address))
    );
    console.log("User2 Credit: ", await meme1.getAccountCredit(user2.address));
    console.log(
      "User2 Transferrable: ",
      await meme1.getAccountTransferrable(user2.address)
    );
  });

  it("Invariants Meme1", async function () {
    console.log("******************************************************");
    const reserveRealBase = await meme1.reserveRealBase();
    const reserveMeme = await meme1.reserveMeme();
    const totalSupply = await meme1.totalSupply();
    const maxSupply = await meme1.maxSupply();
    const baseBalance = await base.balanceOf(meme1.address);
    const initialBase = await meme1.reserveVirtualBase();
    const maxReserve = reserveMeme.add(totalSupply);
    const remainingBase = reserveRealBase
      .add(initialBase)
      .mul(reserveMeme)
      .div(maxReserve);

    console.log("Base Balance: ", baseBalance);
    console.log("Reserve Base: ", reserveRealBase);
    expect(baseBalance).to.be.at.least(reserveRealBase);

    console.log("Max Reserve: ", maxReserve);
    console.log("Max Supply: ", maxSupply);
    expect(maxReserve).to.be.at.least(maxSupply);

    console.log("Remaining Base: ", remainingBase);
    console.log("Initial Base: ", initialBase);
    expect(remainingBase).to.be.at.least(initialBase);
  });

  it("Multicall Coverage", async function () {
    console.log("******************************************************");
    console.log("Meme Count: ", await multicallFrontend.getMemeCount());
    console.log(
      "Index of Meme1: ",
      await multicallFrontend.getIndexByMeme(meme1.address)
    );
    console.log("Meme at Index 2: ", await multicallFrontend.getMemeByIndex(2));
    console.log(
      "Index by Symbol MEME1: ",
      await multicallFrontend.getIndexBySymbol("MEME1")
    );
  });

  it("WaveFrontFactory Coverage", async function () {
    console.log("******************************************************");
    await expect(factory.connect(user0).setTreasury(user0.address)).to.be
      .reverted;
    await factory.connect(owner).setTreasury(user0.address);
    await expect(factory.connect(user0).setMinAmountIn(one)).to.be.reverted;
    await factory.connect(owner).setTreasury(treasury.address);
    await factory.connect(owner).setMinAmountIn(one);
    await factory.connect(owner).setMinAmountIn(pointZeroZeroOne);
  });

  it("User0 creates meme3", async function () {
    console.log("******************************************************");
    await router.connect(user0).createMeme("Meme 3", "MEME3", "http/ipfs.com", {
      value: pointZeroZeroOne,
    });
    meme3 = await ethers.getContractAt("Meme", await factory.index_Meme(3));
    console.log("Meme3 Created");
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme3.address, user0.address);
    console.log(res);
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems meme3 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(meme3.address);
  });

  it("User0 sells meme3", async function () {
    console.log("******************************************************");
    await meme3
      .connect(user0)
      .approve(router.address, await meme3.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme3.address, await meme3.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 sells meme3", async function () {
    console.log("******************************************************");
    await meme3
      .connect(user0)
      .approve(router.address, await meme3.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme3.address, await meme3.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 sells meme3", async function () {
    console.log("******************************************************");
    await meme3
      .connect(user0)
      .approve(router.address, await meme3.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme3.address, await meme3.balanceOf(user0.address), 0, 1904422437);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme3.address, user0.address);
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(
      meme3.address,
      treasury.address
    );
    console.log(res);
  });

  // it("Treasury sells meme3", async function () {
  //   console.log("******************************************************");
  //   await meme3
  //     .connect(treasury)
  //     .approve(router.address, await meme3.balanceOf(treasury.address));
  //   await router
  //     .connect(treasury)
  //     .sell(
  //       meme3.address,
  //       await meme3.balanceOf(treasury.address),
  //       0,
  //       1904422437
  //     );
  // });

  // it("User0 sells meme3", async function () {
  //   console.log("******************************************************");
  //   await meme3
  //     .connect(user0)
  //     .approve(router.address, await meme3.balanceOf(user0.address));
  //   await router
  //     .connect(user0)
  //     .sell(meme3.address, await meme3.balanceOf(user0.address), 0, 1904422437);
  // });

  // it("Treasury sells meme3", async function () {
  //   console.log("******************************************************");
  //   await meme3
  //     .connect(treasury)
  //     .approve(router.address, await meme3.balanceOf(treasury.address));
  //   await router
  //     .connect(treasury)
  //     .sell(
  //       meme3.address,
  //       await meme3.balanceOf(treasury.address),
  //       0,
  //       1904422437
  //     );
  // });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme3.address, owner.address);
    console.log(res);
  });

  it("Treasury operations", async function () {
    console.log("******************************************************");
    await treasury.borrow([meme1.address, meme2.address, meme3.address]);
    await treasury.withdraw();
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme3.address, owner.address);
    console.log(res);
    console.log();
    console.log(pointZeroZeroOne.toString());
  });
});
