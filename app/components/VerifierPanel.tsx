'use client';

// The independent verifier, reading the same public Hedera-testnet facts the rest of the terminal
// does: SettlementReceipts + ATS identity/control events. It reconstructs each settlement's
// compliance at the block it cleared — sharing no venue code — and reconciles it against the venue's
// report. The Fabricate/Hide toggles inject a lie into that report to show reconstruction catches it.

import { useCallback, useEffect, useState } from 'react';
import { VENUE } from '@/lib/chain';
import { shortId } from '@/lib/format';
import { fetchComplianceEvents, fetchSettlements } from '@/lib/onchain';
import type { AuditReport, ComplianceEvent, Hex, OnChainSettlement, VenueClaim } from '@/lib/types';
import { audit } from '@/lib/verify';

type LieKind = 'none' | 'fabricate' | 'hide';

// A trade id the venue would claim cleared but which has no on-chain receipt.
const FABRICATED: Hex = '0x000000000000000000000000000000000000000000000000000000000000019d';
const DEAD = '0x000000000000000000000000000000000000dEaD' as const;

/** The venue's honest self-report: exactly what actually cleared on-chain. */
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
      // chain unreachable — keep the last good data
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-audit whenever the chain data or the injected lie changes.
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
    <section className="panel verifier">
      <header>
        <div className="title">
          <span className="ix">iv.</span>
          <h2>Independent Verifier</h2>
        </div>
        <span className="hint">reads Hedera · shares no venue code</span>
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
          disabled={settlements.length === 0}
        >
          Hide last
        </button>
        <button className="tinybtn" onClick={() => void load()} style={{ marginLeft: 'auto' }}>
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
