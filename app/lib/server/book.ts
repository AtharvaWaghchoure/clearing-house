// In-memory order book for the venue. Orders are off-chain by design — matching is off-chain; only
// settlement is on-chain (operator-gated). Each resting order references the ATS hold its placer has
// already created, so a match can settle immediately.
//
// State is pinned on globalThis so every API route in the process shares ONE book (Next.js bundles
// route handlers separately, so a plain module-level Map would give each route its own copy) and it
// survives dev hot-reload. Fine for a testnet venue; not durable across restarts or multiple
// instances.

import type { Address } from '../types';

export type Side = 'bid' | 'ask';

export interface RestingOrder {
  id: string;
  side: Side;
  account: Address;
  /** Whole cash units (USDC) per bond unit. */
  price: number;
  /** Bond units. */
  quantity: number;
  /** The ATS hold id the placer created (stringified bigint): a bond hold for an ask, cash for a bid. */
  holdId: string;
  createdAt: number;
}

interface BookState {
  orders: Map<string, RestingOrder>;
  seq: number;
}

const g = globalThis as unknown as { __venueBook?: BookState };
const book: BookState = (g.__venueBook ??= { orders: new Map(), seq: 0 });

export function listOrders(): RestingOrder[] {
  return [...book.orders.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function getOrder(id: string): RestingOrder | undefined {
  return book.orders.get(id);
}

export function addOrder(o: Omit<RestingOrder, 'id' | 'createdAt'>): RestingOrder {
  const id = `o${++book.seq}`;
  const order: RestingOrder = { ...o, id, createdAt: Date.now() };
  book.orders.set(id, order);
  return order;
}

export function removeOrder(id: string): boolean {
  return book.orders.delete(id);
}
