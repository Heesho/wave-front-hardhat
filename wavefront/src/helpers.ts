import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0x25a12591e63a4367e5fB3Af66cc4CDDB7F02aDec";
export const MULTICALL_ADDRESS = "0x446d53082A967c037189fcf289DC1D87402085eB";

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
