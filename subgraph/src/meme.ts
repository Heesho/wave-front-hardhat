import { Address } from "@graphprotocol/graph-ts";
import { Account, Directory, Token, TokenPosition } from "../generated/schema";
import {
  Meme__Buy,
  Meme__CreatorFee,
  Meme__MarketOpened,
  Meme__ProviderFee,
  Meme__Sell,
  Meme__StatusFee,
  Meme__StatusUpdated,
  Transfer,
} from "../generated/templates/Meme/Meme";
import {
  ADDRESS_ZERO,
  FACTORY_ADDRESS,
  ONE_BI,
  STATUS_UPDATE_FEE,
  ZERO_BD,
  ZERO_BI,
  convertEthToDecimal,
} from "./helpers";

export function handleMeme__Buy(event: Meme__Buy): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.volume = directory.volume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  directory.save();

  let token = Token.load(event.address)!;
  token.marketPrice = convertEthToDecimal(event.params.amountIn).div(
    convertEthToDecimal(event.params.amountOut)
  );
  token.priceChange = "UP";
  token.circulatingSupply = token.circulatingSupply.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  token.marketCap = token.marketPrice.times(token.circulatingSupply);
  token.volume = token.volume.plus(convertEthToDecimal(event.params.amountIn));
  token.save();
}

export function handleMeme__Sell(event: Meme__Sell): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.volume = directory.volume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  directory.save();

  let token = Token.load(event.address)!;
  token.marketPrice = convertEthToDecimal(event.params.amountOut).div(
    convertEthToDecimal(event.params.amountIn)
  );
  token.priceChange = "DOWN";
  token.circulatingSupply = token.circulatingSupply.minus(
    convertEthToDecimal(event.params.amountIn)
  );
  token.marketCap = token.marketPrice.times(token.circulatingSupply);
  token.volume = token.volume.plus(convertEthToDecimal(event.params.amountOut));
  token.save();
}

export function handleMeme__StatusFee(event: Meme__StatusFee): void {
  let account = Account.load(event.params.account)!;
  account.leaderFees = account.leaderFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.leaderFeesBase = tokenPosition.leaderFeesBase.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  tokenPosition.leaderFeesMeme = tokenPosition.leaderFeesMeme.plus(
    convertEthToDecimal(event.params.amountMeme)
  );
  tokenPosition.save();
}

export function handleMeme__ProviderFee(event: Meme__ProviderFee): void {
  let account = Account.load(event.params.account)!;
  account.providerFees = account.providerFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      event.address.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.account = event.params.account;
    tokenPosition.token = event.address;
    tokenPosition.contributed = ZERO_BD;
    tokenPosition.balance = ZERO_BD;
    tokenPosition.created = false;
    tokenPosition.leader = false;
    tokenPosition.creatorFeesBase = ZERO_BD;
    tokenPosition.creatorFeesMeme = ZERO_BD;
    tokenPosition.leaderFeesBase = ZERO_BD;
    tokenPosition.leaderFeesMeme = ZERO_BD;
    tokenPosition.providerFeesBase = ZERO_BD;
    tokenPosition.providerFeesMeme = ZERO_BD;
  }
  tokenPosition.providerFeesBase = tokenPosition.providerFeesBase.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  tokenPosition.providerFeesMeme = tokenPosition.providerFeesMeme.plus(
    convertEthToDecimal(event.params.amountMeme)
  );
  tokenPosition.save();
}

export function handleMeme__CreatorFee(event: Meme__CreatorFee): void {
  let account = Account.load(event.params.account)!;
  account.creatorFees = account.creatorFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.creatorFeesBase = tokenPosition.creatorFeesBase.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  tokenPosition.creatorFeesMeme = tokenPosition.creatorFeesMeme.plus(
    convertEthToDecimal(event.params.amountMeme)
  );
  tokenPosition.save();
}

