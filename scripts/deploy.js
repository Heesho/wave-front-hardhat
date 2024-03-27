const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");
const hre = require("hardhat");
const AddressZero = "0x0000000000000000000000000000000000000000";

/*===================================================================*/
/*===========================  SETTINGS  ============================*/

const BASE_ADDRESS = "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"; // BASE Token Address (eg WMATIC on Mumbai)
const TREASURY_ADDRESS = "0x19858F6c29eA886853dc97D1a68ABf8d4Cb07712"; // Treasury Address

const meme1 = {
  index: 1,
  name: "HenloWorld",
  symbol: "HENLO",
  uri: "https://m.media-amazon.com/images/I/51jctBmVm5L._AC_UF894,1000_QL80_.jpg",
};

const meme2 = {
  index: 2,
  name: "PepeBusiness",
  symbol: "PEPEBIZ",
  uri: "https://www.tbstat.com/cdn-cgi/image/format=webp,q=75/wp/uploads/2023/05/Fvz9hOIXwAEaIR8.jpeg",
};

const meme3 = {
  index: 3,
  name: "Doge in a Taco",
  symbol: "DOGETACO",
  uri: "https://external-preview.redd.it/56OAprDalFy7aI2_Ve2kdFfBPenTYAh23T9PnKktTro.jpg?auto=webp&s=f2687b16f02330117e20931c0e177423519803fc",
};

const meme4 = {
  index: 4,
  name: "Cat Wif Hat",
  symbol: "CWH",
  uri: "https://i.etsystatic.com/18460845/r/il/d7df20/3538227185/il_fullxfull.3538227185_lotd.jpg",
};

const meme5 = {
  index: 5,
  name: "Conspiracies",
  symbol: "CHARLIE",
  uri: "https://i.kym-cdn.com/entries/icons/original/000/022/524/pepe_silvia_meme_banner.jpg",
};

const meme6 = {
  index: 6,
  name: "LilGuy",
  symbol: "HAMSTER",
  uri: "https://i.kym-cdn.com/news_feeds/icons/mobile/000/035/373/c98.jpg",
};

const meme7 = {
  index: 7,
  name: "Shrek Knows Something We Don't",
  symbol: "SHREK",
  uri: "https://snworksceo.imgix.net/dth/84e832cc-b853-40d1-bcf9-bd0d2aae2bec.sized-1000x1000.png?w=800&h=600",
};

const meme8 = {
  index: 8,
  name: "CarSalesman",
  symbol: "CARS",
  uri: "https://helios-i.mashable.com/imagery/articles/068tGOwxBzz2IjPMTXee8SH/hero-image.fill.size_1200x900.v1614270504.jpg",
};

/*===========================  END SETTINGS  ========================*/
/*===================================================================*/

// Constants
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);

// Contract Variables
let tokenFactory, factory, multicall, router;
let token, preToken, TokenFees;

/*===================================================================*/
/*===========================  CONTRACT DATA  =======================*/

async function getContracts() {
  tokenFactory = await ethers.getContractAt(
    "contracts/TokenFactory.sol:TokenFactory",
    "0xCD645F4bE804B0ac10045Bfab265E56c0C0Be4B3"
  );
  factory = await ethers.getContractAt(
    "contracts/WaveFrontFactory.sol:WaveFrontFactory",
    "0x9Fa5b54Df8c48b1f448D63007122baC30cAC26f7"
  );
  multicall = await ethers.getContractAt(
    "contracts/WaveFrontMulticall.sol:WaveFrontMulticall",
    "0xC9Fce24eD05bb773935859e5CCb037CB7e78a459"
  );
  router = await ethers.getContractAt(
    "contracts/WaveFrontRouter.sol:WaveFrontRouter",
    "0x690D4601F99d7d5AB2A72af821d037E9A37168df"
  );
  token = await ethers.getContractAt(
    "contracts/TokenFactory.sol:Token",
    "0x3d9dF7B0474Fe29E769082A2686d2B8aC5d1313f"
  );
  console.log("Contracts Retrieved");
}

/*===========================  END CONTRACT DATA  ===================*/
/*===================================================================*/

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

