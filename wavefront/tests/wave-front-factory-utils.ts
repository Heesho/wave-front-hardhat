import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  OwnershipTransferred,
  WaveFrontFactory__MinAmountInUpdated,
  WaveFrontFactory__TokenCreated,
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

export function createWaveFrontFactory__TokenCreatedEvent(
  index: BigInt,
  token: Address
): WaveFrontFactory__TokenCreated {
  let waveFrontFactoryTokenCreatedEvent =
    changetype<WaveFrontFactory__TokenCreated>(newMockEvent())

  waveFrontFactoryTokenCreatedEvent.parameters = new Array()

  waveFrontFactoryTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("index", ethereum.Value.fromUnsignedBigInt(index))
  )
  waveFrontFactoryTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )

  return waveFrontFactoryTokenCreatedEvent
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
