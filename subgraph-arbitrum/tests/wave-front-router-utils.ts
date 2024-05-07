import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  WaveFrontRouter__AffiliateSet,
  WaveFrontRouter__Buy,
  WaveFrontRouter__ClaimFees,
  WaveFrontRouter__Contributed,
  WaveFrontRouter__MarketOpened,
  WaveFrontRouter__MemeCreated,
  WaveFrontRouter__Redeemed,
  WaveFrontRouter__Sell,
  WaveFrontRouter__StatusUpdated
} from "../generated/WaveFrontRouter/WaveFrontRouter"

export function createWaveFrontRouter__AffiliateSetEvent(
  account: Address,
  affiliate: Address
): WaveFrontRouter__AffiliateSet {
  let waveFrontRouterAffiliateSetEvent =
    changetype<WaveFrontRouter__AffiliateSet>(newMockEvent())

  waveFrontRouterAffiliateSetEvent.parameters = new Array()

  waveFrontRouterAffiliateSetEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterAffiliateSetEvent.parameters.push(
    new ethereum.EventParam("affiliate", ethereum.Value.fromAddress(affiliate))
  )

  return waveFrontRouterAffiliateSetEvent
}

export function createWaveFrontRouter__BuyEvent(
  meme: Address,
  account: Address,
  affiliate: Address,
  amountIn: BigInt,
  amountOut: BigInt
): WaveFrontRouter__Buy {
  let waveFrontRouterBuyEvent = changetype<WaveFrontRouter__Buy>(newMockEvent())

  waveFrontRouterBuyEvent.parameters = new Array()

  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam("affiliate", ethereum.Value.fromAddress(affiliate))
  )
  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam(
      "amountIn",
      ethereum.Value.fromUnsignedBigInt(amountIn)
    )
  )
  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam(
      "amountOut",
      ethereum.Value.fromUnsignedBigInt(amountOut)
    )
  )

  return waveFrontRouterBuyEvent
}

export function createWaveFrontRouter__ClaimFeesEvent(
  meme: Address,
  account: Address
): WaveFrontRouter__ClaimFees {
  let waveFrontRouterClaimFeesEvent = changetype<WaveFrontRouter__ClaimFees>(
    newMockEvent()
  )

  waveFrontRouterClaimFeesEvent.parameters = new Array()

  waveFrontRouterClaimFeesEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterClaimFeesEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return waveFrontRouterClaimFeesEvent
}

export function createWaveFrontRouter__ContributedEvent(
  meme: Address,
  account: Address,
  amount: BigInt
): WaveFrontRouter__Contributed {
  let waveFrontRouterContributedEvent =
    changetype<WaveFrontRouter__Contributed>(newMockEvent())

  waveFrontRouterContributedEvent.parameters = new Array()

  waveFrontRouterContributedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterContributedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterContributedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return waveFrontRouterContributedEvent
}

export function createWaveFrontRouter__MarketOpenedEvent(
  meme: Address,
  totalBaseContributed: BigInt,
  totalMemeBalance: BigInt
): WaveFrontRouter__MarketOpened {
  let waveFrontRouterMarketOpenedEvent =
    changetype<WaveFrontRouter__MarketOpened>(newMockEvent())

  waveFrontRouterMarketOpenedEvent.parameters = new Array()

  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "totalBaseContributed",
      ethereum.Value.fromUnsignedBigInt(totalBaseContributed)
    )
  )
  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "totalMemeBalance",
      ethereum.Value.fromUnsignedBigInt(totalMemeBalance)
    )
  )

  return waveFrontRouterMarketOpenedEvent
}

export function createWaveFrontRouter__MemeCreatedEvent(
  meme: Address,
  account: Address,
  name: string,
  symbol: string,
  uri: string
): WaveFrontRouter__MemeCreated {
  let waveFrontRouterMemeCreatedEvent =
    changetype<WaveFrontRouter__MemeCreated>(newMockEvent())

  waveFrontRouterMemeCreatedEvent.parameters = new Array()

  waveFrontRouterMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("name", ethereum.Value.fromString(name))
  )
  waveFrontRouterMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("symbol", ethereum.Value.fromString(symbol))
  )
  waveFrontRouterMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("uri", ethereum.Value.fromString(uri))
  )

  return waveFrontRouterMemeCreatedEvent
}

export function createWaveFrontRouter__RedeemedEvent(
  meme: Address,
  account: Address,
  amount: BigInt
): WaveFrontRouter__Redeemed {
  let waveFrontRouterRedeemedEvent = changetype<WaveFrontRouter__Redeemed>(
    newMockEvent()
  )

  waveFrontRouterRedeemedEvent.parameters = new Array()

  waveFrontRouterRedeemedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterRedeemedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterRedeemedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return waveFrontRouterRedeemedEvent
}

export function createWaveFrontRouter__SellEvent(
  meme: Address,
  account: Address,
  amountIn: BigInt,
  amountOut: BigInt
): WaveFrontRouter__Sell {
  let waveFrontRouterSellEvent = changetype<WaveFrontRouter__Sell>(
    newMockEvent()
  )

  waveFrontRouterSellEvent.parameters = new Array()

  waveFrontRouterSellEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterSellEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterSellEvent.parameters.push(
    new ethereum.EventParam(
      "amountIn",
      ethereum.Value.fromUnsignedBigInt(amountIn)
    )
  )
  waveFrontRouterSellEvent.parameters.push(
    new ethereum.EventParam(
      "amountOut",
      ethereum.Value.fromUnsignedBigInt(amountOut)
    )
  )

  return waveFrontRouterSellEvent
}

export function createWaveFrontRouter__StatusUpdatedEvent(
  meme: Address,
  account: Address,
  status: string
): WaveFrontRouter__StatusUpdated {
  let waveFrontRouterStatusUpdatedEvent =
    changetype<WaveFrontRouter__StatusUpdated>(newMockEvent())

  waveFrontRouterStatusUpdatedEvent.parameters = new Array()

  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("status", ethereum.Value.fromString(status))
  )

  return waveFrontRouterStatusUpdatedEvent
}
