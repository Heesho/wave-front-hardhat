const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
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

let owner, multisig, treasury, user0, user1, user2;
let tokenFactory, meme1, meme2;
let factory, multicall, router;
let base;

describe.only("local: test0", function () {
  before("Initial set up", async function () {
    console.log("Begin Initialization");

    [owner, multisig, treasury, user0, user1, user2] =
      await ethers.getSigners();

    const baseArtifact = await ethers.getContractFactory("Base");
    base = await baseArtifact.deploy();
    console.log("- BASE Initialized");

    const tokenFactoryArtifact = await ethers.getContractFactory(
      "TokenFactoryFP"
    );
    tokenFactory = await tokenFactoryArtifact.deploy();
    console.log("- TokenFactory Initialized");

    const factoryArtifact = await ethers.getContractFactory("WaveFrontFactory");
    factory = await factoryArtifact.deploy(
      tokenFactory.address,
      base.address,
      treasury.address
    );
    console.log("- WaveFront Factory Initialized");

    const multicallArtifact = await ethers.getContractFactory(
      "WaveFrontMulticall"
    );
    multicall = await multicallArtifact.deploy(factory.address, base.address);
    console.log("- Multicall Initialized");

    const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
    router = await routerArtifact.deploy(factory.address, base.address);
    console.log("- Router Initialized");

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
      .createToken("Meme 1", "MEME1", "http/ipfs.com", { value: ten });
    meme1 = await ethers.getContractAt("TokenFP", await factory.index_Token(1));
    console.log("Meme1 Created");
  });

  it("User0 creates meme2", async function () {
    console.log("******************************************************");
    await router
      .connect(user0)
      .createToken("Meme 2", "MEME2", "http/ipfs.com", { value: ten });
    meme2 = await ethers.getContractAt("TokenFP", await factory.index_Token(2));
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

  it("Forward 1 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("evm_mine");
  });

  it("User1 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user1).redeem(meme1.address);
  });

  it("User1 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user1).redeem(meme1.address)
    ).to.be.revertedWith("PreToken__NotEligible");
  });

  it("User0 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(meme1.address);
  });

  it("User0 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user0).redeem(meme1.address)
    ).to.be.revertedWith("PreToken__NotEligible");
  });

  it("User0 tries to contribute 10 ETH to meme1", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user0).contribute(meme1.address, { value: ten })
    ).to.be.revertedWith("PreToken__Concluded");
  });

  it("User0 contributes 10 ETH to meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).contribute(meme2.address, { value: ten });
  });

  it("User1 redeems meme2 contribution", async function () {
    console.log("******************************************************");
    await expect(
      router.connect(user1).redeem(meme2.address)
    ).to.be.revertedWith("PreToken__NotEligible");
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

  it("User0 claims meme1 fees", async function () {
    console.log("******************************************************");
    await router.connect(user0).claimFees([meme1.address]);
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

  it("User0 claims meme1 fees", async function () {
    console.log("******************************************************");
    await router.connect(user0).claimFees([meme1.address]);
  });

  it("User1 claims meme1 fees", async function () {
    console.log("******************************************************");
    await router.connect(user1).claimFees([meme1.address]);
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
    let res = await multicall
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
    let res = await multicall.quoteSellIn(
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
    let res = await multicall
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
    let res = await multicall
      .connect(owner)
      .quoteSellOut(meme1.address, five, 9950);
    console.log("BASE out", divDec(five));
    console.log("Slippage Tolerance", "0.5%");
    console.log();
    console.log("MEME in", divDec(res.output));
    console.log("slippage", divDec(res.slippage));
    console.log("min BASE out", divDec(res.minOutput));
  });

  it("Meme Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getTokenData(meme1.address);
    console.log(res);
  });

  it("Account Data", async function () {
    console.log("******************************************************");
    let res = await multicall.getAccountData(meme1.address, user0.address);
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
    let res = await multicall.getAccountData(meme1.address, user0.address);
    console.log(res);
  });

  it("User0 tries to transfer and tries to sell", async function () {
    console.log("******************************************************");
    await expect(
      meme1.connect(user0).transfer(user1.address, one)
    ).to.be.revertedWith("Token__CollateralRequirement");
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
    ).to.be.revertedWith("Token__CollateralRequirement");
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
});