async function deployFactory() {
  console.log("Starting WaveFrontFactory Deployment");
  const factoryArtifact = await ethers.getContractFactory("WaveFrontFactory");
  const factoryContract = await factoryArtifact.deploy(
    tokenFactory.address,
    BASE_ADDRESS,
    TREASURY_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  factory = await factoryContract.deployed();
  await sleep(5000);
  console.log("Factory Deployed at:", factory.address);
}

async function deployMulticall() {
  console.log("Starting WaveFrontMulticall Deployment");
  const multicallArtifact = await ethers.getContractFactory(
    "WaveFrontMulticall"
  );
  const multicallContract = await multicallArtifact.deploy(
    factory.address,
    BASE_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  multicall = await multicallContract.deployed();
  await sleep(5000);
  console.log("Multicall Deployed at:", multicall.address);
}

async function deployRouter() {
  console.log("Starting WaveFrontRouter Deployment");
  const routerArtifact = await ethers.getContractFactory("WaveFrontRouter");
  const routerContract = await routerArtifact.deploy(
    factory.address,
    BASE_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  router = await routerContract.deployed();
  await sleep(5000);
  console.log("Router Deployed at:", router.address);
}

async function printDeployment() {
  console.log("**************************************************************");
  console.log("Factory: ", factory.address);
  console.log("Multicall: ", multicall.address);
  console.log("Router: ", router.address);
  console.log("**************************************************************");
}

async function verifyTokenFactory() {
  console.log("Starting TokenFactory Verification");
  await hre.run("verify:verify", {
    address: tokenFactory.address,
    contract: "contracts/TokenFactory.sol:TokenFactory",
    constructorArguments: [],
  });
  console.log("TokenFactory Verified");
}

async function verifyFactory() {
  console.log("Starting Factory Verification");
  await hre.run("verify:verify", {
    address: factory.address,
    contract: "contracts/WaveFrontFactory.sol:WaveFrontFactory",
    constructorArguments: [
      tokenFactory.address,
      BASE_ADDRESS,
      TREASURY_ADDRESS,
    ],
  });
  console.log("Factory Verified");
}

async function verifyMulticall() {
  console.log("Starting Multicall Verification");
  await hre.run("verify:verify", {
    address: multicall.address,
    contract: "contracts/WaveFrontMulticall.sol:WaveFrontMulticall",
    constructorArguments: [factory.address, BASE_ADDRESS],
  });
  console.log("Multicall Verified");
}

async function verifyRouter() {
  console.log("Starting Router Verification");
  await hre.run("verify:verify", {
    address: router.address,
    contract: "contracts/WaveFrontRouter.sol:WaveFrontRouter",
    constructorArguments: [factory.address, BASE_ADDRESS],
  });
  console.log("Router Verified");
}

async function deployToken() {
  console.log("Starting Token Deployment");
  await router.createToken(meme1.name, meme1.symbol, meme1.uri, {
    value: ethers.utils.parseEther("0.01"),
    gasPrice: ethers.gasPrice,
  });
  token = await factory.index_Token(meme1.index);
  await sleep(5000);
  console.log("Token Deployed at:", token);
}

async function verifyToken(wallet) {
  console.log("Starting Token Verification");
  await hre.run("verify:verify", {
    address: token.address,
    contract: "contracts/TokenFactory.sol:Token",
    constructorArguments: [
      meme1.name,
      meme1.symbol,
      meme1.uri,
      BASE_ADDRESS,
      factory.address,
      wallet,
    ],
  });
  console.log("Token Verified");
}

async function verifyPreToken() {
  console.log("Starting PreToken Verification");
  await hre.run("verify:verify", {
    address: await token.preToken(),
    contract: "contracts/TokenFactory.sol:PreToken",
    constructorArguments: [BASE_ADDRESS],
  });
  console.log("PreToken Verified");
}

async function verifyTokenFees() {
  console.log("Starting TokenFees Verification");
  await hre.run("verify:verify", {
    address: await token.fees(),
    contract: "contracts/TokenFactory.sol:TokenFees",
    constructorArguments: [BASE_ADDRESS],
  });
  console.log("Token Verified");
}

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("Using wallet: ", wallet.address);

  await getContracts();

  //===================================================================
  // 1. Deploy System
  //===================================================================

  // console.log("Starting System Deployment");
  // await deployTokenFactory();
  // await deployFactory();
  // await deployMulticall();
  // await deployRouter();
  // await printDeployment();

  /*********** UPDATE getContracts() with new addresses *************/

  //===================================================================
  // 2. Verify System
  //===================================================================

  // console.log("Starting System Verificatrion Deployment");
  // await verifyFactory();
  // await verifyMulticall();
  // await verifyRouter();

  //===================================================================
  // 3. Deploy Token
  //===================================================================

  // console.log("Starting Token Delpoyment");
  // await deployToken();
  // console.log("Token Deployed");

  //===================================================================
  // 4. Verify Token
  //===================================================================

  console.log("Starting Token Verification");
  await verifyToken(wallet.address);
  await verifyPreToken();
  await verifyTokenFees();
  console.log("Token Verified");

  //===================================================================
  // 4. Transactions
  //===================================================================

  // token = await ethers.getContractAt(
  //   "contracts/Meme.sol:Meme",
  //   await factory.getMemeByIndex(1)
  // );

  // contribute
  // await router.contribute(token.address, {
  //   value: ethers.utils.parseEther("0.01"),
  // });

  // redeem
  // await router.redeem(meme.address);

  // buy
  // await router.buy(meme.address, AddressZero, 0, 1904422437, {
  //   value: ethers.utils.parseEther("0.01"),
  // });

  // sell
  // await meme.approve(router.address, ethers.utils.parseEther("1"));
  // await router.sell(meme.address, ethers.utils.parseEther("1"), 0, 0);

  // claim
  // await router.claimFees([meme.address]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
