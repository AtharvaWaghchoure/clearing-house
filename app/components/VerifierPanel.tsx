'use client';

import { useCallback, useEffect, useState } from 'react';
import { shortId } from '@/lib/format';
import { audit } from '@/lib/verify';
import type { AuditReport, Hex, VenueClaim } from '@/lib/types';
import type { VenueStore, VenueState } from '@/lib/venue';

type LieKind = 'none' | 'fabricate' | 'hide';

// A trade id the venue will SWEAR cleared — but which has no on-chain receipt. Matches the fabricated
// entry in the local demo ledger (verifier/.local/venue-ledger.json → 0x…019d).
const FABRICATED: Hex = '0x000000000000000000000000000000000000000000000000000000000000019d';

export default function VerifierPanel({ store, state }: { store: VenueStore; state: VenueState }) {
  const [lie, setLie] = useState<LieKind>('none');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);

  const settleKey = state.settlements.map((s) => s.tradeId).join(',');
  const eventKey = state.events.length;

  const run = useCallback(async () => {
    setBusy(true);
    const honest = store.honestClaims();
    const lastId = state.settlements.at(-1)?.tradeId;
    const body =
      lie === 'fabricate'
        ? { claims: honest, lie: { kind: 'fabricate', tradeId: FABRICATED } }
        : lie === 'hide' && lastId
          ? { claims: honest, lie: { kind: 'hide', tradeId: lastId } }
          : { claims: honest, lie: { kind: 'none' } };

    let venueReport: VenueClaim[] = honest;
    try {
      const res = await fetch('/api/venue/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (Array.isArray(json.report)) venueReport = json.report;
    } catch {
      // backend unreachable — reconcile against the honest claims we hold locally.
    }
    setReport(audit(state.settlements, state.events, venueReport));
    setBusy(false);
  }, [store, state.settlements, state.events, lie]);

  // Re-audit whenever the chain moves or the injected lie changes.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey, eventKey, lie]);

  const clean = report?.clean ?? true;

  return (
    <section className="panel verifier">
      <header>
        <div className="title">
          <span className="ix">iv.</span>
          <h2>Independent Verifier</h2>
        </div>
        <span className="hint">shares no venue code</span>
      </header>

      <div className="vf-controls">
        <span className="label" style={{ marginRight: 2 }}>
          Venue report
        </span>
        <button className={`tinybtn ${lie === 'none' ? 'run' : ''}`} onClick={() => setLie('none')}>
          Honest
        </button>
        <button
          className={`tinybtn danger ${lie === 'fabricate' ? 'on' : ''}`}
          onClick={() => setLie(lie === 'fabricate' ? 'none' : 'fabricate')}
        >
          Fabricate {shortId(FABRICATED)}
        </button>
        <button
          className={`tinybtn danger ${lie === 'hide' ? 'on' : ''}`}
          onClick={() => setLie(lie === 'hide' ? 'none' : 'hide')}
          disabled={state.settlements.length === 0}
        >
          Hide last
        </button>
        <button className="tinybtn" onClick={run} style={{ marginLeft: 'auto' }}>
          {busy ? 'Reconstructing…' : 'Re-audit'}
        </button>
      </div>

      <div className={`attest ${clean ? 'clean' : 'dirty'}`}>
        <div className="verdict-big">
          <span className="lamp" />
          {clean ? 'Report reconciled · no divergence' : 'Divergence detected'}
        </div>
        <div className="meta num">
          {report ? (
            <>
              {report.venueClaimsCount} claimed · {report.onChainCount} on-chain · {report.confirmed} confirmed
            </>
          ) : (
            '—'
          )}
        </div>
      </div>

      <div>
        {report && report.findings.length === 0 && (
          <div className="empty">Nothing settled yet — the venue has made no claims to check.</div>
        )}
        {report?.findings.map((f) => (
          <div key={`${f.tradeId}-${f.status}`} className={`finding ${f.severity}`}>
            <span className="lamp" />
            <span className="tid">{shortId(f.tradeId)}</span>
            <div className="body">
              <div className="st">{f.status.replace(/_/g, ' ')}</div>
              <div className="dt">{f.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
