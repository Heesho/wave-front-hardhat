const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");
const hre = require("hardhat");
const AddressZero = "0x0000000000000000000000000000000000000000";

/*===================================================================*/
/*===========================  SETTINGS  ============================*/

const BASE_ADDRESS = "0x4200000000000000000000000000000000000006"; // BASE token Address (eg wETH on Base)
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
let memeFactory, factory, multicallSubgraph, multicallFrontend, router;
let meme, preMeme, MemeFees;

/*===================================================================*/
/*===========================  CONTRACT DATA  =======================*/

async function getContracts() {
  memeFactory = await ethers.getContractAt(
    "contracts/MemeFactory.sol:MemeFactory",
    "0x17548E0b3f3d556907DF9A61352afB18D8506C32"
  );
  factory = await ethers.getContractAt(
    "contracts/WaveFrontFactory.sol:WaveFrontFactory",
    "0xaB0Ab38Ade96aF42742b0030F201E05eCca127d4"
  );
  multicallSubgraph = await ethers.getContractAt(
    "contracts/WaveFrontMulticallSubgraph.sol:WaveFrontMulticallSubgraph",
    "0xdCE6609d7b9c933E9aCC453EDA6713c8B9efA067"
  );
  multicallFrontend = await ethers.getContractAt(
    "contracts/WaveFrontMulticallFrontend.sol:WaveFrontMulticallFrontend",
    "0xb7b7B8DF8cAF2829971329BD71D0b7127D0734be"
  );
  router = await ethers.getContractAt(
    "contracts/WaveFrontRouter.sol:WaveFrontRouter",
    "0x43FDE9Cb7D2BD5F91e920Ea6f4206Fe3015194B2"
  );
  // meme = await ethers.getContractAt(
  //   "contracts/MemeFactory.sol:Meme",
  //   ""
  // );
  console.log("Contracts Retrieved");
}

/*===========================  END CONTRACT DATA  ===================*/
/*===================================================================*/

async function deployMemeFactory() {
  console.log("Starting MemeFactory Deployment");
  const memeFactoryArtifact = await ethers.getContractFactory("MemeFactory");
  const memeFactoryContract = await memeFactoryArtifact.deploy({
    gasPrice: ethers.gasPrice,
  });
  memeFactory = await memeFactoryContract.deployed();
  await sleep(5000);
  console.log("MemeFactory Deployed at:", memeFactory.address);
}

