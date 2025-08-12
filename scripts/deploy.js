const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");
const hre = require("hardhat");
const AddressZero = "0x0000000000000000000000000000000000000000";

/*===================================================================*/
/*===========================  SETTINGS  ============================*/

const TREASURY_ADDRESS = "0x039ec2E90454892fCbA461Ecf8878D0C45FDdFeE"; // Treasury Address
const SN1 = "0xD43cd79e4FC35669e853Ac77eF16b965d6cfae03"; // SN1 Address
const SN2 = "0x852454819FFC4CD466da7f5B355e392F59dF1d92"; // SN2 Address
const SN3 = ""; // SN3 Address

/*===========================  END SETTINGS  ========================*/
/*===================================================================*/

// Constants
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);

// Contract Variables
let usdc;
let tokenFactory, saleFactory, contentFactory, rewarderFactory;
let core, multicall, router;
let token, sale, content, rewarder;

/*===================================================================*/
/*===========================  CONTRACT DATA  =======================*/

async function getContracts() {
  usdc = await ethers.getContractAt(
    "contracts/mocks/USDC.sol:USDC",
    "0x5AaA726fa1d844D71Ebe0757705b86fAb8041526"
  );

  tokenFactory = await ethers.getContractAt(
    "contracts/TokenFactory.sol:TokenFactory",
    "0xa4Fcf5232Ad35c99449244427E308e6cf48FFf3D"
  );
  saleFactory = await ethers.getContractAt(
    "contracts/SaleFactory.sol:SaleFactory",
    "0x74Ea8f0fE0b6Ab5EbFA2d2F2907DAd5aB58d8D53"
  );
  contentFactory = await ethers.getContractAt(
    "contracts/ContentFactory.sol:ContentFactory",
    "0x819e166848DB0370fc2BedBC22437C131F2c03d1"
  );
  rewarderFactory = await ethers.getContractAt(
    "contracts/RewarderFactory.sol:RewarderFactory",
    "0x23eA1dCd55F2ceaD68e4aC208662843f12CE66a6"
  );

  core = await ethers.getContractAt(
    "contracts/Core.sol:Core",
    "0x20eFec197f8Dc18F57f1040effC56D7FbFEEc30d"
  );
  multicall = await ethers.getContractAt(
    "contracts/Multicall.sol:Multicall",
    "0x2C4815b8D48B32146cA2bf89E94b11915686C053"
  );
  router = await ethers.getContractAt(
    "contracts/Router.sol:Router",
    "0x205BAF322597c9B07217d8791AB48641793c594f"
  );

  token = await ethers.getContractAt("contracts/TokenFactory.sol:Token", SN2);
  sale = await ethers.getContractAt(
    "contracts/SaleFactory.sol:Sale",
    await token.sale()
  );
  content = await ethers.getContractAt(
    "contracts/ContentFactory.sol:Content",
    await token.content()
  );
  rewarder = await ethers.getContractAt(
    "contracts/RewarderFactory.sol:Rewarder",
    await token.rewarder()
  );

  console.log("Contracts Retrieved");
}

/*===========================  END CONTRACT DATA  ===================*/
/*===================================================================*/

async function deployUsdc() {
  console.log("Starting USDC Deployment");
  const usdcArtifact = await ethers.getContractFactory("USDC");
  const usdcContract = await usdcArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  usdc = await usdcContract.deployed();
  await sleep(5000);
  console.log("USDC Deployed at:", usdc.address);
}

async function verifyUsdc() {
  console.log("Starting USDC Verification");
  await hre.run("verify:verify", {
    address: usdc.address,
    contract: "contracts/mocks/USDC.sol:USDC",
  });
  console.log("USDC Verified");
}

async function deployTokenFactory() {
  console.log("Starting TokenFactory Deployment");
  const tokenFactoryArtifact = await ethers.getContractFactory("TokenFactory");
  const tokenFactoryContract = await tokenFactoryArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  tokenFactory = await tokenFactoryContract.deployed();
  await sleep(5000);
  console.log("TokenFactory Deployed at:", tokenFactory.address);
}

async function verifyTokenFactory() {
  console.log("Starting TokenFactory Verification");
  await hre.run("verify:verify", {
    address: tokenFactory.address,
    contract: "contracts/TokenFactory.sol:TokenFactory",
  });
  console.log("TokenFactory Verified");
}

