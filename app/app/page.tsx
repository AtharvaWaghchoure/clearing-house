'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Masthead from '@/components/Masthead';
import OrderBook from '@/components/OrderBook';
import SettlementPanel from '@/components/SettlementPanel';
import SettlementTape from '@/components/SettlementTape';
import VerifierPanel from '@/components/VerifierPanel';
import KycConsole from '@/components/KycConsole';
import { INSTRUMENT } from '@/lib/accounts';
import type { Order } from '@/lib/types';
import { createVenueStore, type VenueStore } from '@/lib/venue';

export default function Page() {
  const storeRef = useRef<VenueStore>();
  if (!storeRef.current) storeRef.current = createVenueStore();
  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [selBid, setSelBid] = useState<string>();
  const [selAsk, setSelAsk] = useState<string>();

  // Keep a valid pair selected: default to top-of-book, and re-default when a selection is consumed.
  useEffect(() => {
    const has = (id?: string, side?: 'bid' | 'ask') =>
      id && state.orders.some((o) => o.id === id && o.side === side);
    if (!has(selBid, 'bid')) setSelBid(store.bestBid()?.id);
    if (!has(selAsk, 'ask')) setSelAsk(store.bestAsk()?.id);
  }, [state.orders, selBid, selAsk, store]);

  const bid = useMemo(() => state.orders.find((o) => o.id === selBid), [state.orders, selBid]);
  const ask = useMemo(() => state.orders.find((o) => o.id === selAsk), [state.orders, selAsk]);

  const pick = (o: Order) => (o.side === 'bid' ? setSelBid(o.id) : setSelAsk(o.id));

  return (
    <main className="terminal">
      <Masthead state={state} />

      <div className="instrument">
        <div className="cell hero">
          <span className="k">Instrument</span>
          <span className="v">{INSTRUMENT.name}</span>
        </div>
        <div className="cell">
          <span className="k">ISIN</span>
          <span className="v num">{INSTRUMENT.isin}</span>
        </div>
        <div className="cell">
          <span className="k">Coupon</span>
          <span className="v num">{INSTRUMENT.coupon}</span>
        </div>
        <div className="cell">
          <span className="k">Maturity</span>
          <span className="v">{INSTRUMENT.maturity}</span>
        </div>
        <div className="cell">
          <span className="k">Standard</span>
          <span className="v">ATS · ERC-3643</span>
        </div>
        <div className="cell">
          <span className="k">Partition</span>
          <span className="v gold">{INSTRUMENT.partitionName}</span>
        </div>
      </div>

      <div className="grid">
        <div className="col">
          <OrderBook store={store} state={state} selBid={selBid} selAsk={selAsk} onPick={pick} />
          <KycConsole store={store} state={state} />
        </div>
        <div className="col">
          <SettlementPanel store={store} state={state} bid={bid} ask={ask} onSettled={() => void 0} />
          <SettlementTape state={state} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <VerifierPanel store={store} state={state} />
      </div>

      <footer className="footer">
        <span className="seam">
          one seam · <b>ISettlementLeg</b> · delivery always an ATS Hold, payment swappable
        </span>
        <span>
          HEDERA ATS · THE GRAPH · ARC — built for ETHOnline 2026
        </span>
      </footer>
    </main>
  );
}
