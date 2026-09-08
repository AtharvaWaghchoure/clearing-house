'use client';

import { deskName, INSTRUMENT } from '@/lib/accounts';
import { priceStr, qtyStr, cashStr, shortAddr, notional } from '@/lib/format';
import type { LegVerdict, Order, Rail } from '@/lib/types';
import type { VenueStore, VenueState } from '@/lib/venue';

interface Props {
  store: VenueStore;
  state: VenueState;
  bid?: Order;
  ask?: Order;
  onSettled: () => void;
}

function Leg({ name, v, rail }: { name: string; v: LegVerdict; rail?: Rail }) {
  return (
    <div className={`reg-leg ${v.ok ? 'ok' : 'bad'}`}>
      <span className="lamp" />
      <span className="legname">{name}</span>
      <span className="code">
        <span className="hex num">{v.code}</span>
        <span className="cname">{v.codeName}</span>
        {rail && <span className="rail-tag">{rail === 'arc' ? 'Arc · Memo' : 'Hedera · Hold'}</span>}
      </span>
      <span className="reason">{v.reason === '—' ? v.detail : `· ${v.reason}`}</span>
    </div>
  );
}

export default function SettlementPanel({ store, state, bid, ask, onSettled }: Props) {
  const ready = bid && ask;
  const qty = ready ? Math.min(bid!.quantity, ask!.quantity) : 0;
  const clearingCents = ask?.priceCents ?? 0;
  const cash = ready ? notional(clearingCents, qty) : 0;
  const pf = ready ? store.preflight(bid!, ask!) : undefined;

  const doSettle = () => {
    if (!ready || !pf?.ok) return;
    const res = store.settle(bid!.id, ask!.id);
    if (res.ok) onSettled();
  };

  return (
    <section className="panel">
      <header>
        <div className="title">
          <span className="ix">ii.</span>
          <h2>Settlement · Delivery vs Payment</h2>
        </div>
        <div className="rail">
          <button className={state.rail === 'hedera' ? 'on' : ''} onClick={() => store.setRail('hedera')}>
            Hedera Hold
          </button>
          <button className={state.rail === 'arc' ? 'on' : ''} onClick={() => store.setRail('arc')}>
            Arc USDC
          </button>
        </div>
      </header>

      <div className="settle-body">
        <div className="cross">
          <div className="party buy">
            <span className="role">Buyer · takes bond</span>
            <span className="who">{ready ? deskName(bid!.account) : '—'}</span>
            <span className="addr num">{ready ? shortAddr(bid!.account) : 'select a bid'}</span>
          </div>
          <div className="vs">⇄</div>
          <div className="party sell">
            <span className="role">Seller · takes cash</span>
            <span className="who">{ready ? deskName(ask!.account) : '—'}</span>
            <span className="addr num">{ready ? shortAddr(ask!.account) : 'select an ask'}</span>
          </div>
        </div>

        <div className="terms">
          <div className="t">
            <span className="k">Instrument</span>
            <span className="v" style={{ fontSize: 12 }}>
              {INSTRUMENT.ticker}
            </span>
          </div>
          <div className="t">
            <span className="k">Quantity</span>
            <span className="v num">{ready ? qtyStr(qty) : '—'}</span>
          </div>
          <div className="t">
            <span className="k">Clearing · Cash</span>
            <span className="v gold num">
              {ready ? `${cashStr(cash)}` : '—'}
              <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 6 }}>
                @ {ready ? priceStr(clearingCents) : '—'}
              </span>
            </span>
          </div>
        </div>

        <div className="register">
          <div className="reg-head">
            <span className="label">Pre-flight register · engine.preflight()</span>
            <span
              className="verdict"
              style={{ color: !pf ? 'var(--faint)' : pf.ok ? 'var(--ok-2)' : 'var(--bad-2)' }}
            >
              {!pf ? 'awaiting pair' : pf.ok ? 'will clear' : 'will revert'}
            </span>
          </div>
          {pf ? (
            <>
              <Leg name="Delivery" v={pf.bond} />
              <Leg name="Payment" v={pf.cash} rail={state.rail} />
            </>
          ) : (
            <div className="empty">Select one bid and one ask to read compliance before signing.</div>
          )}
        </div>

        <div className="action">
          <button
            className={`btn ${!ready ? '' : pf?.ok ? 'armed' : 'blocked'}`}
            disabled={!ready || !pf?.ok}
            onClick={doSettle}
          >
            {!ready
              ? 'Select a bid & an ask'
              : pf?.ok
                ? 'Match & Settle · one atomic tx'
                : `Settlement blocked · ${(!pf?.bond.ok ? pf?.bond : pf?.cash)?.code} ${
                    (!pf?.bond.ok ? pf?.bond : pf?.cash)?.reason
                  }`}
          </button>
        </div>
      </div>
    </section>
  );
}