async function deploySaleFactory() {
  console.log("Starting SaleFactory Deployment");
  const saleFactoryArtifact = await ethers.getContractFactory("SaleFactory");
  const saleFactoryContract = await saleFactoryArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  saleFactory = await saleFactoryContract.deployed();
  await sleep(5000);
  console.log("SaleFactory Deployed at:", saleFactory.address);
}

async function verifySaleFactory() {
  console.log("Starting SaleFactory Verification");
  await hre.run("verify:verify", {
    address: saleFactory.address,
    contract: "contracts/SaleFactory.sol:SaleFactory",
  });
  console.log("SaleFactory Verified");
}

async function deployContentFactory() {
  console.log("Starting ContentFactory Deployment");
  const contentFactoryArtifact = await ethers.getContractFactory(
    "ContentFactory"
  );
  const contentFactoryContract = await contentFactoryArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  contentFactory = await contentFactoryContract.deployed();
  await sleep(5000);
  console.log("ContentFactory Deployed at:", contentFactory.address);
}

async function verifyContentFactory() {
  console.log("Starting ContentFactory Verification");
  await hre.run("verify:verify", {
    address: contentFactory.address,
    contract: "contracts/ContentFactory.sol:ContentFactory",
  });
  console.log("ContentFactory Verified");
}

async function deployRewarderFactory() {
  console.log("Starting RewarderFactory Deployment");
  const rewarderFactoryArtifact = await ethers.getContractFactory(
    "RewarderFactory"
  );
  const rewarderFactoryContract = await rewarderFactoryArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  rewarderFactory = await rewarderFactoryContract.deployed();
  await sleep(5000);
  console.log("RewarderFactory Deployed at:", rewarderFactory.address);
}

async function verifyRewarderFactory() {
  console.log("Starting RewarderFactory Verification");
  await hre.run("verify:verify", {
    address: rewarderFactory.address,
    contract: "contracts/RewarderFactory.sol:RewarderFactory",
  });
  console.log("RewarderFactory Verified");
}

