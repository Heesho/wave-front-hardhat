import {
  Token__Buy as Token__BuyEvent,
  Token__Sell as Token__SellEvent,
  Token__Claim as Token__ClaimEvent,
  Token__StatusFee as Token__StatusFeeEvent,
  Token__ProviderFee as Token__ProviderFeeEvent,
  Token__ProtocolFee as Token__ProtocolFeeEvent,
  Token__Burn as Token__BurnEvent,
  Token__StatusUpdated as Token__StatusUpdatedEvent,
  Token__Borrow as Token__BorrowEvent,
  Token__Repay as Token__RepayEvent,
  Token__Donation as Token__DonatationEvent,
  Transfer as TransferEvent,
} from "../generated/WaveFrontFactory/Token";
import {
  Directory,
  Token,
  Transaction,
  Buy,
  Sell,
  Account,
  TokenPosition,
} from "../generated/schema";
import { WaveFrontMulticall } from "../generated/templates/Token/WaveFrontMulticall";
import { Token as MemeContract } from "../generated/templates/Token/Token";
import { updateTokenHourData, updateTokenDayData } from "./day-updates";
import { Address } from "@graphprotocol/graph-ts";
import {
  FACTORY_ADDRESS,
  MULTICALL_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  convertEthToDecimal,
} from "./helpers";

export function handleToken__Buy(event: Token__BuyEvent): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.volume = directory.volume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  directory.txCount = directory.txCount.plus(ONE_BI);
  directory.save();

  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let token = Token.load(meme.token)!;
  token.status = meme.status;
  token.statusHolder = meme.statusHolder;
  token.open = meme.marketOpen;
  token.reserveVirtualBase = convertEthToDecimal(meme.reserveVirtualBase);
  token.reserveRealBase = convertEthToDecimal(meme.reserveBase);
  token.reserveRealMeme = convertEthToDecimal(meme.reserveToken);
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.rewardsBase = convertEthToDecimal(meme.totalRewardsBase);
  token.totalDebt = convertEthToDecimal(meme.totalDebt);
  token.volume = token.volume.plus(convertEthToDecimal(event.params.amountIn));
  token.txCount = token.txCount.plus(ONE_BI);
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

  let buys = transaction.buys;
  let buy = new Buy(
    event.transaction.hash.toHexString() + "-" + buys.length.toString()
  );
  buy.transaction = transaction.id;
  buy.timestamp = event.block.timestamp;
  buy.index = meme.index;
  buy.meme = meme.token;
  buy.from = event.params.from;
  buy.to = event.params.to;
  buy.amountIn = convertEthToDecimal(event.params.amountIn);
  buy.amountOut = convertEthToDecimal(event.params.amountOut);
  buy.marketPrice = convertEthToDecimal(meme.marketPrice);
  buy.save();

  buys.push(buy.id);
  transaction.buys = buys;
  transaction.save();

  let tokenHourData = updateTokenHourData(event, buy.marketPrice);
  tokenHourData.hourlyVolume = tokenHourData.hourlyVolume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  tokenHourData.save();

  let tokenDayData = updateTokenDayData(event, buy.marketPrice);
  tokenDayData.dailyVolume = tokenDayData.dailyVolume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  tokenDayData.save();
}

export function handleToken__Sell(event: Token__SellEvent): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.volume = directory.volume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  directory.txCount = directory.txCount.plus(ONE_BI);
  directory.save();

  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let token = Token.load(meme.token)!;
  token.status = meme.status;
  token.statusHolder = meme.statusHolder;
  token.open = meme.marketOpen;
  token.reserveVirtualBase = convertEthToDecimal(meme.reserveVirtualBase);
  token.reserveRealBase = convertEthToDecimal(meme.reserveBase);
  token.reserveRealMeme = convertEthToDecimal(meme.reserveToken);
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.marketPrice = convertEthToDecimal(meme.marketPrice);
  token.rewardsBase = convertEthToDecimal(meme.totalRewardsBase);
  token.totalDebt = convertEthToDecimal(meme.totalDebt);
  token.volume = token.volume.plus(convertEthToDecimal(event.params.amountOut));
  token.txCount = token.txCount.plus(ONE_BI);
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

  let sells = transaction.sells;
  let sell = new Sell(
    event.transaction.hash.toHexString() + "-" + sells.length.toString()
  );
  sell.transaction = transaction.id;
  sell.timestamp = event.block.timestamp;
  sell.index = meme.index;
  sell.meme = meme.token;
  sell.from = event.params.from;
  sell.to = event.params.to;
  sell.amountIn = convertEthToDecimal(event.params.amountIn);
  sell.amountOut = convertEthToDecimal(event.params.amountOut);
  sell.marketPrice = convertEthToDecimal(meme.marketPrice);
  sell.save();

  sells.push(sell.id);
  transaction.buys = sells;
  transaction.save();

  let tokenHourData = updateTokenHourData(event, sell.marketPrice);
  tokenHourData.hourlyVolume = tokenHourData.hourlyVolume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  tokenHourData.save();

  let tokenDayData = updateTokenDayData(event, sell.marketPrice);
  tokenDayData.dailyVolume = tokenDayData.dailyVolume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  tokenDayData.save();
}

export function handleToken__Claim(event: Token__ClaimEvent): void {
  let memeContract = MemeContract.bind(event.address);

  let account = Account.load(event.params.account)!;
  account.holderEarnings = account.holderEarnings.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.claimable = convertEthToDecimal(
    memeContract.claimableBase(event.params.account)
  );
  tokenPosition.save();
}

