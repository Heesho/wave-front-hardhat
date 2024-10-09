import { WaveFrontFactory__MemeCreated } from "../generated/WaveFrontFactory/WaveFrontFactory";
import { Account, Directory, Token, TokenPosition } from "../generated/schema";
import { Meme, PreMeme } from "../generated/templates";
import { Address } from "@graphprotocol/graph-ts";
import {
  FACTORY_ADDRESS,
  ONE_BI,
  PREMARKET_DURATION,
  INITIAL_PRICE,
  ZERO_BD,
  ZERO_BI,
  TEN_BI,
  THREE_BI,
  INITIAL_SUPPLY,
} from "./helpers";

export function handleWaveFrontFactory__MemeCreated(
  event: WaveFrontFactory__MemeCreated
): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS));
  if (directory == null) {
    directory = new Directory(Address.fromString(FACTORY_ADDRESS));
    directory.index = ZERO_BI;
    directory.volume = ZERO_BD;
    directory.treasuryFees = ZERO_BD;
  }
  directory.index = directory.index.plus(ONE_BI);
  directory.save();

  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.points = TEN_BI;
    account.debt = ZERO_BD;
    account.providerFees = ZERO_BD;
    account.leaderFees = ZERO_BD;
    account.creatorFees = ZERO_BD;
    account.referrals = ZERO_BI;
  }
  account.points = account.points.plus(THREE_BI);
  account.save();

  Meme.create(event.params.meme);
  PreMeme.create(event.params.preMeme);

  let token = Token.load(event.params.meme);
  if (token === null) {
    token = new Token(event.params.meme);
    token.name = event.params.name;
    token.symbol = event.params.symbol;
    token.uri = event.params.uri;
    token.creator = event.params.account;
    token.leader = event.params.account;
    token.contributed = ZERO_BD;
    token.marketPrice = INITIAL_PRICE;
    token.totalSupply = INITIAL_SUPPLY;
    token.marketCap = INITIAL_PRICE.times(INITIAL_SUPPLY);
    token.contributors = ZERO_BI;
    token.holders = ZERO_BI;
    token.volume = ZERO_BD;
    token.open = false;
    token.openAt = event.block.timestamp.plus(PREMARKET_DURATION);
    token.priceChange = "UP";
  }
  token.save();

  let tokenPosition = TokenPosition.load(
    event.params.meme.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      event.params.meme.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.account = event.params.account;
    tokenPosition.token = event.params.meme;
    tokenPosition.contributed = ZERO_BD;
    tokenPosition.balance = ZERO_BD;
    tokenPosition.created = true;
    tokenPosition.leader = true;
    tokenPosition.creatorFeesBase = ZERO_BD;
    tokenPosition.creatorFeesMeme = ZERO_BD;
    tokenPosition.leaderFeesBase = ZERO_BD;
    tokenPosition.leaderFeesMeme = ZERO_BD;
    tokenPosition.providerFeesBase = ZERO_BD;
    tokenPosition.providerFeesMeme = ZERO_BD;
  }
  tokenPosition.save();
}
