import { Address } from "@graphprotocol/graph-ts";
import { Account, Directory, Token, TokenPosition } from "../generated/schema";
import {
  Meme__Buy,
  Meme__Claim,
  Meme__MarketOpened,
  Meme__ProtocolFee,
  Meme__ProviderFee,
  Meme__Sell,
  Meme__StatusFee,
  Meme__StatusUpdated,
  Transfer,
} from "../generated/templates/Meme/Meme";
import {
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

export function handleMeme__Claim(event: Meme__Claim): void {
  let account = Account.load(event.params.account)!;
  account.collectionFees = account.collectionFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();
}

export function handleMeme__StatusFee(event: Meme__StatusFee): void {
  let account = Account.load(event.params.account)!;
  account.leaderFees = account.leaderFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();
}

export function handleMeme__ProviderFee(event: Meme__ProviderFee): void {
  let account = Account.load(event.params.account)!;
  account.providerFees = account.providerFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();
}

export function handleMeme__ProtocolFee(event: Meme__ProtocolFee): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.treasuryFees = directory.treasuryFees.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  directory.save();
}

export function handleMeme__StatusUpdated(event: Meme__StatusUpdated): void {
  let token = Token.load(event.address)!;
  token.circulatingSupply = token.circulatingSupply.minus(STATUS_UPDATE_FEE);

  let oldLeaderTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + token.leader.toHexString()
  )!;
  oldLeaderTokenPosition.leader = false;
  oldLeaderTokenPosition.save();

  let newLeaderTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  newLeaderTokenPosition.leader = true;
  newLeaderTokenPosition.save();

  token.leader = event.params.account;
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
    toAccount.collectionFees = ZERO_BD;
    toAccount.leaderFees = ZERO_BD;
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
  }
  if (toTokenPosition.balance.equals(ZERO_BD)) {
    token.holders = token.holders.plus(ONE_BI);
  }
  toTokenPosition.balance = toTokenPosition.balance.plus(
    convertEthToDecimal(event.params.value)
  );
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
  }
  fromTokenPosition.balance = fromTokenPosition.balance.minus(
    convertEthToDecimal(event.params.value)
  );
  if (fromTokenPosition.balance.equals(ZERO_BD)) {
    token.holders = token.holders.minus(ONE_BI);
  }
  fromTokenPosition.save();

  token.save();
}
