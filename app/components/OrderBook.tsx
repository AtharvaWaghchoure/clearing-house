'use client';

import { deskName, INSTRUMENT } from '@/lib/accounts';
import { priceStr, qtyStr, cashStr, notional } from '@/lib/format';
import type { Order } from '@/lib/types';
import type { VenueStore, VenueState } from '@/lib/venue';

interface Props {
  store: VenueStore;
  state: VenueState;
  selBid?: string;
  selAsk?: string;
  onPick: (o: Order) => void;
}

export default function OrderBook({ store, state, selBid, selAsk, onPick }: Props) {
  const asks = state.orders
    .filter((o) => o.side === 'ask')
    .sort((a, b) => a.priceCents - b.priceCents || a.seq - b.seq);
  const bids = state.orders
    .filter((o) => o.side === 'bid')
    .sort((a, b) => b.priceCents - a.priceCents || a.seq - b.seq);

  const maxQty = Math.max(1, ...state.orders.map((o) => o.quantity));
  const bestAsk = asks[0];
  const bestBid = bids[0];
  const spread =
    bestAsk && bestBid ? (bestAsk.priceCents - bestBid.priceCents) / 100 : undefined;

  const row = (o: Order) => {
    const sel = o.id === selBid || o.id === selAsk;
    const kycOff = !store.isVerified(INSTRUMENT.bondToken, o.account);
    return (
      <div
        key={o.id}
        className={`book-row ${o.side} ${sel ? 'sel' : ''} ${kycOff ? 'kyc-off' : ''}`}
        onClick={() => onPick(o)}
        role="button"
        tabIndex={0}
      >
        <div className="depth" style={{ width: `${(o.quantity / maxQty) * 100}%` }} />
        <span className="side-dot" />
        <span className="desk">
          {deskName(o.account)}
          {kycOff && <span className="flag">KYC↓</span>}
        </span>
        <span className="px r">{priceStr(o.priceCents)}</span>
        <span className="qty r num">{qtyStr(o.quantity)}</span>
        <span className="notl r num">{cashStr(notional(o.priceCents, o.quantity))}</span>
      </div>
    );
  };

  return (
    <section className="panel">
      <header>
        <div className="title">
          <span className="ix">i.</span>
          <h2>Order Book</h2>
        </div>
        <span className="hint">{INSTRUMENT.partitionName} · resting holds</span>
      </header>

      <div className="book">
        <div className="book-head">
          <span />
          <span>Counterparty</span>
          <span className="r">Price</span>
          <span className="r">Qty</span>
          <span className="r">Notional</span>
        </div>

        {asks.slice().reverse().map(row)}

        <div className="spread">
          <span>
            BID <b>{bestBid ? priceStr(bestBid.priceCents) : '—'}</b>
          </span>
          <span>·</span>
          <span>
            SPREAD <b>{spread !== undefined ? spread.toFixed(2) : '—'}</b>
          </span>
          <span>·</span>
          <span>
            ASK <b>{bestAsk ? priceStr(bestAsk.priceCents) : '—'}</b>
          </span>
        </div>

        {bids.map(row)}
      </div>
    </section>
  );
}
