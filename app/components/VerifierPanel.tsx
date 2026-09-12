'use client';

// The second opinion. It reads the same public Hedera facts the rest of the terminal does —
// SettlementReceipts plus ATS identity events — reconstructs whether each trade was compliant at
// the block it cleared, and holds that against what the venue says it did. Sharing no venue code is
// the whole point, so the controls below let you make the venue lie and watch it get caught.

import { useCallback, useEffect, useState } from 'react';
import { VENUE } from '@/lib/chain';
import { shortId } from '@/lib/format';
import { fetchComplianceEvents, fetchSettlements } from '@/lib/onchain';
import type { AuditReport, ComplianceEvent, Hex, OnChainSettlement, VenueClaim } from '@/lib/types';
import { audit } from '@/lib/verify';

type LieKind = 'none' | 'fabricate' | 'hide';

// A trade the venue would claim cleared but for which no receipt exists on-chain.
const FABRICATED: Hex = '0x000000000000000000000000000000000000000000000000000000000000019d';
const DEAD = '0x000000000000000000000000000000000000dEaD' as const;

/** The venue's honest report: exactly what cleared. */
function honestClaims(settlements: OnChainSettlement[]): VenueClaim[] {
  return settlements.map((s) => ({
    tradeId: s.tradeId,
    bondToken: s.bondToken,
    seller: s.seller,
    buyer: s.buyer,
    quantity: s.quantity.toString(),
    cashToken: s.cashToken,
    cashAmount: s.cashAmount.toString(),
    compliant: true,
  }));
}

export default function VerifierPanel() {
  const [settlements, setSettlements] = useState<OnChainSettlement[]>([]);
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [lie, setLie] = useState<LieKind>('none');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, e] = await Promise.all([fetchSettlements(), fetchComplianceEvents()]);
      setSettlements(s);
      setEvents(e);
    } catch {
      // chain unreachable — keep the last good reading
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let claims = honestClaims(settlements);
    if (lie === 'fabricate') {
      claims = [
        ...claims,
        {
          tradeId: FABRICATED,
          bondToken: VENUE.bondToken,
          seller: DEAD,
          buyer: DEAD,
          quantity: '1',
          cashToken: VENUE.cashToken,
          cashAmount: '1',
          compliant: true,
        },
      ];
    } else if (lie === 'hide' && claims.length > 0) {
      claims = claims.slice(0, -1);
    }
    setReport(audit(settlements, events, claims));
  }, [settlements, events, lie]);

  const clean = report?.clean ?? true;

  return (
    <section>
      <div className="block-head">
        <h2>Independent check</h2>
        <span className="what">reconstructed from chain data, not from the venue</span>
      </div>

      <div className="controls">
        <span className="lbl">The venue reports</span>
        <button
          className={`btn btn-sm${lie === 'none' ? ' honest-on' : ''}`}
          onClick={() => setLie('none')}
        >
          Honestly
        </button>
        <button
          className={`btn btn-sm${lie === 'fabricate' ? ' on' : ''}`}
          onClick={() => setLie(lie === 'fabricate' ? 'none' : 'fabricate')}
        >
          A trade that never happened
        </button>
        <button
          className={`btn btn-sm${lie === 'hide' ? ' on' : ''}`}
          onClick={() => setLie(lie === 'hide' ? 'none' : 'hide')}
          disabled={settlements.length === 0}
        >
          One fewer than it cleared
        </button>
        <button className="btn btn-sm btn-quiet" onClick={() => void load()} disabled={busy}>
          {busy ? 'Reading the chain' : 'Re-check'}
        </button>
      </div>

      <div className={`verdict${clean ? '' : ' dirty'}`}>
        <i aria-hidden />
        <span className="say">
          {clean ? 'The venue’s report matches the chain' : 'The venue’s report contradicts the chain'}
        </span>
        <span className="tally">
          {report
            ? `${report.confirmed} of ${report.venueClaimsCount} claims confirmed against ${report.onChainCount} on-chain`
            : '—'}
        </span>
      </div>

      {report && report.findings.length === 0 ? (
        <p className="empty">Nothing has settled yet, so there is nothing to check.</p>
      ) : null}

      {report?.findings.map((f) => (
        <div key={`${f.tradeId}-${f.status}`} className={`finding ${f.severity}`}>
          <i aria-hidden />
          <span className="tid">{shortId(f.tradeId)}</span>
          <div>
            <div className="st">{f.status.replace(/_/g, ' ').toLowerCase()}</div>
            <div className="dt">{f.detail}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
