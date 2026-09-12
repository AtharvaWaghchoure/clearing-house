'use client';

// The other cash rail. Same ISettlementLeg seam, different chain: on Arc the payment leg settles
// USDC through the Memo contract, which leaves a Transfer from the payer's own address and an
// indexed memo carrying the trade id — enough to reconcile a settlement from logs alone.

import { useEffect, useState } from 'react';
import { shortAddr } from '@/lib/format';

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

export default function ArcPanel() {
  const [d, setD] = useState<ArcData | null>(null);

  useEffect(() => {
    fetch('/api/arc')
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  return (
    <section>
      <div className="block-head">
        <h2>The swappable rail</h2>
        <span className="what">cash settled on Arc</span>
        {d ? <span className="meta">{d.chainId}</span> : null}
      </div>

      {d ? (
        <>
          <div className="proofs">
            <div className="proof">
              <span className="k">Transfer.from</span>
              <span className="v">
                {shortAddr(d.settlement.payer)}
                {d.settlement.transferFromIsPayerEoa ? (
                  <span className="tick" aria-label="matches the payer">
                    ✓
                  </span>
                ) : null}
              </span>
            </div>
            <div className="proof">
              <span className="k">Memo.memoId</span>
              <span className="v">
                = tradeId
                {d.settlement.memoIdEqualsTradeId ? (
                  <span className="tick" aria-label="matches the trade id">
                    ✓
                  </span>
                ) : null}
              </span>
            </div>
            <div className="proof">
              <span className="k">Amount</span>
              <span className="v">{d.settlement.amountUsdc} USDC</span>
            </div>
          </div>

          <p className="note">
            Because the payment runs through <b>Memo</b>, the transfer comes from the payer’s own
            address and the trade id rides an indexed topic — so anyone can match cash to trade from
            logs, with nothing to take on trust. Moving the venue onto this rail is one{' '}
            <b>setLegs</b> call.
          </p>

          <div className="links">
            <a className="btn btn-sm" href={d.arcscan.tx} target="_blank" rel="noreferrer">
              The settlement
            </a>
            <a className="btn btn-sm btn-quiet" href={d.arcscan.leg} target="_blank" rel="noreferrer">
              ArcMemoLeg contract
            </a>
          </div>
        </>
      ) : (
        <p className="empty">Reading the Arc settlement.</p>
      )}
    </section>
  );
}
