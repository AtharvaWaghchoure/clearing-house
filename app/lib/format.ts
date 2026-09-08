import type { Address, Hex } from './types';

/** 0x1234…abcd — checksummed middle-truncation for dense tables. */
export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** A short trade id, e.g. 0x…0001 / 0x…019d. */
export function shortId(id: Hex): string {
  const trimmed = id.replace(/^0x0+/, '');
  return `0x…${trimmed.padStart(4, '0').slice(-4)}`;
}

/** Integer cents → "100.00". */
export function priceStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Whole cash units (USDC) with thousands separators, e.g. 1,000. */
export function cashStr(n: number | bigint): string {
  return Number(n).toLocaleString('en-US');
}

/** cash notional for an order/trade in whole units: price(2dp) * quantity. */
export function notional(priceCents: number, quantity: number): number {
  return Math.round((priceCents * quantity) / 100);
}

export function qtyStr(n: number | bigint): string {
  return Number(n).toLocaleString('en-US');
}

export function blockStr(n: bigint | number): string {
  return `#${Number(n).toLocaleString('en-US')}`;
}

/** Deterministic pseudo-hash for a simulated tx — not cryptographic, just a stable-looking handle. */
export function fauxTx(seed: number): Hex {
  let h = (2166136261 ^ seed) >>> 0;
  let out = '';
  for (let i = 0; i < 32; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    out += (h & 0xff).toString(16).padStart(2, '0');
  }
  return `0x${out}` as Hex;
}