async function deployCore() {
  console.log("Starting Core Deployment");
  const coreArtifact = await ethers.getContractFactory("Core");
  const coreContract = await coreArtifact.deploy(
    usdc.address,
    tokenFactory.address,
    saleFactory.address,
    contentFactory.address,
    rewarderFactory.address,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  core = await coreContract.deployed();
  await sleep(5000);
  console.log("Core Deployed at:", core.address);
}

async function verifyCore() {
  console.log("Starting Core Verification");
  await hre.run("verify:verify", {
    address: core.address,
    contract: "contracts/Core.sol:Core",
    constructorArguments: [
      usdc.address,
      tokenFactory.address,
      saleFactory.address,
      contentFactory.address,
      rewarderFactory.address,
    ],
  });
  console.log("Core Verified");
}

async function deployMulticall() {
  console.log("Starting Multicall Deployment");
  const multicallArtifact = await ethers.getContractFactory("Multicall");
  const multicallContract = await multicallArtifact.deploy(core.address, {
    gasPrice: ethers.gasPrice,
  });
  multicall = await multicallContract.deployed();
  await sleep(5000);
  console.log("Multicall Deployed at:", multicall.address);
}

async function verifyMulticall() {
  console.log("Starting Multicall Verification");
  await hre.run("verify:verify", {
    address: multicall.address,
    contract: "contracts/Multicall.sol:Multicall",
    constructorArguments: [core.address],
  });
  console.log("Multicall Verified");
}

async function deployRouter() {
  console.log("Starting Router Deployment");
  const routerArtifact = await ethers.getContractFactory("Router");
  const routerContract = await routerArtifact.deploy(core.address, {
    gasPrice: ethers.gasPrice,
  });
  router = await routerContract.deployed();
  await sleep(5000);
  console.log("Router Deployed at:", router.address);
}

async function verifyRouter() {
  console.log("Starting Router Verification");
  await hre.run("verify:verify", {
    address: router.address,
    contract: "contracts/Router.sol:Router",
    constructorArguments: [core.address],
  });
  console.log("Router Verified");
}

async function printDeployment() {
  console.log("**************************************************************");
  console.log("USDC: ", usdc.address);
  console.log("TokenFactory: ", tokenFactory.address);
  console.log("SaleFactory: ", saleFactory.address);
  console.log("ContentFactory: ", contentFactory.address);
  console.log("RewarderFactory: ", rewarderFactory.address);
  console.log("Core: ", core.address);
  console.log("Multicall: ", multicall.address);
  console.log("Router: ", router.address);
  console.log("**************************************************************");
}

async function verifyToken(wallet) {
  console.log("Starting Token Verification");
  await hre.run("verify:verify", {
    address: token.address,
    contract: "contracts/TokenFactory.sol:Token",
    constructorArguments: [
      await token.name(),
      await token.symbol(),
      await content.coverUri(),
      core.address,
      usdc.address,
      await core.INITIAL_SUPPLY(),
      await core.RESERVE_VIRT_QUOTE_RAW(),
      saleFactory.address,
      contentFactory.address,
      rewarderFactory.address,
      wallet.address,
      false,
    ],
  });
  console.log("Token Verified");
}

async function verifySale() {
  console.log("Starting Sale Verification");
  await hre.run("verify:verify", {
    address: sale.address,
    contract: "contracts/SaleFactory.sol:Sale",
    constructorArguments: [token.address, usdc.address],
  });
  console.log("Sale Verified");
}

async function verifyContent() {
  console.log("Starting Content Verification");
  await hre.run("verify:verify", {
    address: content.address,
    contract: "contracts/ContentFactory.sol:Content",
    constructorArguments: [
      await token.name(),
      await token.symbol(),
      await content.coverUri(),
      token.address,
      usdc.address,
      rewarderFactory.address,
      false,
    ],
  });
  console.log("Content Verified");
}

async function verifyRewarder() {
  console.log("Starting Rewarder Verification");
  await hre.run("verify:verify", {
    address: rewarder.address,
    contract: "contracts/RewarderFactory.sol:Rewarder",
    constructorArguments: [content.address],
  });
  console.log("Rewarder Verified");
}

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("Using wallet: ", wallet.address);

  await getContracts();

  //===================================================================
  // Deploy System
  //===================================================================

  // console.log("Starting System Deployment");
  // await deployUsdc();
  // await deployTokenFactory();
  // await deploySaleFactory();
  // await deployContentFactory();
  // await deployRewarderFactory();
  // await deployCore();
  // await deployMulticall();
  // await deployRouter();
  // await printDeployment();

  /*********** UPDATE getContracts() with new addresses *************/

  //===================================================================
  // Verify System
  //===================================================================

  // console.log("Starting System Verification");
  // await verifyUsdc();
  // await sleep(5000);
  // await verifyTokenFactory();
  // await sleep(5000);
  // await verifySaleFactory();
  // await sleep(5000);
  // await verifyContentFactory();
  // await sleep(5000);
  // await verifyRewarderFactory();
  // await sleep(5000);
  // await verifyCore();
  // await sleep(5000);
  // await verifyMulticall();
  // await sleep(5000);
  // await verifyRouter();

  // console.log("Verify Token");
  // await verifyToken(wallet);
  // await sleep(5000);
  // await verifySale();
  // await sleep(5000);
  // await verifyContent();
  // await sleep(5000);
  // await verifyRewarder();

  //===================================================================
  // Transactions
  //===================================================================

  console.log("Starting Transactions");

  // console.log("Deploy Token");
  // const createTokenTx = await router.createToken(
  //   "Pepe",
  //   "PEPE",
  //   "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/02069990-70b9-4b84-407e-0f2f249edb00/public",
  //   false
  // );
  // await createTokenTx.wait();
  // console.log("Token Deployed at:", await core.index_Token(2));

  // console.log("Mint USDC");
  // const mintTx = await usdc.mint(wallet.address, convert("10000", 6));
  // await mintTx.wait();
  // console.log("USDC Balance: ", await usdc.balanceOf(wallet.address));

  console.log("Contribute");
  const contributionAmount = convert("100", 6);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(router.address, contributionAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  const contributeTx = await router
    .connect(wallet)
    .contribute(token.address, contributionAmount, {
      gasPrice: ethers.gasPrice,
    });
  await contributeTx.wait();
  console.log("Sale contribution: ", await sale.totalQuoteRaw());

  // console.log("Redeem");
  // const redeemTx = await router.connect(wallet).redeem(token.address, {
  //   gasPrice: ethers.gasPrice,
  // });
  // await redeemTx.wait();
  // console.log(
  //   "User contribution: ",
  //   await sale.account_QuoteRaw(wallet.address)
  // );

  // console.log("Buy Token");
  // const buyAmount = convert("1000", 6);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(router.address, buyAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  // const buyTx = await router
  //   .connect(wallet)
  //   .buy(token.address, AddressZero, buyAmount, 0, 0, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await buyTx.wait();
  // console.log(
  //   "Token bought: ",
  //   ethers.utils.formatUnits(await token.balanceOf(wallet.address), 18)
  // );

  // console.log("Sell Token");
  // const sellAmount = convert("1000", 18);
  // const approveTx = await token
  //   .connect(wallet)
  //   .approve(router.address, sellAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  // const sellTx = await router
  //   .connect(wallet)
  //   .sell(token.address, AddressZero, sellAmount, 0, 0, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await sellTx.wait();
  // console.log("Token sold: ", await token.balanceOf(wallet.address));

  // console.log("Borrow Credit");
  // const borrowAmount = convert("1", 6);
  // const borrowTx = await token
  //   .connect(wallet)
  //   .borrow(wallet.address, borrowAmount, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await borrowTx.wait();
  // console.log("Token borrowed: ", await token.account_DebtRaw(wallet.address));

  // console.log("Repay Debt");
  // const repayAmount = convert("0.5", 6);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(token.address, repayAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  // const repayTx = await token
  //   .connect(wallet)
  //   .repay(wallet.address, repayAmount, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await repayTx.wait();
  // console.log("Token debt: ", await token.account_DebtRaw(wallet.address));

  // console.log("Heal Token");
  // const healAmount = convert("1000", 6);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(token.address, healAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  // const healTx = await token.connect(wallet).heal(healAmount, {
  //   gasPrice: ethers.gasPrice,
  // });
  // await healTx.wait();
  // console.log("Token price: ", await token.getMarketPrice());

  // console.log("Burn Token");
  // const burnAmount = convert("1000", 18);
  // const burnTx = await token.connect(wallet).burn(burnAmount, {
  //   gasPrice: ethers.gasPrice,
  // });
  // await burnTx.wait();
  // console.log("Token price: ", await token.getMarketPrice());

  // console.log("Create Content");
  // const contentTx = await router
  //   .connect(wallet)
  //   .createContent(
  //     token.address,
  //     "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/8d0019d8-1e8b-43cf-ecee-1a87b46a5c00/public",
  //     {
  //       gasPrice: ethers.gasPrice,
  //     }
  //   );
  // await contentTx.wait();
  // console.log("Content created: ", await content.tokenURI(3));

  // console.log("Curate Content");
  // const contentPrice = await content.getNextPrice(1);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(router.address, contentPrice, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await approveTx.wait();
  // const curateTx = await router
  //   .connect(wallet)
  //   .curateContent(token.address, 1, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await curateTx.wait();
  // console.log("Content price: ", await content.getNextPrice(1));

  // console.log("Transfer Token");
  // const targetAddress = "0x19858F6c29eA886853dc97D1a68ABf8d4Cb07712";
  // const transferAmount = convert("1000", 18);
  // const transferTx = await token
  //   .connect(wallet)
  //   .transfer(targetAddress, transferAmount, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await transferTx.wait();
  // console.log("Token transferred: ", await token.balanceOf(targetAddress));

  // console.log("Claim Reward");
  // const claimTx = await router.connect(wallet).getContentReward(token.address, {
  //   gasPrice: ethers.gasPrice,
  // });
  // await claimTx.wait();
  // console.log("Reward claimed: ");

  // console.log("Update coverUri");
  // const updateCoverUriTx = await content
  //   .connect(wallet)
  //   .setCoverUri(
  //     "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/a6763307-44b2-4579-275a-50f27f2de700/public",
  //     {
  //       gasPrice: ethers.gasPrice,
  //     }
  //   );
  // await updateCoverUriTx.wait();
  // console.log("CoverUri updated: ", await content.coverUri());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
