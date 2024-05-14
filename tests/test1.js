const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount, decimals = 6) => amount / 10 ** decimals;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { execPath } = require("process");

const AddressZero = "0x0000000000000000000000000000000000000000";
const pointEightZerosOne = convert("0.000000001", 18);
const pointFiveZerosOne = convert("0.000001", 18);
const pointZeroZeroZeroOne = convert("0.0001", 18);
const pointZeroZeroOne = convert("0.001", 18);
const pointZeroOne = convert("0.01", 18);
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

describe("local: test1", function () {
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

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems meme1 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(meme1.address);
  });

  it("User0 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: pointZeroZeroOne,
    });
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1.connect(user0).approve(router.address, pointZeroZeroOne);
    await router
      .connect(user0)
      .sell(meme1.address, pointZeroZeroOne, 0, 1904422437);
  });

  it("User0 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: pointZeroOne,
    });
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1.connect(user0).approve(router.address, pointZeroOne);
    await router
      .connect(user0)
      .sell(meme1.address, pointZeroOne, 0, 1904422437);
  });

  it("User0 buys meme1", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme1.address, AddressZero, 0, 1904422437, {
      value: pointEightZerosOne,
    });
  });

  it("User0 sells meme1", async function () {
    console.log("******************************************************");
    await meme1.connect(user0).approve(router.address, pointEightZerosOne);
    await router
      .connect(user0)
      .sell(meme1.address, pointEightZerosOne, 0, 1904422437);
  });

  it("User0 creates meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).createMeme("Meme 2", "MEME2", "http/ipfs.com", {
      value: pointZeroZeroOne,
    });
    meme2 = await ethers.getContractAt("Meme", await factory.index_Meme(2));
    console.log("Meme2 Created");
  });

  it("Forward 2 hour", async function () {
    console.log("******************************************************");
    await network.provider.send("evm_increaseTime", [7200]);
    await network.provider.send("evm_mine");
  });

  it("User0 redeems meme2 contribution", async function () {
    console.log("******************************************************");
    await router.connect(user0).redeem(meme2.address);
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: pointEightZerosOne,
    });
  });

  it("Meme Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getMemeData(meme2.address);
    console.log(res);
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("Meme Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getMemeData(meme2.address);
    console.log(res);
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: pointEightZerosOne,
    });
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: oneHundred,
    });
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: pointZeroZeroOne,
    });
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("User0 donates 100 ETH", async function () {
    console.log("******************************************************");
    await base.connect(user0).deposit({ value: oneHundred });
    await base.connect(user0).approve(meme2.address, oneHundred);
    await meme2.connect(user0).donate(oneHundred);
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("Treasury Operations", async function () {
    console.log("******************************************************");
    await treasury.borrow([meme1.address, meme2.address]);
    await treasury.withdraw();
  });

  it("Meme Data", async function () {
    console.log("******************************************************");
    let res = await multicallSubgraph.getMemeData(meme2.address);
    console.log(res);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(
      meme2.address,
      treasury.address
    );
    console.log(res);
  });

  it("User0 sets creator of meme2 to User1", async function () {
    console.log("******************************************************");
    await meme2.connect(user0).setCreator(user1.address);
    await expect(
      meme2.connect(user0).setCreator(user1.address)
    ).to.be.revertedWith("Meme__NotAuthorized");
  });

  it("User0 buys meme2", async function () {
    console.log("******************************************************");
    await router.connect(user0).buy(meme2.address, AddressZero, 0, 1904422437, {
      value: ten,
    });
  });

  it("User0 sells meme2", async function () {
    console.log("******************************************************");
    await meme2
      .connect(user0)
      .approve(router.address, await meme2.balanceOf(user0.address));
    await router
      .connect(user0)
      .sell(meme2.address, await meme2.balanceOf(user0.address), 0, 1904422437);
  });

  it("Page Data", async function () {
    console.log("******************************************************");
    let res = await multicallFrontend.getPageData(meme2.address, user1.address);
    console.log(res);
  });

  it("Owner sets treasury address to user1", async function () {
    console.log("******************************************************");
    await treasury.connect(owner).setTreasury(user1.address);
    await expect(treasury.connect(user1).setTreasury(user0.address)).to.be
      .reverted;
    await treasury.withdraw();
    await treasury.connect(owner).setTreasury(owner.address);
  });
});
