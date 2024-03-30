import {
  PreMeme__Contributed as PreMeme__ContributedEvent,
  PreMeme__MarketOpened as PreMeme__MarketOpenedEvent,
  PreMeme__Redeemed as PreMeme__RedeemedEvent,
} from "../generated/WaveFrontFactory/PreMeme";
import {
  Token,
  Transaction,
  Contribute,
  Account,
  TokenPosition,
} from "../generated/schema";
import { WaveFrontMulticall } from "../generated/templates/Meme/WaveFrontMulticall";
import { PreMeme as PreMemeContract } from "../generated/templates/PreMeme/PreMeme";
import { Address } from "@graphprotocol/graph-ts";
import {
  MULTICALL_ADDRESS,
  convertEthToDecimal,
  ZERO_BI,
  ZERO_BD,
} from "./helpers";

export function handlePreMeme__MarketOpened(
  event: PreMeme__MarketOpenedEvent
): void {
  let preMeme = PreMemeContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getMemeData(preMeme.meme());
  let token = Token.load(meme.meme)!;
  token.open = true;
  token.openAt = event.block.timestamp;
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.marketCap = token.marketPrice.times(token.totalSupply);
  token.save();
}

export function handlePreMeme__Contributed(
  event: PreMeme__ContributedEvent
): void {
  let preMeme = PreMemeContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let accountData = multicall.getAccountData(
    preMeme.meme(),
    event.params.account
  );
  let meme = multicall.getMemeData(preMeme.meme());
  let token = Token.load(meme.meme)!;

  token.preMemeBalance = convertEthToDecimal(meme.preMemeBalance);
  token.baseContributed = convertEthToDecimal(meme.baseContributed);
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.marketCap = token.marketPrice.times(token.totalSupply);
  token.save();

  let transaction = Transaction.load(event.transaction.hash.toHexString());
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString());
    transaction.blockNumber = event.block.number;
    transaction.timestamp = event.block.timestamp;
    transaction.meme = meme.meme;
    transaction.buys = [];
    transaction.sells = [];
    transaction.contributes = [];
    transaction.save();
  }

  let contributes = transaction.contributes;
  let contribute = new Contribute(
    event.transaction.hash.toHexString() + "-" + contributes.length.toString()
  );
  contribute.transaction = transaction.id;
  contribute.timestamp = event.block.timestamp;
  contribute.index = meme.index;
  contribute.meme = meme.meme;
  contribute.account = event.params.account;
  contribute.amount = convertEthToDecimal(event.params.amount);
  contribute.marketPrice = convertEthToDecimal(meme.marketPrice);
  contribute.save();

  contributes.push(contribute.id);
  transaction.contributes = contributes;
  transaction.save();

  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.referrals = ZERO_BI;
    account.providerEarnings = ZERO_BD;
    account.statusEarnings = ZERO_BD;
    account.holderEarnings = ZERO_BD;
  }

  let tokenPosition = TokenPosition.load(
    meme.meme.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      meme.meme.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.index = meme.index;
    tokenPosition.token = meme.meme;
    tokenPosition.account = event.params.account;
  }
  tokenPosition.balance = convertEthToDecimal(accountData.memeBalance);
  tokenPosition.claimable = convertEthToDecimal(accountData.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(accountData.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(accountData.memeRedeemable);
  tokenPosition.credit = convertEthToDecimal(accountData.baseCredit);
  tokenPosition.debt = convertEthToDecimal(accountData.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
  account.save();
}

export function handlePreMeme__Redeemed(event: PreMeme__RedeemedEvent): void {
  let preMeme = PreMemeContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let accountData = multicall.getAccountData(
    preMeme.meme(),
    event.params.account
  );
  let meme = multicall.getMemeData(preMeme.meme());
  let token = Token.load(meme.meme)!;

  token.open = meme.marketOpen;
  token.preMemeBalance = convertEthToDecimal(meme.preMemeBalance);
  token.baseContributed = convertEthToDecimal(meme.baseContributed);
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.marketCap = token.marketPrice.times(token.totalSupply);
  token.save();

  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.providerEarnings = ZERO_BD;
    account.statusEarnings = ZERO_BD;
    account.holderEarnings = ZERO_BD;
  }

  let tokenPosition = TokenPosition.load(
    meme.meme.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      meme.meme.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.index = meme.index;
    tokenPosition.token = meme.meme;
    tokenPosition.account = event.params.account;
  }
  tokenPosition.balance = convertEthToDecimal(accountData.memeBalance);
  tokenPosition.claimable = convertEthToDecimal(accountData.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(accountData.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(accountData.memeRedeemable);
  tokenPosition.credit = convertEthToDecimal(accountData.baseCredit);
  tokenPosition.debt = convertEthToDecimal(accountData.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
  account.save();
}
