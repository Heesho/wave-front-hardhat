import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0xc4d055443290A812ee4f9dd9e5D90232e598Ff19";
export const MULTICALL_ADDRESS = "0xBe69DE391108410E24e8F5CB903f6A2C88856d90";

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
