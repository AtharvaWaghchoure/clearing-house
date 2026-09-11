// Clear a matched bid/ask. Both orders already carry an on-chain ATS hold, so the operator just
// builds the two-leg Trade and calls settle() — the bond moves seller→buyer and the cash moves
// buyer→seller in one atomic transaction, or neither does. This is the only on-chain write the
// venue makes on a trade, and it is operator-gated by the contract.

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { toHex } from 'viem';
import { VENUE, scan } from '@/lib/chain';
import { getOrder, removeOrder } from '@/lib/server/store';
import { type Trade, settle } from '@/lib/server/operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { bidId?: string; askId?: string };
  const bid = b.bidId ? await getOrder(b.bidId) : undefined;
  const ask = b.askId ? await getOrder(b.askId) : undefined;

  if (!bid || bid.side !== 'bid') return NextResponse.json({ error: 'bid order not found' }, { status: 404 });
  if (!ask || ask.side !== 'ask') return NextResponse.json({ error: 'ask order not found' }, { status: 404 });
  if (bid.quantity !== ask.quantity) {
    return NextResponse.json({ error: 'quantity mismatch — equal-quantity fills only' }, { status: 400 });
  }
  if (bid.price < ask.price) {
    return NextResponse.json({ error: 'not crossing — bid price is below the ask' }, { status: 400 });
  }

  // Settle at the bid price; the buyer's cash hold is exactly quantity × bid.price.
  const qty = BigInt(ask.quantity);
  const cashAmount = BigInt(ask.quantity) * BigInt(bid.price);
  const tradeId = toHex(randomBytes(32));

  const trade: Trade = {
    bond: {
      token: VENUE.bondToken,
      from: ask.account,
      to: bid.account,
      amount: qty,
      partition: VENUE.partition,
      holdId: BigInt(ask.holdId),
      tradeId,
      extra: '0x',
    },
    cash: {
      token: VENUE.cashToken,
      from: bid.account,
      to: ask.account,
      amount: cashAmount,
      partition: VENUE.partition,
      holdId: BigInt(bid.holdId),
      tradeId,
      extra: '0x',
    },
  };

  try {
    const txHash = await settle(trade);
    await removeOrder(bid.id);
    await removeOrder(ask.id);
    return NextResponse.json({
      ok: true,
      tradeId,
      txHash,
      link: scan.tx(txHash),
      seller: ask.account,
      buyer: bid.account,
      quantity: ask.quantity,
      cash: cashAmount.toString(),
    });
  } catch (e) {
    // On-chain revert (e.g. a hold was released, or KYC revoked mid-flight) — orders stay resting.
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
