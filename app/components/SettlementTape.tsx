'use client';

import Link from 'next/link';
import { deskName, INSTRUMENT } from '@/lib/accounts';
import { cashStr, qtyStr, shortId, blockStr } from '@/lib/format';
import type { VenueState } from '@/lib/venue';

export default function SettlementTape({ state }: { state: VenueState }) {
  const rows = [...state.settlements].reverse();

  return (
    <section className="panel">
      <header>
        <div className="title">
          <span className="ix">iii.</span>
          <h2>Settlement Tape · SettlementReceipt</h2>
        </div>
        <span className="hint">{rows.length} cleared</span>
      </header>

      <div className="tape">
        {rows.length === 0 ? (
          <div className="empty">No settlements yet — match a bid against an ask.</div>
        ) : (
          rows.map((s) => (
            <Link
              key={s.tradeId}
              href={`/receipt?t=${s.tradeId}&s=${s.seller}&b=${s.buyer}&q=${s.quantity}&c=${s.cashAmount}&bc=${s.bondCode}&cc=${s.cashCode}&r=${s.rail}`}
              className="tape-row"
              target="_blank"
              rel="noreferrer"
              title="Open settlement certificate ↗"
            >
              <span className="tid">{shortId(s.tradeId)}</span>
              <span className="flow">
                {deskName(s.seller)}
                <span className="arrow">→</span>
                {deskName(s.buyer)}
                <span style={{ color: 'var(--faint)', marginLeft: 8 }}>
                  {qtyStr(s.quantity)} {INSTRUMENT.bondSymbol}
                </span>
              </span>
              <span className="r num" style={{ color: 'var(--dim)', fontSize: 10 }}>
                {blockStr(s.blockNumber)}
              </span>
              <span className="r num" style={{ color: 'var(--ink-2)' }}>
                {cashStr(s.cashAmount)} {INSTRUMENT.cashSymbol}
              </span>
              <span className="codes r">
                <span className="chip ok">{s.bondCode}</span>
                <span className="chip ok">{s.cashCode}</span>
                <span className="chip rail">{s.rail === 'arc' ? 'ARC' : 'HDR'}</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
