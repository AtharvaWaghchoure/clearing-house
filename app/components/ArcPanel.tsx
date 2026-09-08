'use client';

import { useEffect, useState } from 'react';

interface ArcData {
  network: string;
  chainId: number;
  leg: string;
  settlement: {
    tx: string;
    payer: string;
    recipient: string;
    amountUsdc: string;
    tradeId: string;
    transferFromIsPayerEoa: boolean;
    memoIdEqualsTradeId: boolean;
  };
  arcscan: { tx: string; leg: string };
  note: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// The Arc cash rail, surfaced from the backend (/api/arc) — the real USDC-via-Memo settlement on Arc
// testnet, whose logs alone prove reconciliation (Transfer.from = payer, indexed Memo memoId = tradeId).
export default function ArcPanel() {
  const [d, setD] = useState<ArcData | null>(null);
  useEffect(() => {
    fetch('/api/arc')
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  return (
    <section className="panel">
      <header>
        <div className="title">
          <span className="ix">◆</span>
          <h2>Arc · USDC settlement via Memo</h2>
        </div>
        <span className="hint">{d ? `${d.network} · ${d.chainId}` : 'loading'}</span>
      </header>

      {d && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="terms" style={{ border: '1px solid var(--line-2)' }}>
            <div className="t">
              <span className="k">Transfer.from</span>
              <span className="v num" style={{ fontSize: 12, color: 'var(--ok-2)' }}>
                {short(d.settlement.payer)} {d.settlement.transferFromIsPayerEoa && '✓'}
              </span>
            </div>
            <div className="t">
              <span className="k">Memo.memoId</span>
              <span className="v num" style={{ fontSize: 12, color: 'var(--ok-2)' }}>
                = tradeId {d.settlement.memoIdEqualsTradeId && '✓'}
              </span>
            </div>
            <div className="t">
              <span className="k">Amount</span>
              <span className="v gold num">{d.settlement.amountUsdc} USDC</span>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: 'var(--dim)', lineHeight: 1.6 }}>
            The cash leg settles USDC natively on Arc through <b style={{ color: 'var(--ink-2)' }}>Memo</b>,
            so the <b style={{ color: 'var(--ink-2)' }}>Transfer</b> is from the payer&apos;s own EOA and the
            trade id rides an <b style={{ color: 'var(--ink-2)' }}>indexed</b> Memo topic — reconcilable from
            logs alone. {d.note}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <a className="tinybtn run" href={d.arcscan.tx} target="_blank" rel="noreferrer">
              settlement tx ↗
            </a>
            <a className="tinybtn" href={d.arcscan.leg} target="_blank" rel="noreferrer">
              ArcMemoLeg ↗
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