async function deployFactory() {
  console.log("Starting WaveFrontFactory Deployment");
  const factoryArtifact = await ethers.getContractFactory("WaveFrontFactory");
  const factoryContract = await factoryArtifact.deploy(
    memeFactory.address,
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

async function deployMulticallSubgraph() {
  console.log("Starting WaveFrontMulticallSubgraph Deployment");
  const multicallSubgraphArtifact = await ethers.getContractFactory(
    "WaveFrontMulticallSubgraph"
  );
  const multicallSubgraphContract = await multicallSubgraphArtifact.deploy(
    factory.address,
    BASE_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  multicallSubgraph = await multicallSubgraphContract.deployed();
  await sleep(5000);
  console.log("MulticallSubgraph Deployed at:", multicallSubgraph.address);
}

async function deployMulticallFrontend() {
  console.log("Starting WaveFrontMulticallFrontend Deployment");
  const multicallFrontendArtifact = await ethers.getContractFactory(
    "WaveFrontMulticallFrontend"
  );
  const multicallFrontendContract = await multicallFrontendArtifact.deploy(
    factory.address,
    BASE_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  multicallFrontend = await multicallFrontendContract.deployed();
  await sleep(5000);
  console.log("MulticallFrontend Deployed at:", multicallFrontend.address);
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
  console.log("MemeFactory: ", memeFactory.address);
  console.log("WaveFrontFactory: ", factory.address);
  console.log("MulticallSubgraph: ", multicallSubgraph.address);
  console.log("MulticallFrontend: ", multicallFrontend.address);
  console.log("Router: ", router.address);
  console.log("**************************************************************");
}

async function verifyMemeFactory() {
  console.log("Starting MemeFactory Verification");
  await hre.run("verify:verify", {
    address: memeFactory.address,
    contract: "contracts/MemeFactory.sol:MemeFactory",
    constructorArguments: [],
  });
  console.log("MemeFactory Verified");
}

async function verifyFactory() {
  console.log("Starting Factory Verification");
  await hre.run("verify:verify", {
    address: factory.address,
    contract: "contracts/WaveFrontFactory.sol:WaveFrontFactory",
    constructorArguments: [memeFactory.address, BASE_ADDRESS, TREASURY_ADDRESS],
  });
  console.log("Factory Verified");
}

async function verifyMulticallSubgraph() {
  console.log("Starting MulticallSubgraph Verification");
  await hre.run("verify:verify", {
    address: multicallSubgraph.address,
    contract:
      "contracts/WaveFrontMulticallSubgraph.sol:WaveFrontMulticallSubgraph",
    constructorArguments: [factory.address, BASE_ADDRESS],
  });
  console.log("MulticallSubgraph Verified");
}

async function verifyMulticallFrontend() {
  console.log("Starting MulticallFrontend Verification");
  await hre.run("verify:verify", {
    address: multicallFrontend.address,
    contract:
      "contracts/WaveFrontMulticallFrontend.sol:WaveFrontMulticallFrontend",
    constructorArguments: [factory.address, BASE_ADDRESS],
  });
  console.log("MulticallFrontend Verified");
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

async function deployMeme() {
  console.log("Starting Meme Deployment");
  await router.createMeme(meme1.name, meme1.symbol, meme1.uri, {
    value: ethers.utils.parseEther("0.01"),
    gasPrice: ethers.gasPrice,
  });
  meme = await factory.index_Meme(meme1.index);
  await sleep(5000);
  console.log("Meme Deployed at:", meme);
}

async function verifyMeme(wallet) {
  console.log("Starting Meme Verification");
  await hre.run("verify:verify", {
    address: meme.address,
    contract: "contracts/MemeFactory.sol:Meme",
    constructorArguments: [
      await meme.name(),
      await meme.symbol(),
      await meme.uri(),
      BASE_ADDRESS,
      factory.address,
      wallet,
    ],
  });
  console.log("Meme Verified");
}

async function verifyPreMeme() {
  console.log("Starting PreMeme Verification");
  await hre.run("verify:verify", {
    address: await meme.preMeme(),
    contract: "contracts/MemeFactory.sol:PreMeme",
    constructorArguments: [BASE_ADDRESS],
  });
  console.log("PreMeme Verified");
}

async function verifyMemeFees() {
  console.log("Starting MemeFees Verification");
  await hre.run("verify:verify", {
    address: await meme.fees(),
    contract: "contracts/MemeFactory.sol:MemeFees",
    constructorArguments: [BASE_ADDRESS],
  });
  console.log("Meme Verified");
}

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("Using wallet: ", wallet.address);

  await getContracts();

  //===================================================================
  // 1. Deploy System
  //===================================================================

  // console.log("Starting System Deployment");
  // await deployMemeFactory();
  // await deployFactory();
  // await deployMulticallSubgraph();
  // await deployMulticallFrontend();
  // await deployRouter();
  // await printDeployment();

  /*********** UPDATE getContracts() with new addresses *************/

  //===================================================================
  // 2. Verify System
  //===================================================================

  console.log("Starting System Verificatrion Deployment");
  await verifyMemeFactory();
  await verifyFactory();
  await verifyMulticallSubgraph();
  await verifyMulticallFrontend();
  await verifyRouter();

  //===================================================================
  // 3. Deploy Meme
  //===================================================================

  // console.log("Starting Meme Delpoyment");
  // await deployMeme();
  // console.log("Meme Deployed");

  //===================================================================
  // 4. Verify Meme
  //===================================================================

  // console.log("Starting Meme Verification");
  // await verifyMeme(wallet.address);
  // await verifyPreMeme();
  // await verifyMemeFees();
  // console.log("Meme Verified");

  //===================================================================
  // 4. Transactions
  //===================================================================

  // meme = await ethers.getContractAt(
  //   "contracts/Meme.sol:Meme",
  //   await factory.getMemeByIndex(1)
  // );

  // contribute
  // await router.contribute(meme.address, {
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
