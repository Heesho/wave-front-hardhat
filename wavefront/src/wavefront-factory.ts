import {
  WaveFrontFactory__MemeCreated as WaveFrontactory__MemeCreatedEvent,
  WaveFrontFactory__TreasuryUpdated as WaveFrontFactory__TreasuryUpdatedEvent,
  WaveFrontFactory__MinAmountInUpdated as WaveFrontFactory__MinAmountInUpdatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
} from "../generated/WaveFrontFactory/WaveFrontFactory";
import { Account, Directory, Token } from "../generated/schema";
import { Meme, PreMeme } from "../generated/templates";
import { WaveFrontFactory } from "../generated/WaveFrontFactory/WaveFrontFactory";
import { WaveFrontMulticall } from "../generated/templates/Meme/WaveFrontMulticall";
import { Address } from "@graphprotocol/graph-ts";
import {
  FACTORY_ADDRESS,
  MULTICALL_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  convertEthToDecimal,
} from "./helpers";

export function handleWaveFrontFactory__MemeCreated(
  event: WaveFrontactory__MemeCreatedEvent
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
  let meme = multicall.getMemeData(event.params.meme);

  Meme.create(event.params.meme);
  PreMeme.create(meme.preMeme);

  let token = Token.load(meme.meme);
  if (token === null) {
    token = new Token(meme.meme);
    token.index = meme.index;
    token.name = meme.name;
    token.symbol = meme.symbol;
    token.uri = meme.uri;
    token.status = meme.status;
    token.meme = meme.meme;
    token.preMeme = meme.preMeme;
    token.fees = meme.fees;
    token.creator = meme.statusHolder;
    token.statusHolder = meme.statusHolder;
    token.createdAt = event.block.timestamp;
    token.openAt = meme.marketOpenTimestamp;
    token.open = meme.marketOpen;
    token.preMemeBalance = convertEthToDecimal(meme.preMemeBalance);
    token.baseContributed = convertEthToDecimal(meme.baseContributed);
    token.reserveVirtualBase = convertEthToDecimal(meme.reserveVirtualBase);
    token.reserveRealBase = convertEthToDecimal(meme.reserveBase);
    token.reserveRealMeme = convertEthToDecimal(meme.reserveMeme);
    token.totalSupply = convertEthToDecimal(meme.totalSupply);
    token.floorPrice = convertEthToDecimal(meme.floorPrice);
    token.marketPrice = convertEthToDecimal(meme.marketPrice);
    token.marketCap = convertEthToDecimal(meme.marketCap);
    token.liquidity = convertEthToDecimal(meme.liquidity);
    token.rewardsBase = convertEthToDecimal(meme.totalRewardsBase);
    token.totalDebt = convertEthToDecimal(meme.totalDebt);
    token.volume = ZERO_BD;
    token.txCount = ZERO_BI;
  }
  token.save();

  let account = Account.load(token.creator);
  if (account === null) {
    account = new Account(token.creator);
    account.referrals = ZERO_BI;
    account.statusEarnings = ZERO_BD;
    account.holderEarnings = ZERO_BD;
    account.providerEarnings = ZERO_BD;
  }
  account.save();
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
