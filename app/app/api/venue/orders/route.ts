// The venue order book. GET returns the resting book; POST registers an order whose ATS hold the
// caller has already placed on-chain; DELETE delists (the on-chain hold, if any, is the caller's to
// release). Off-chain by design — settlement is the only on-chain step (see ../settle).

import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { addOrder, listOrders, removeOrder } from '@/lib/server/book';
import type { Address } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ orders: listOrders() });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    side?: string;
    account?: string;
    price?: number;
    quantity?: number;
    holdId?: string | number;
  };
  if (b.side !== 'bid' && b.side !== 'ask') {
    return NextResponse.json({ error: 'side must be "bid" or "ask"' }, { status: 400 });
  }
  if (!b.account || !isAddress(b.account)) {
    return NextResponse.json({ error: 'a valid account address is required' }, { status: 400 });
  }
  if (!Number.isInteger(b.price) || (b.price as number) <= 0) {
    return NextResponse.json({ error: 'price must be a positive integer' }, { status: 400 });
  }
  if (!Number.isInteger(b.quantity) || (b.quantity as number) <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }
  if (b.holdId === undefined || b.holdId === null || `${b.holdId}` === '') {
    return NextResponse.json({ error: 'holdId is required (place the ATS hold first)' }, { status: 400 });
  }
  const order = addOrder({
    side: b.side,
    account: b.account as Address,
    price: b.price as number,
    quantity: b.quantity as number,
    holdId: `${b.holdId}`,
  });
  return NextResponse.json({ ok: true, order });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  return NextResponse.json({ ok: removeOrder(id) });
}
