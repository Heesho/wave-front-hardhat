import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0xf5cfBaF55036264B902D9ae55A114d9A22c42750";
export const INITIAL_PRICE = BigDecimal.fromString("0.0000001");
export const PREMARKET_DURATION = BigInt.fromI32(600);
export const STATUS_UPDATE_FEE = BigDecimal.fromString("1000");

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ZERO_BD = BigDecimal.fromString("0");
export let ONE_BD = BigDecimal.fromString("1");
export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString("1000000000000000000");
}
export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(bigDecimalExp18());
}
