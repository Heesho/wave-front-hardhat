import {
  PreToken__Contributed as PreToken__ContributedEvent,
  PreToken__MarketOpened as PreToken__MarketOpenedEvent,
  PreToken__Redeemed as PreToken__RedeemedEvent,
} from "../generated/WaveFrontFactory/PreToken";
import {
  Token,
  Transaction,
  Contribute,
  Account,
  TokenPosition,
} from "../generated/schema";
import { WaveFrontMulticall } from "../generated/templates/Token/WaveFrontMulticall";
import { PreToken as PreTokenContract } from "../generated/templates/PreToken/PreToken";
import { Address } from "@graphprotocol/graph-ts";
import { MULTICALL_ADDRESS, convertEthToDecimal, ZERO_BD } from "./helpers";

export function handlePreToken__MarketOpened(
  event: PreToken__MarketOpenedEvent
): void {
  let preMeme = PreTokenContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(preMeme.token());
  let token = Token.load(meme.token)!;
  token.open = true;
  token.openAt = event.block.timestamp;
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.save();
}

export function handlePreToken__Contributed(
  event: PreToken__ContributedEvent
): void {
  let preMeme = PreTokenContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let accountData = multicall.getAccountData(
    preMeme.token(),
    event.params.account
  );
  let meme = multicall.getTokenData(preMeme.token());
  let token = Token.load(meme.token)!;

  token.preMemeBalance = convertEthToDecimal(meme.preTokenBalance);
  token.baseContributed = convertEthToDecimal(meme.baseContributed);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.save();

  let transaction = Transaction.load(event.transaction.hash.toHexString());
  if (transaction === null) {
    transaction = new Transaction(event.transaction.hash.toHexString());
    transaction.blockNumber = event.block.number;
    transaction.timestamp = event.block.timestamp;
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
  contribute.meme = meme.token;
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
    account.providerEarnings = ZERO_BD;
    account.statusEarnings = ZERO_BD;
    account.holderEarnings = ZERO_BD;
  }

  let tokenPosition = TokenPosition.load(
    meme.token.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      meme.token.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.index = meme.index;
    tokenPosition.token = meme.token;
    tokenPosition.account = event.params.account;
  }
  tokenPosition.balance = convertEthToDecimal(accountData.tokenBalance);
  tokenPosition.claimable = convertEthToDecimal(accountData.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(accountData.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(accountData.tokenRedeemable);
  tokenPosition.credit = convertEthToDecimal(accountData.baseCredit);
  tokenPosition.debt = convertEthToDecimal(accountData.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
  account.save();
}

export function handlePreToken__Redeemed(event: PreToken__RedeemedEvent): void {
  let preMeme = PreTokenContract.bind(event.address);
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let accountData = multicall.getAccountData(
    preMeme.token(),
    event.params.account
  );
  let meme = multicall.getTokenData(preMeme.token());
  let token = Token.load(meme.token)!;

  token.open = meme.marketOpen;
  token.preMemeBalance = convertEthToDecimal(meme.preTokenBalance);
  token.baseContributed = convertEthToDecimal(meme.baseContributed);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.save();

  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.providerEarnings = ZERO_BD;
    account.statusEarnings = ZERO_BD;
    account.holderEarnings = ZERO_BD;
  }

  let tokenPosition = TokenPosition.load(
    meme.token.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      meme.token.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.index = meme.index;
    tokenPosition.token = meme.token;
    tokenPosition.account = event.params.account;
  }
  tokenPosition.balance = convertEthToDecimal(accountData.tokenBalance);
  tokenPosition.claimable = convertEthToDecimal(accountData.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(accountData.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(accountData.tokenRedeemable);
  tokenPosition.credit = convertEthToDecimal(accountData.baseCredit);
  tokenPosition.debt = convertEthToDecimal(accountData.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
  account.save();
}
