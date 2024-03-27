import {
  WaveFrontFactory__TokenCreated as WaveFrontactory__TokenCreatedEvent,
  WaveFrontFactory__TreasuryUpdated as WaveFrontFactory__TreasuryUpdatedEvent,
  WaveFrontFactory__MinAmountInUpdated as WaveFrontFactory__MinAmountInUpdatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
} from "../generated/WaveFrontFactory/WaveFrontFactory";
import { Directory, Token } from "../generated/schema";
import { Token as Meme, PreToken as PreMeme } from "../generated/templates";
import { WaveFrontFactory } from "../generated/WaveFrontFactory/WaveFrontFactory";
import { WaveFrontMulticall } from "../generated/templates/Token/WaveFrontMulticall";
import { Address } from "@graphprotocol/graph-ts";
import {
  FACTORY_ADDRESS,
  MULTICALL_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  convertEthToDecimal,
} from "./helpers";

export function handleWaveFrontFactory__TokenCreated(
  event: WaveFrontactory__TokenCreatedEvent
): void {
  let factory = WaveFrontFactory.bind(event.address);
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS));
  if (directory === null) {
    directory = new Directory(Address.fromString(FACTORY_ADDRESS));
    directory.owner = factory.owner();
    directory.treasury = factory.treasury();
    directory.count = ZERO_BI;
    directory.txCount = ZERO_BI;
    directory.volume = ZERO_BD;
    directory.earnings = ZERO_BD;
    directory.minAmountIn = convertEthToDecimal(factory.minAmountIn());
    directory.save();
  }
  directory.count = directory.count.plus(ONE_BI);
  directory.save();

  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.params.token);

  Meme.create(event.params.token);
  PreMeme.create(meme.preToken);

  let token = Token.load(meme.token);
  if (token === null) {
    token = new Token(meme.token);
    token.index = meme.index;
    token.name = meme.name;
    token.symbol = meme.symbol;
    token.uri = meme.uri;
    token.status = meme.status;
    token.meme = meme.token;
    token.preMeme = meme.preToken;
    token.fees = meme.fees;
    token.statusHolder = meme.statusHolder;
    token.createdAt = event.block.timestamp;
    token.openAt = meme.marketOpenTimestamp;
    token.open = meme.marketOpen;
    token.preMemeBalance = convertEthToDecimal(meme.preTokenBalance);
    token.baseContributed = convertEthToDecimal(meme.baseContributed);
    token.reserveVirtualBase = convertEthToDecimal(meme.reserveVirtualBase);
    token.reserveRealBase = convertEthToDecimal(meme.reserveBase);
    token.reserveRealMeme = convertEthToDecimal(meme.reserveToken);
    token.totalSupply = convertEthToDecimal(meme.totalSupply);
    token.floorPrice = convertEthToDecimal(meme.floorPrice);
    token.marketPrice = convertEthToDecimal(meme.marketPrice);
    token.rewardsBase = convertEthToDecimal(meme.totalRewardsBase);
    token.totalDebt = convertEthToDecimal(meme.totalDebt);
    token.volume = ZERO_BD;
    token.txCount = ZERO_BI;
  }
  token.save();
}

export function handleWaveFrontFactory__TreasuryUpdated(
  event: WaveFrontFactory__TreasuryUpdatedEvent
): void {
  let factory = WaveFrontFactory.bind(event.address);
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS));
  if (directory === null) {
    directory = new Directory(Address.fromString(FACTORY_ADDRESS));
    directory.owner = factory.owner();
    directory.treasury = factory.treasury();
    directory.count = ZERO_BI;
    directory.txCount = ZERO_BI;
    directory.volume = ZERO_BD;
    directory.earnings = ZERO_BD;
    directory.minAmountIn = convertEthToDecimal(factory.minAmountIn());
    directory.save();
  } else {
    directory.treasury = factory.treasury();
  }
  directory.save();
}

export function handleWaveFrontFactory__MinAmountInUpdated(
  event: WaveFrontFactory__MinAmountInUpdatedEvent
): void {
  let factory = WaveFrontFactory.bind(event.address);
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS));
  if (directory === null) {
    directory = new Directory(Address.fromString(FACTORY_ADDRESS));
    directory.owner = factory.owner();
    directory.treasury = factory.treasury();
    directory.count = ZERO_BI;
    directory.txCount = ZERO_BI;
    directory.volume = ZERO_BD;
    directory.earnings = ZERO_BD;
    directory.minAmountIn = convertEthToDecimal(factory.minAmountIn());
    directory.save();
  } else {
    directory.owner = factory.owner();
  }
  directory.save();
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let factory = WaveFrontFactory.bind(event.address);
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS));
  if (directory === null) {
    directory = new Directory(Address.fromString(FACTORY_ADDRESS));
    directory.owner = factory.owner();
    directory.treasury = factory.treasury();
    directory.count = ZERO_BI;
    directory.txCount = ZERO_BI;
    directory.volume = ZERO_BD;
    directory.earnings = ZERO_BD;
    directory.minAmountIn = convertEthToDecimal(factory.minAmountIn());
    directory.save();
  } else {
    directory.owner = factory.owner();
  }
  directory.save();
}