export function handleMeme__StatusUpdated(event: Meme__StatusUpdated): void {
  let token = Token.load(event.address)!;
  token.circulatingSupply = token.circulatingSupply.minus(STATUS_UPDATE_FEE);

  let oldLeaderTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.oldAccount.toHexString()
  )!;
  oldLeaderTokenPosition.leader = false;
  oldLeaderTokenPosition.save();

  let newLeaderTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.newAccount.toHexString()
  )!;
  newLeaderTokenPosition.leader = true;
  newLeaderTokenPosition.save();

  token.leader = event.params.newAccount;
  token.save();
}

export function handleMeme__MarketOpened(event: Meme__MarketOpened): void {
  let token = Token.load(event.address)!;
  token.open = true;
  token.save();
}

export function handleTransfer(event: Transfer): void {
  let token = Token.load(event.address)!;

  let toAccount = Account.load(event.params.to);
  if (toAccount === null) {
    toAccount = new Account(event.params.to);
    toAccount.providerFees = ZERO_BD;
    toAccount.leaderFees = ZERO_BD;
    toAccount.creatorFees = ZERO_BD;
    toAccount.referrals = ZERO_BI;
  }
  toAccount.save();
  let toTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.to.toHexString()
  );
  if (toTokenPosition === null) {
    toTokenPosition = new TokenPosition(
      event.address.toHexString() + "-" + event.params.to.toHexString()
    );
    toTokenPosition.account = event.params.to;
    toTokenPosition.token = event.address;
    toTokenPosition.contributed = ZERO_BD;
    toTokenPosition.balance = ZERO_BD;
    toTokenPosition.created = false;
    toTokenPosition.leader = false;
    toTokenPosition.creatorFeesBase = ZERO_BD;
    toTokenPosition.creatorFeesMeme = ZERO_BD;
    toTokenPosition.leaderFeesBase = ZERO_BD;
    toTokenPosition.leaderFeesMeme = ZERO_BD;
    toTokenPosition.providerFeesBase = ZERO_BD;
    toTokenPosition.providerFeesMeme = ZERO_BD;
  }
  let oldToBalance = toTokenPosition.balance;
  toTokenPosition.balance = toTokenPosition.balance.plus(
    convertEthToDecimal(event.params.value)
  );
  if (
    oldToBalance.equals(ZERO_BD) &&
    event.params.to.toHexString() !== ADDRESS_ZERO
  ) {
    token.holders = token.holders.plus(ONE_BI);
  }
  toTokenPosition.save();

  let fromTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.from.toHexString()
  );
  if (fromTokenPosition === null) {
    fromTokenPosition = new TokenPosition(
      event.address.toHexString() + "-" + event.params.from.toHexString()
    );
    fromTokenPosition.account = event.params.from;
    fromTokenPosition.token = event.address;
    fromTokenPosition.contributed = ZERO_BD;
    fromTokenPosition.balance = ZERO_BD;
    fromTokenPosition.created = false;
    fromTokenPosition.leader = false;
    fromTokenPosition.creatorFeesBase = ZERO_BD;
    fromTokenPosition.creatorFeesMeme = ZERO_BD;
    fromTokenPosition.leaderFeesBase = ZERO_BD;
    fromTokenPosition.leaderFeesMeme = ZERO_BD;
    fromTokenPosition.providerFeesBase = ZERO_BD;
    fromTokenPosition.providerFeesMeme = ZERO_BD;
  }
  let oldFromBalance = fromTokenPosition.balance;
  fromTokenPosition.balance = fromTokenPosition.balance.minus(
    convertEthToDecimal(event.params.value)
  );
  if (
    oldFromBalance.gt(ZERO_BD) &&
    fromTokenPosition.balance.equals(ZERO_BD) &&
    event.params.from.toHexString() !== ADDRESS_ZERO
  ) {
    token.holders = token.holders.minus(ONE_BI);
  }
  fromTokenPosition.save();

  token.save();
}
