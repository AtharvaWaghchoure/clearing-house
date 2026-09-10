'use client';

// Client-side venue actions. Reads/writes the operator backend (API routes) and, for the one step
// that must be signed by the user, places the ATS hold directly from their wallet. The user signs
// only their own hold; the operator signs onboarding + settlement server-side.

import type { WalletClient } from 'viem';
import { atsAbi } from './abi';
import { VENUE, hederaTestnet, publicClient } from './chain';
import type { Address, Hex } from './types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

export interface BookOrder {
  id: string;
  side: 'bid' | 'ask';
  account: Address;
  price: number;
  quantity: number;
  holdId: string;
  createdAt: number;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `${url} failed`);
  return j as T;
}

/** Verify + faucet-fund an address (operator-signed, server-side). Takes ~4 testnet txs. */
export function onboard(address: Address) {
  return postJSON<{ ok: true; txs: Record<string, Hex> }>('/api/venue/onboard', { address });
}

export async function fetchOrders(): Promise<BookOrder[]> {
  const r = await fetch('/api/venue/orders', { cache: 'no-store' });
  const j = (await r.json()) as { orders?: BookOrder[] };
  return j.orders ?? [];
}

/** Place an ATS hold from the user's wallet, naming the venue leg as escrow. Returns the hold id
 *  (captured by simulating the call, which returns it, before signing the real transaction). */
export async function placeHold(
  wallet: WalletClient,
  account: Address,
  token: Address,
  amount: bigint,
): Promise<bigint> {
  const hold = { amount, expirationTimestamp: 0n, escrow: VENUE.holdLeg, to: ZERO, data: '0x' as Hex };
  const { result } = await publicClient.simulateContract({
    account,
    address: token,
    abi: atsAbi,
    functionName: 'createHoldByPartition',
    args: [VENUE.partition, hold],
  });
  const holdId = (result as readonly [boolean, bigint])[1];
  const hash = await wallet.writeContract({
    account,
    chain: hederaTestnet,
    address: token,
    abi: atsAbi,
    functionName: 'createHoldByPartition',
    args: [VENUE.partition, hold],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return holdId;
}

export function submitOrder(o: {
  side: 'bid' | 'ask';
  account: Address;
  price: number;
  quantity: number;
  holdId: string;
}) {
  return postJSON<{ order: BookOrder }>('/api/venue/orders', o).then((r) => r.order);
}

/** Reclaim a hold the user placed (cancel), returning the escrowed funds to their free balance. */
export async function releaseHold(
  wallet: WalletClient,
  account: Address,
  token: Address,
  holdId: string,
): Promise<void> {
  const hash = await wallet.writeContract({
    account,
    chain: hederaTestnet,
    address: token,
    abi: atsAbi,
    functionName: 'releaseHoldByPartition',
    args: [VENUE.partition, BigInt(holdId)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export function cancelOrder(id: string): Promise<unknown> {
  return fetch(`/api/venue/orders?id=${id}`, { method: 'DELETE' });
}

export function settlePair(bidId: string, askId: string) {
  return postJSON<{ ok: true; tradeId: Hex; txHash: Hex; link: string }>('/api/venue/settle', { bidId, askId });
}
