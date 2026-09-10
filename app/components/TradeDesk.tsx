'use client';

// The live trade desk. Everything here is a real Hedera-testnet action: onboarding (operator verifies
// + funds you), placing an order (you sign an ATS hold from your wallet), and settling a matched pair
// (operator clears it atomically). No simulation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INSTRUMENT, deskName } from '@/lib/accounts';
import { VENUE } from '@/lib/chain';
import { cashStr } from '@/lib/format';
import { bondEligibility } from '@/lib/onchain';
import {
  type BookOrder,
  cancelOrder,
  fetchOrders,
  onboard,
  placeHold,
  releaseHold,
  settlePair,
  submitOrder,
} from '@/lib/venueClient';
import { useWallet } from '@/lib/wallet';

type Msg = { kind: 'ok' | 'err'; text: string; link?: string };

/** Nudge sibling components (the connect bar's position readout) to re-read the chain after an action. */
function signalRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('venue:refresh'));
}

export default function TradeDesk({ onSettled }: { onSettled?: () => void }) {
  const w = useWallet();
  const [orders, setOrders] = useState<BookOrder[]>([]);
  const [verified, setVerified] = useState<boolean>();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('100');
  const [qty, setQty] = useState('5');
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<Msg>();
  const [selBid, setSelBid] = useState<string>();
  const [selAsk, setSelAsk] = useState<string>();

  const refresh = useCallback(() => {
    fetchOrders().then(setOrders).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!w.address || !w.onRightChain) {
      setVerified(undefined);
      return;
    }
    bondEligibility(w.address)
      .then((e) => setVerified(e.ok))
      .catch(() => setVerified(undefined));
  }, [w.address, w.onRightChain]);

  const bids = useMemo(() => orders.filter((o) => o.side === 'bid').sort((a, b) => b.price - a.price), [orders]);
  const asks = useMemo(() => orders.filter((o) => o.side === 'ask').sort((a, b) => a.price - b.price), [orders]);

  const crossing = useMemo(() => {
    if (!selBid || !selAsk) return false;
    const b = orders.find((o) => o.id === selBid);
    const a = orders.find((o) => o.id === selAsk);
    return !!b && !!a && b.quantity === a.quantity && b.price >= a.price;
  }, [orders, selBid, selAsk]);

  async function doOnboard() {
    if (!w.address) return;
    setBusy('Onboarding — verifying identity + funding on testnet…');
    setMsg(undefined);
    try {
      await onboard(w.address);
      setVerified(true);
      signalRefresh();
      setMsg({ kind: 'ok', text: 'Onboarded — you are verified and funded with test bond + cash.' });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  async function place() {
    const wallet = w.walletClient();
    if (!w.address || !wallet) return;
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isInteger(p) || p <= 0 || !Number.isInteger(q) || q <= 0) {
      setMsg({ kind: 'err', text: 'price and quantity must be positive whole numbers' });
      return;
    }
    setMsg(undefined);
    try {
      if (mode === 'sell') {
        setBusy(`Placing a bond hold for ${q} ${INSTRUMENT.bondSymbol} — confirm in your wallet…`);
        const holdId = await placeHold(wallet, w.address, VENUE.bondToken, BigInt(q));
        setBusy('Submitting ask…');
        await submitOrder({ side: 'ask', account: w.address, price: p, quantity: q, holdId: holdId.toString() });
      } else {
        const cash = q * p;
        setBusy(`Placing a cash hold for ${cashStr(cash)} ${INSTRUMENT.cashSymbol} — confirm in your wallet…`);
        const holdId = await placeHold(wallet, w.address, VENUE.cashToken, BigInt(cash));
        setBusy('Submitting bid…');
        await submitOrder({ side: 'bid', account: w.address, price: p, quantity: q, holdId: holdId.toString() });
      }
      setMsg({ kind: 'ok', text: 'Order is resting — your hold is live on-chain.' });
      refresh();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  async function doSettle() {
    if (!selBid || !selAsk) return;
    setBusy('Settling — the operator is clearing the trade atomically…');
    setMsg(undefined);
    try {
      const r = await settlePair(selBid, selAsk);
      setMsg({ kind: 'ok', text: `Cleared — trade ${r.tradeId.slice(0, 10)}…`, link: r.link });
      setSelBid(undefined);
      setSelAsk(undefined);
      refresh();
      onSettled?.();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  async function doCancel(o: BookOrder) {
    const wallet = w.walletClient();
    if (!w.address || !wallet) return;
    setBusy('Cancelling — releasing your hold, confirm in your wallet…');
    setMsg(undefined);
    try {
      const token = o.side === 'ask' ? VENUE.bondToken : VENUE.cashToken;
      await releaseHold(wallet, w.address, token, o.holdId);
      await cancelOrder(o.id);
      if (selBid === o.id) setSelBid(undefined);
      if (selAsk === o.id) setSelAsk(undefined);
      setMsg({ kind: 'ok', text: 'Order cancelled — hold released, funds back in your balance.' });
      refresh();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  }

  const row = (o: BookOrder, sel: string | undefined, set: (id?: string) => void) => {
    const mine = !!w.address && o.account.toLowerCase() === w.address.toLowerCase();
    return (
      <div
        key={o.id}
        className={`td-row ${sel === o.id ? 'sel' : ''}${mine ? ' mine' : ''}`}
        onClick={() => set(sel === o.id ? undefined : o.id)}
      >
        <span className="q">{o.quantity}</span>
        <span className={`p ${o.side}`}>{o.price}</span>
        <span className="who">{mine ? 'you' : deskName(o.account)}</span>
        {mine ? (
          <button
            className="td-cancel"
            title="Cancel order — release your hold"
            onClick={(e) => {
              e.stopPropagation();
              void doCancel(o);
            }}
            disabled={!!busy}
          >
            ✕
          </button>
        ) : (
          <span className="td-cancel-spacer" aria-hidden />
        )}
      </div>
    );
  };

  return (
    <section className="panel tradedesk">
      <header>
        <div className="title">
          <span className="ix">i.</span>
          <h2>Trade Desk · live DvP</h2>
        </div>
        <span className="hint">{!w.address ? 'connect wallet' : !w.onRightChain ? 'wrong network' : verified === false ? 'not onboarded' : verified ? 'ready' : '…'}</span>
      </header>

      {!w.address ? (
        <div className="td-gate">Connect a wallet in the bar above to place real orders on Hedera testnet.</div>
      ) : !w.onRightChain ? (
        <div className="td-gate warn">Switch to Hedera Testnet (296) to trade.</div>
      ) : verified === false ? (
        <div className="td-onboard">
          <p>Your address isn’t onboarded. The venue can verify your identity on the ATS tokens and fund you with test bond + cash so you can trade — one click.</p>
          <button className="cb-connect" onClick={() => void doOnboard()} disabled={!!busy}>
            {busy ? 'Onboarding…' : 'Onboard me'}
            <span className="arw"> →</span>
          </button>
        </div>
      ) : (
        <>
          <div className="td-form">
            <div className="td-modes">
              <button className={mode === 'buy' ? 'on' : ''} onClick={() => setMode('buy')}>
                Buy bond
              </button>
              <button className={mode === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>
                Sell bond
              </button>
            </div>
            <label className="td-field">
              <span>Price / unit ({INSTRUMENT.cashSymbol})</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
            </label>
            <label className="td-field">
              <span>Quantity ({INSTRUMENT.bondSymbol})</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </label>
            <div className="td-note">
              {mode === 'buy'
                ? `You’ll hold ${cashStr(Number(qty) * Number(price) || 0)} ${INSTRUMENT.cashSymbol} (cash)`
                : `You’ll hold ${qty || 0} ${INSTRUMENT.bondSymbol} (bond)`}
            </div>
            <button className="cb-connect td-place" onClick={() => void place()} disabled={!!busy}>
              {mode === 'buy' ? 'Place bid' : 'Place ask'}
              <span className="arw"> →</span>
            </button>
          </div>

          <div className="td-book">
            <div className="td-col">
              <div className="td-h bid">Bids · buyers</div>
              {bids.length === 0 ? <div className="empty">no resting bids</div> : bids.map((o) => row(o, selBid, setSelBid))}
            </div>
            <div className="td-col">
              <div className="td-h ask">Asks · sellers</div>
              {asks.length === 0 ? <div className="empty">no resting asks</div> : asks.map((o) => row(o, selAsk, setSelAsk))}
            </div>
          </div>

          <div className="td-settle">
            <button className="cb-connect" onClick={() => void doSettle()} disabled={!crossing || !!busy}>
              Settle selected pair
              <span className="arw"> →</span>
            </button>
            {!crossing && (selBid || selAsk) ? (
              <span className="td-hint">pick a crossing bid + ask of equal quantity</span>
            ) : null}
          </div>
        </>
      )}

      {busy ? <div className="td-status busy">{busy}</div> : null}
      {msg ? (
        <div className={`td-status ${msg.kind}`}>
          {msg.text}
          {msg.link ? (
            <>
              {' · '}
              <a href={msg.link} target="_blank" rel="noreferrer">
                HashScan ↗
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
