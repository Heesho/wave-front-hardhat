import { Account, Token, TokenPosition } from "../generated/schema";
import {
  PreMeme__Contributed,
  PreMeme__Redeemed,
} from "../generated/templates/PreMeme/PreMeme";
import {
  ONE_BI,
  TEN_BI,
  THREE_BI,
  ZERO_BD,
  ZERO_BI,
  convertEthToDecimal,
} from "./helpers";

export function handlePreMeme__Contributed(event: PreMeme__Contributed): void {
  let account = Account.load(event.params.account);
  if (account === null) {
    account = new Account(event.params.account);
    account.points = TEN_BI;
    account.providerFees = ZERO_BD;
    account.leaderFees = ZERO_BD;
    account.creatorFees = ZERO_BD;
    account.referrals = ZERO_BI;
  }
  account.points = account.points.plus(THREE_BI);
  account.save();

  let token = Token.load(event.params.meme)!;
  token.contributed = token.contributed.plus(
    convertEthToDecimal(event.params.amount)
  );

  let tokenPosition = TokenPosition.load(
    event.params.meme.toHexString() + "-" + event.params.account.toHexString()
  );
  if (tokenPosition === null) {
    tokenPosition = new TokenPosition(
      event.params.meme.toHexString() + "-" + event.params.account.toHexString()
    );
    tokenPosition.account = event.params.account;
    tokenPosition.token = event.params.meme;
    tokenPosition.contributed = ZERO_BD;
    tokenPosition.balance = ZERO_BD;
    tokenPosition.created = false;
    tokenPosition.leader = false;
    tokenPosition.creatorFeesBase = ZERO_BD;
    tokenPosition.creatorFeesMeme = ZERO_BD;
    tokenPosition.leaderFeesBase = ZERO_BD;
    tokenPosition.leaderFeesMeme = ZERO_BD;
    tokenPosition.providerFeesBase = ZERO_BD;
    tokenPosition.providerFeesMeme = ZERO_BD;
  }
  if (tokenPosition.contributed.equals(ZERO_BD)) {
    token.contributors = token.contributors.plus(ONE_BI);
  }
  tokenPosition.contributed = tokenPosition.contributed.plus(
    convertEthToDecimal(event.params.amount)
  );
  tokenPosition.save();
  token.save();
}

export function handlePreMeme__Redeemed(event: PreMeme__Redeemed): void {
  let tokenPosition = TokenPosition.load(
    event.params.meme.toHexString() + "-" + event.params.account.toHexString()
  )!;
  tokenPosition.contributed = ZERO_BD;
  tokenPosition.save();
}
