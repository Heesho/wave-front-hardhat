import { WaveFrontAdmin__PointsAdded } from "../generated/WaveFrontAdmin/WaveFrontAdmin";
import { Account, Directory } from "../generated/schema";
import { Address } from "@graphprotocol/graph-ts";
import { TEN_BI, ZERO_BD, ZERO_BI } from "./helpers";

export function handleWaveFrontAdmin__PointsAdded(
  event: WaveFrontAdmin__PointsAdded
): void {
  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.points = TEN_BI;
    account.debt = ZERO_BD;
    account.providerFees = ZERO_BD;
    account.leaderFees = ZERO_BD;
    account.creatorFees = ZERO_BD;
    account.referrals = ZERO_BI;
  }
  account.points = account.points.plus(event.params.amount);
  account.save();
}
