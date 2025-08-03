const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");
const hre = require("hardhat");
const AddressZero = "0x0000000000000000000000000000000000000000";

/*===================================================================*/
/*===========================  SETTINGS  ============================*/

const TREASURY_ADDRESS = "0x039ec2E90454892fCbA461Ecf8878D0C45FDdFeE"; // Treasury Address
const TOKEN0 = "0x044B15F5C6775d75797C221a173CBd94230C539A"; // Token0 Address

/*===========================  END SETTINGS  ========================*/
/*===================================================================*/

// Constants
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);

// Contract Variables
let usdc;
let tokenFactory, saleFactory, contentFactory, rewarderFactory;
let wavefront, multicall, router;
let token, sale, content, rewarder;

/*===================================================================*/
/*===========================  CONTRACT DATA  =======================*/

async function getContracts() {
  usdc = await ethers.getContractAt(
    "contracts/mocks/USDC.sol:USDC",
    "0x4293476Ee8D814F29917A23cEeF2653f6cC48ed6"
  );

  tokenFactory = await ethers.getContractAt(
    "contracts/TokenFactory.sol:TokenFactory",
    "0x4232d1F05a4EBce7c42DD1EC82dc2b2A8e025ED4"
  );
  saleFactory = await ethers.getContractAt(
    "contracts/SaleFactory.sol:SaleFactory",
    "0x3E5b9a5D7D73D8781c4782910523b942dB831ef8"
  );
  contentFactory = await ethers.getContractAt(
    "contracts/ContentFactory.sol:ContentFactory",
    "0x2FB9b9aA581c4a9e2314329A93C0cD1a8C152827"
  );
  rewarderFactory = await ethers.getContractAt(
    "contracts/RewarderFactory.sol:RewarderFactory",
    "0xcD4aE9b8ddaA57B8aDd77fA3193dA12B3b6765b3"
  );

  wavefront = await ethers.getContractAt(
    "contracts/WaveFront.sol:WaveFront",
    "0xe6e41bd765Ff3103fC3332F3E4f592C50AA5B37C"
  );
  multicall = await ethers.getContractAt(
    "contracts/WaveFrontMulticall.sol:WaveFrontMulticall",
    "0x5A472F4e2999d391f32A985C655eC745658D31Ce"
  );
  router = await ethers.getContractAt(
    "contracts/WaveFrontRouter.sol:WaveFrontRouter",
    "0x08ec71e3b7A87d78e89d765e10eAe345419aFf9a"
  );

  token = await ethers.getContractAt(
    "contracts/TokenFactory.sol:Token",
    "0x044B15F5C6775d75797C221a173CBd94230C539A"
  );
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

async function deployWaveFront() {
  console.log("Starting WaveFront Deployment");
  const wavefrontArtifact = await ethers.getContractFactory("WaveFront");
  const wavefrontContract = await wavefrontArtifact.deploy(
    usdc.address,
    tokenFactory.address,
    saleFactory.address,
    contentFactory.address,
    rewarderFactory.address,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  wavefront = await wavefrontContract.deployed();
  await sleep(5000);
  console.log("WaveFront Deployed at:", wavefront.address);
}

async function verifyWaveFront() {
  console.log("Starting WaveFront Verification");
  await hre.run("verify:verify", {
    address: wavefront.address,
    contract: "contracts/WaveFront.sol:WaveFront",
    constructorArguments: [
      usdc.address,
      tokenFactory.address,
      saleFactory.address,
      contentFactory.address,
      rewarderFactory.address,
    ],
  });
  console.log("WaveFront Verified");
}

async function deployMulticall() {
  console.log("Starting Multicall Deployment");
  const multicallArtifact = await ethers.getContractFactory(
    "WaveFrontMulticall"
  );
  const multicallContract = await multicallArtifact.deploy(wavefront.address, {
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
    contract: "contracts/WaveFrontMulticall.sol:WaveFrontMulticall",
    constructorArguments: [wavefront.address],
  });
  console.log("Multicall Verified");
}

async function deployRouter() {
  console.log("Starting Router Deployment");
  const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
  const routerContract = await routerArtifact.deploy(wavefront.address, {
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
    contract: "contracts/WaveFrontRouter.sol:WaveFrontRouter",
    constructorArguments: [wavefront.address],
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
  console.log("WaveFront: ", wavefront.address);
  console.log("Multicall: ", multicall.address);
  console.log("Router: ", router.address);
  console.log("**************************************************************");
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
  // await deployWaveFront();
  // await deployMulticall();
  // await deployRouter();
  // await printDeployment();

  /*********** UPDATE getContracts() with new addresses *************/

  //===================================================================
  // Verify System
  //===================================================================

  // console.log("Starting System Verificatrion Deployment");
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
  // await verifyWaveFront();
  // await sleep(5000);
  // await verifyMulticall();
  // await sleep(5000);
  // await verifyRouter();

  //===================================================================
  // Transactions
  //===================================================================

  console.log("Starting Transactions");

  // console.log("Deploy Token");
  // token = await router.createToken("Token0", "TOK0", "ipfs://token0", false);
  // console.log("Token Deployed at:", await wavefront.index_Token(1));
  // console.log("Sale Deployed at: ", await token.sale());
  // console.log("Content Deployed at: ", await token.content());
  // console.log("Rewarder Deployed at: ", await token.rewarder());

  // console.log("Mint USDC");
  // await usdc.mint(wallet.address, convert("10000", 6));

  // console.log("Contribute");
  // const contributionAmount = convert("100", 6);
  // const approveTx = await usdc
  //   .connect(wallet)
  //   .approve(router.address, contributionAmount, { gasPrice: ethers.gasPrice });
  // await approveTx.wait();
  // const contributeTx = await router
  //   .connect(wallet)
  //   .contribute(token.address, contributionAmount, {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await contributeTx.wait();
  // console.log("Sale contribution: ", await sale.totalQuoteRaw());

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
  // console.log(
  //   "Token borrowed: ",
  //   await token.account_DebtRaw(wallet.address)
  // );

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
  //   .createContent(token.address, "ipfs://token0/content0", {
  //     gasPrice: ethers.gasPrice,
  //   });
  // await contentTx.wait();
  // console.log("Content created: ", await content.tokenURI(1));

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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
