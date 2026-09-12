'use client';

// What actually cleared, read from SettlementReceipt logs on Hedera testnet. Laid out as a grid
// rather than a flex row: the old tape let a long cash figure run underneath the status codes
// beside it.

import Link from 'next/link';
import { INSTRUMENT, deskName } from '@/lib/accounts';
import { blockStr, cashStr, qtyStr, shortId } from '@/lib/format';
import type { OnChainSettlement } from '@/lib/types';

export default function SettlementTape({ settlements }: { settlements: OnChainSettlement[] }) {
  const rows = [...settlements].reverse();

  return (
    <section>
      <div className="block-head">
        <h2>The tape</h2>
        <span className="what">every trade this venue has cleared</span>
        <span className="meta">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">Nothing has cleared yet. Settled trades appear here as they happen.</p>
      ) : (
        <div className="tape">
          {rows.map((s) => (
            <Link
              key={s.tradeId}
              href={`/receipt?t=${s.tradeId}&s=${s.seller}&b=${s.buyer}&q=${s.quantity}&c=${s.cashAmount}&bc=${s.bondCode}&cc=${s.cashCode}&r=${s.rail}`}
              className="tape-row"
              target="_blank"
              rel="noreferrer"
              title="Open the settlement certificate"
            >
              <span className="tid">{shortId(s.tradeId)}</span>
              <span className="flow">
                <span className="party">{deskName(s.seller)}</span>
                <span className="to" aria-label="to">
                  →
                </span>
                <span className="party">{deskName(s.buyer)}</span>
              </span>
              <span className="blk">{blockStr(s.blockNumber)}</span>
              <span className="amt">
                {qtyStr(s.quantity)} {INSTRUMENT.bondSymbol} for {cashStr(s.cashAmount)}{' '}
                {INSTRUMENT.cashSymbol}
              </span>
              <span className="marks">
                <span className={`mark ${s.bondCode === '0x01' ? 'ok' : 'no'}`}>{s.bondCode}</span>
                <span className={`mark ${s.cashCode === '0x01' ? 'ok' : 'no'}`}>{s.cashCode}</span>
                <span className="mark">{s.rail === 'arc' ? 'Arc' : 'Hedera'}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
