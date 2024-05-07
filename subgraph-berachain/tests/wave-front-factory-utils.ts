import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  OwnershipTransferred,
  WaveFrontFactory__MemeCreated,
  WaveFrontFactory__MinAmountInUpdated,
  WaveFrontFactory__TreasuryUpdated
} from "../generated/WaveFrontFactory/WaveFrontFactory"

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent = changetype<OwnershipTransferred>(
    newMockEvent()
  )

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createWaveFrontFactory__MemeCreatedEvent(
  index: BigInt,
  meme: Address,
  name: string,
  symbol: string,
  uri: string,
  account: Address
): WaveFrontFactory__MemeCreated {
  let waveFrontFactoryMemeCreatedEvent =
    changetype<WaveFrontFactory__MemeCreated>(newMockEvent())

  waveFrontFactoryMemeCreatedEvent.parameters = new Array()

  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("index", ethereum.Value.fromUnsignedBigInt(index))
  )
  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("meme", ethereum.Value.fromAddress(meme))
  )
  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("name", ethereum.Value.fromString(name))
  )
  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("symbol", ethereum.Value.fromString(symbol))
  )
  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("uri", ethereum.Value.fromString(uri))
  )
  waveFrontFactoryMemeCreatedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return waveFrontFactoryMemeCreatedEvent
}

export function createWaveFrontFactory__MinAmountInUpdatedEvent(
  minAmountIn: BigInt
): WaveFrontFactory__MinAmountInUpdated {
  let waveFrontFactoryMinAmountInUpdatedEvent =
    changetype<WaveFrontFactory__MinAmountInUpdated>(newMockEvent())

  waveFrontFactoryMinAmountInUpdatedEvent.parameters = new Array()

  waveFrontFactoryMinAmountInUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "minAmountIn",
      ethereum.Value.fromUnsignedBigInt(minAmountIn)
    )
  )

  return waveFrontFactoryMinAmountInUpdatedEvent
}

export function createWaveFrontFactory__TreasuryUpdatedEvent(
  treasury: Address
): WaveFrontFactory__TreasuryUpdated {
  let waveFrontFactoryTreasuryUpdatedEvent =
    changetype<WaveFrontFactory__TreasuryUpdated>(newMockEvent())

  waveFrontFactoryTreasuryUpdatedEvent.parameters = new Array()

  waveFrontFactoryTreasuryUpdatedEvent.parameters.push(
    new ethereum.EventParam("treasury", ethereum.Value.fromAddress(treasury))
  )

  return waveFrontFactoryTreasuryUpdatedEvent
}
