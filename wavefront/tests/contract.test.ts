import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { WaveFrontRouter__AffiliateSet } from "../generated/schema"
import { WaveFrontRouter__AffiliateSet as WaveFrontRouter__AffiliateSetEvent } from "../generated/Contract/Contract"
import { handleWaveFrontRouter__AffiliateSet } from "../src/contract"
import { createWaveFrontRouter__AffiliateSetEvent } from "./contract-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let account = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let affiliate = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let newWaveFrontRouter__AffiliateSetEvent =
      createWaveFrontRouter__AffiliateSetEvent(account, affiliate)
    handleWaveFrontRouter__AffiliateSet(newWaveFrontRouter__AffiliateSetEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("WaveFrontRouter__AffiliateSet created and stored", () => {
    assert.entityCount("WaveFrontRouter__AffiliateSet", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "WaveFrontRouter__AffiliateSet",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "account",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "WaveFrontRouter__AffiliateSet",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "affiliate",
      "0x0000000000000000000000000000000000000001"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
