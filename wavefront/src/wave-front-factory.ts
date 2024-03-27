import {
  OwnershipTransferred as OwnershipTransferredEvent,
  WaveFrontFactory__MinAmountInUpdated as WaveFrontFactory__MinAmountInUpdatedEvent,
  WaveFrontFactory__TokenCreated as WaveFrontFactory__TokenCreatedEvent,
  WaveFrontFactory__TreasuryUpdated as WaveFrontFactory__TreasuryUpdatedEvent
} from "../generated/WaveFrontFactory/WaveFrontFactory"
import {
  OwnershipTransferred,
  WaveFrontFactory__MinAmountInUpdated,
  WaveFrontFactory__TokenCreated,
  WaveFrontFactory__TreasuryUpdated
} from "../generated/schema"

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleWaveFrontFactory__MinAmountInUpdated(
  event: WaveFrontFactory__MinAmountInUpdatedEvent
): void {
  let entity = new WaveFrontFactory__MinAmountInUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.minAmountIn = event.params.minAmountIn

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleWaveFrontFactory__TokenCreated(
  event: WaveFrontFactory__TokenCreatedEvent
): void {
  let entity = new WaveFrontFactory__TokenCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.index = event.params.index
  entity.token = event.params.token

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleWaveFrontFactory__TreasuryUpdated(
  event: WaveFrontFactory__TreasuryUpdatedEvent
): void {
  let entity = new WaveFrontFactory__TreasuryUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.treasury = event.params.treasury

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
