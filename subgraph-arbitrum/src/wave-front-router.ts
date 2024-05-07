import { BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  WaveFrontRouter__AffiliateSet,
  WaveFrontRouter__Buy,
  WaveFrontRouter__Sell,
} from "../generated/WaveFrontRouter/WaveFrontRouter";
import { Account, Swap, SwapHourData, SwapDayData } from "../generated/schema";
import { ONE_BI, ZERO_BD, ZERO_BI, convertEthToDecimal } from "./helpers";

export function handleWaveFrontRouter__AffiliateSet(
  event: WaveFrontRouter__AffiliateSet
): void {
  let account = Account.load(event.params.affiliate);
  if (account === null) {
    account = new Account(event.params.affiliate);
    account.providerFees = ZERO_BD;
    account.collectionFees = ZERO_BD;
    account.leaderFees = ZERO_BD;
    account.referrals = ZERO_BI;
  }
  account.referrals = account.referrals.plus(ONE_BI);
  account.save();
}

export function handleWaveFrontRouter__Buy(event: WaveFrontRouter__Buy): void {
  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.providerFees = ZERO_BD;
    account.collectionFees = ZERO_BD;
    account.leaderFees = ZERO_BD;
    account.referrals = ZERO_BI;
  }
  account.save();
  let swap = Swap.load(event.transaction.hash);
  if (swap === null) {
    swap = new Swap(event.transaction.hash);
    swap.blockNumber = event.block.number;
    swap.timestamp = event.block.timestamp;
    swap.account = event.params.account;
    swap.token = event.params.meme;
    swap.action = "BUY";
    swap.baseIn = convertEthToDecimal(event.params.amountIn);
    swap.baseOut = ZERO_BD;
    swap.tokenIn = ZERO_BD;
    swap.tokenOut = convertEthToDecimal(event.params.amountOut);
    swap.marketPrice = convertEthToDecimal(event.params.marketPrice);
    swap.floorPrice = convertEthToDecimal(event.params.floorPrice);
    swap.save();
  }

  let timestamp = event.block.timestamp.toI32();

  let hourIndex = timestamp / 3600;
  let hourStartTimestamp = hourIndex * 3600;
  let hourTokenId =
    event.params.meme.toHexString() + "-" + hourIndex.toString();
  let swapHourData = SwapHourData.load(hourTokenId);
  if (swapHourData === null) {
    swapHourData = new SwapHourData(hourTokenId);
    swapHourData.timestamp = BigInt.fromI32(hourStartTimestamp);
    swapHourData.token = event.params.meme;
    swapHourData.hourlyVolume = ZERO_BD;
  }
  swapHourData.marketPrice = swap.marketPrice;
  swapHourData.floorPrice = swap.floorPrice;
  swapHourData.hourlyVolume = swapHourData.hourlyVolume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  swapHourData.save();

  let dayIndex = timestamp / 86400;
  let dayStartTimestamp = dayIndex * 86400;
  let dayTokenId = event.params.meme.toHexString() + "-" + dayIndex.toString();
  let swapDayData = SwapDayData.load(dayTokenId);
  if (swapDayData === null) {
    swapDayData = new SwapDayData(dayTokenId);
    swapDayData.timestamp = BigInt.fromI32(dayStartTimestamp);
    swapDayData.token = event.params.meme;
    swapDayData.dailyVolume = ZERO_BD;
  }
  swapDayData.marketPrice = swap.marketPrice;
  swapDayData.floorPrice = swap.floorPrice;
  swapDayData.dailyVolume = swapDayData.dailyVolume.plus(
    convertEthToDecimal(event.params.amountIn)
  );
  swapDayData.save();
}

export function handleWaveFrontRouter__Sell(
  event: WaveFrontRouter__Sell
): void {
  let swap = Swap.load(event.transaction.hash);
  if (swap === null) {
    swap = new Swap(event.transaction.hash);
    swap.blockNumber = event.block.number;
    swap.timestamp = event.block.timestamp;
    swap.account = event.params.account;
    swap.token = event.params.meme;
    swap.action = "SELL";
    swap.baseIn = ZERO_BD;
    swap.baseOut = convertEthToDecimal(event.params.amountOut);
    swap.tokenIn = convertEthToDecimal(event.params.amountIn);
    swap.tokenOut = ZERO_BD;
    swap.marketPrice = convertEthToDecimal(event.params.marketPrice);
    swap.floorPrice = convertEthToDecimal(event.params.floorPrice);
    swap.save();
  }

  let timestamp = event.block.timestamp.toI32();

  let hourIndex = timestamp / 3600;
  let hourStartTimestamp = hourIndex * 3600;
  let hourTokenId =
    event.params.meme.toHexString() + "-" + hourIndex.toString();

  let swapHourData = SwapHourData.load(hourTokenId);
  if (swapHourData === null) {
    swapHourData = new SwapHourData(hourTokenId);
    swapHourData.timestamp = BigInt.fromI32(hourStartTimestamp);
    swapHourData.token = event.params.meme;
    swapHourData.hourlyVolume = ZERO_BD;
  }
  swapHourData.marketPrice = swap.marketPrice;
  swapHourData.floorPrice = swap.floorPrice;
  swapHourData.hourlyVolume = swapHourData.hourlyVolume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  swapHourData.save();

  let dayIndex = timestamp / 86400;
  let dayStartTimestamp = dayIndex * 86400;
  let dayTokenId = event.params.meme.toHexString() + "-" + dayIndex.toString();
  let swapDayData = SwapDayData.load(dayTokenId);
  if (swapDayData === null) {
    swapDayData = new SwapDayData(dayTokenId);
    swapDayData.timestamp = BigInt.fromI32(dayStartTimestamp);
    swapDayData.token = event.params.meme;
    swapDayData.dailyVolume = ZERO_BD;
  }
  swapDayData.marketPrice = swap.marketPrice;
  swapDayData.floorPrice = swap.floorPrice;
  swapDayData.dailyVolume = swapDayData.dailyVolume.plus(
    convertEthToDecimal(event.params.amountOut)
  );
  swapDayData.save();
}
