import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0x2f7BEF0490297a794e1263209272b4581D6E6C4c";
export const INITIAL_PRICE = BigDecimal.fromString("0.000000069");
export const INITIAL_SUPPLY = BigDecimal.fromString("1000000000");
export const PREMARKET_DURATION = BigInt.fromI32(1800);

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let THREE_BI = BigInt.fromI32(3);
export let TEN_BI = BigInt.fromI32(10);

export let ZERO_BD = BigDecimal.fromString("0");
export let ONE_BD = BigDecimal.fromString("1");
export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString("1000000000000000000");
}
export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(bigDecimalExp18());
}
