import { WaveFrontTreasury__Withdraw } from "../generated/WaveFrontTreasury/WaveFrontTreasury";
import { Directory } from "../generated/schema";
import { Address } from "@graphprotocol/graph-ts";
import {
  FACTORY_ADDRESS,
  ZERO_BD,
  ZERO_BI,
  convertEthToDecimal,
} from "./helpers";

export function handleWaveFrontTreasury__Withdraw(
  event: WaveFrontTreasury__Withdraw
): void {
  let directory = Directory.load(Address.fromString(FACTORY_ADDRESS))!;
  directory.treasuryFees = directory.treasuryFees.plus(
    convertEthToDecimal(event.params.amount)
  );
  directory.save();
}
