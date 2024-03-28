import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  WaveFrontRouter__AffiliateSet,
  WaveFrontRouter__Buy,
  WaveFrontRouter__ClaimFees,
  WaveFrontRouter__Contributed,
  WaveFrontRouter__MarketOpened,
  WaveFrontRouter__Redeemed,
  WaveFrontRouter__Sell,
  WaveFrontRouter__StatusUpdated,
  WaveFrontRouter__TokenCreated
} from "../generated/Contract/Contract"

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
  token: Address,
  account: Address,
  affiliate: Address,
  amountIn: BigInt,
  amountOut: BigInt
): WaveFrontRouter__Buy {
  let waveFrontRouterBuyEvent = changetype<WaveFrontRouter__Buy>(newMockEvent())

  waveFrontRouterBuyEvent.parameters = new Array()

  waveFrontRouterBuyEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
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
  token: Address,
  account: Address
): WaveFrontRouter__ClaimFees {
  let waveFrontRouterClaimFeesEvent = changetype<WaveFrontRouter__ClaimFees>(
    newMockEvent()
  )

  waveFrontRouterClaimFeesEvent.parameters = new Array()

  waveFrontRouterClaimFeesEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  waveFrontRouterClaimFeesEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return waveFrontRouterClaimFeesEvent
}

export function createWaveFrontRouter__ContributedEvent(
  token: Address,
  account: Address,
  amount: BigInt
): WaveFrontRouter__Contributed {
  let waveFrontRouterContributedEvent =
    changetype<WaveFrontRouter__Contributed>(newMockEvent())

  waveFrontRouterContributedEvent.parameters = new Array()

  waveFrontRouterContributedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
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
  token: Address,
  totalBaseContributed: BigInt,
  totalTokenBalance: BigInt
): WaveFrontRouter__MarketOpened {
  let waveFrontRouterMarketOpenedEvent =
    changetype<WaveFrontRouter__MarketOpened>(newMockEvent())

  waveFrontRouterMarketOpenedEvent.parameters = new Array()

  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "totalBaseContributed",
      ethereum.Value.fromUnsignedBigInt(totalBaseContributed)
    )
  )
  waveFrontRouterMarketOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "totalTokenBalance",
      ethereum.Value.fromUnsignedBigInt(totalTokenBalance)
    )
  )

  return waveFrontRouterMarketOpenedEvent
}

export function createWaveFrontRouter__RedeemedEvent(
  token: Address,
  account: Address,
  amount: BigInt
): WaveFrontRouter__Redeemed {
  let waveFrontRouterRedeemedEvent = changetype<WaveFrontRouter__Redeemed>(
    newMockEvent()
  )

  waveFrontRouterRedeemedEvent.parameters = new Array()

  waveFrontRouterRedeemedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
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
  token: Address,
  account: Address,
  amountIn: BigInt,
  amountOut: BigInt
): WaveFrontRouter__Sell {
  let waveFrontRouterSellEvent = changetype<WaveFrontRouter__Sell>(
    newMockEvent()
  )

  waveFrontRouterSellEvent.parameters = new Array()

  waveFrontRouterSellEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
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
  token: Address,
  account: Address,
  status: string
): WaveFrontRouter__StatusUpdated {
  let waveFrontRouterStatusUpdatedEvent =
    changetype<WaveFrontRouter__StatusUpdated>(newMockEvent())

  waveFrontRouterStatusUpdatedEvent.parameters = new Array()

  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  waveFrontRouterStatusUpdatedEvent.parameters.push(
    new ethereum.EventParam("status", ethereum.Value.fromString(status))
  )

  return waveFrontRouterStatusUpdatedEvent
}

export function createWaveFrontRouter__TokenCreatedEvent(
  token: Address,
  account: Address
): WaveFrontRouter__TokenCreated {
  let waveFrontRouterTokenCreatedEvent =
    changetype<WaveFrontRouter__TokenCreated>(newMockEvent())

  waveFrontRouterTokenCreatedEvent.parameters = new Array()

  waveFrontRouterTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  waveFrontRouterTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return waveFrontRouterTokenCreatedEvent
}