export function handleToken__StatusFee(event: Token__StatusFeeEvent): void {
  let account = Account.load(event.params.account)!;
  account.statusEarnings = account.statusEarnings.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();
}

export function handleToken__ProviderFee(event: Token__ProviderFeeEvent): void {
  let account = Account.load(event.params.account)!;
  account.providerEarnings = account.providerEarnings.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  account.save();
}

export function handleToken__ProtocolFee(event: Token__ProtocolFeeEvent): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.earnings = directory.earnings.plus(
    convertEthToDecimal(event.params.amountBase)
  );
  directory.save();
}

export function handleToken__StatusUpdated(
  event: Token__StatusUpdatedEvent
): void {
  let token = Token.load(event.address)!;
  token.status = event.params.status;
  token.statusHolder = event.params.account;
  token.save();
}

export function handleToken__Burn(event: Token__BurnEvent): void {
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let token = Token.load(meme.token)!;
  token.totalSupply = convertEthToDecimal(meme.totalSupply);
  token.floorPrice = convertEthToDecimal(meme.floorPrice);
  token.save();
}

export function handleToken__Borrow(event: Token__BorrowEvent): void {
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let account = multicall.getAccountData(event.address, event.params.account);
  let token = Token.load(meme.token)!;
  token.totalDebt = convertEthToDecimal(meme.totalDebt);
  token.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.balance = convertEthToDecimal(account.tokenBalance);
  tokenPosition.claimable = convertEthToDecimal(account.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(account.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(account.tokenRedeemable);
  tokenPosition.credit = convertEthToDecimal(account.baseCredit);
  tokenPosition.debt = convertEthToDecimal(account.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
}

export function handleToken__Repay(event: Token__RepayEvent): void {
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let account = multicall.getAccountData(event.address, event.params.account);
  let token = Token.load(meme.token)!;
  token.totalDebt = convertEthToDecimal(meme.totalDebt);
  token.save();

  let tokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.balance = convertEthToDecimal(account.tokenBalance);
  tokenPosition.claimable = convertEthToDecimal(account.baseClaimable);
  tokenPosition.contributed = convertEthToDecimal(account.baseContributed);
  tokenPosition.redeemable = convertEthToDecimal(account.tokenRedeemable);
  tokenPosition.credit = convertEthToDecimal(account.baseCredit);
  tokenPosition.debt = convertEthToDecimal(account.baseDebt);
  tokenPosition.statusHolder = meme.statusHolder == event.params.account;
  tokenPosition.save();
}

export function handleTransfer(event: TransferEvent): void {
  let multicall = WaveFrontMulticall.bind(
    Address.fromString(MULTICALL_ADDRESS)
  );
  let meme = multicall.getTokenData(event.address);
  let fromAccount = multicall.getAccountData(event.address, event.params.from);
  let toAccount = multicall.getAccountData(event.address, event.params.to);

  let from = Account.load(event.params.from);
  if (from === null) {
    from = new Account(event.params.from);
    from.referrals = ZERO_BI;
    from.statusEarnings = ZERO_BD;
    from.holderEarnings = ZERO_BD;
    from.providerEarnings = ZERO_BD;
  }

  let fromTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.from.toHexString()
  );
  if (fromTokenPosition === null) {
    fromTokenPosition = new TokenPosition(
      event.address.toHexString() + "-" + event.params.from.toHexString()
    );
    fromTokenPosition.index = meme.index;
    fromTokenPosition.token = meme.token;
    fromTokenPosition.account = event.params.from;
  }
  fromTokenPosition.balance = convertEthToDecimal(fromAccount.tokenBalance);
  fromTokenPosition.claimable = convertEthToDecimal(fromAccount.baseClaimable);
  fromTokenPosition.contributed = convertEthToDecimal(
    fromAccount.baseContributed
  );
  fromTokenPosition.redeemable = convertEthToDecimal(
    fromAccount.tokenRedeemable
  );
  fromTokenPosition.credit = convertEthToDecimal(toAccount.baseCredit);
  fromTokenPosition.debt = convertEthToDecimal(toAccount.baseDebt);
  fromTokenPosition.statusHolder = meme.statusHolder == event.params.from;
  fromTokenPosition.save();
  from.save();

  let to = Account.load(event.params.to);
  if (to === null) {
    to = new Account(event.params.to);
    to.referrals = ZERO_BI;
    to.statusEarnings = ZERO_BD;
    to.holderEarnings = ZERO_BD;
    to.providerEarnings = ZERO_BD;
  }

  let toTokenPosition = TokenPosition.load(
    event.address.toHexString() + "-" + event.params.to.toHexString()
  );
  if (toTokenPosition === null) {
    toTokenPosition = new TokenPosition(
      event.address.toHexString() + "-" + event.params.to.toHexString()
    );
    toTokenPosition.index = meme.index;
    toTokenPosition.token = meme.token;
    toTokenPosition.account = event.params.to;
  }
  toTokenPosition.balance = convertEthToDecimal(toAccount.tokenBalance);
  toTokenPosition.claimable = convertEthToDecimal(toAccount.baseClaimable);
  toTokenPosition.contributed = convertEthToDecimal(toAccount.baseContributed);
  toTokenPosition.redeemable = convertEthToDecimal(toAccount.tokenRedeemable);
  toTokenPosition.credit = convertEthToDecimal(toAccount.baseCredit);
  toTokenPosition.debt = convertEthToDecimal(toAccount.baseDebt);
  toTokenPosition.statusHolder = meme.statusHolder == event.params.to;
  toTokenPosition.save();
  to.save();
}
