'use client';

// The floor, laid out as a ledger spread around a centre rule.
//
//   left of the rule   asks — a seller who has posted a BOND hold
//   right of the rule  bids — a buyer who has posted a CASH hold
//   on the rule        everything you do, because settlement is the only
//                      thing that joins the two sides
//
// Selecting one order from each side stages a cross, and the cross asks the ATS itself whether both
// legs would move — the same canTransferByPartition the engine's preflight() calls — so a rejection
// is named (0x10 · AddressNotVerified) before anyone signs. Every action here is a real
// Hedera-testnet transaction.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INSTRUMENT, deskName } from '@/lib/accounts';
import { VENUE } from '@/lib/chain';
import { friendlyError } from '@/lib/errors';
import { cashStr } from '@/lib/format';
import { type Eligibility, balanceOf, bondEligibility, transferEligibility } from '@/lib/onchain';
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

/** Nudge the top bar to re-read balances after anything that moves value. */
function signalRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('venue:refresh'));
}

export default function TradeFloor({ onSettled }: { onSettled?: () => void }) {
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
  const [pf, setPf] = useState<{ bond: Eligibility; cash: Eligibility }>();

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

  const asks = useMemo(
    () => orders.filter((o) => o.side === 'ask').sort((a, b) => a.price - b.price),
    [orders],
  );
  const bids = useMemo(
    () => orders.filter((o) => o.side === 'bid').sort((a, b) => b.price - a.price),
    [orders],
  );

  const bid = useMemo(() => orders.find((o) => o.id === selBid), [orders, selBid]);
  const ask = useMemo(() => orders.find((o) => o.id === selAsk), [orders, selAsk]);
  const crossing = !!bid && !!ask && bid.quantity === ask.quantity && bid.price >= ask.price;

  // Ask the chain what would happen to each leg of the staged cross.
  useEffect(() => {
    if (!bid || !ask || !crossing) {
      setPf(undefined);
      return;
    }
    let live = true;
    const cash = BigInt(ask.quantity) * BigInt(bid.price);
    Promise.all([
      transferEligibility(VENUE.bondToken, ask.account, bid.account, BigInt(ask.quantity)),
      transferEligibility(VENUE.cashToken, bid.account, ask.account, cash),
    ])
      .then(([b, c]) => live && setPf({ bond: b, cash: c }))
      .catch(() => live && setPf(undefined));
    return () => {
      live = false;
    };
  }, [bid, ask, crossing]);

  const clearsPreflight = !!pf && pf.bond.ok && pf.cash.ok;

  async function doOnboard() {
    if (!w.address) return;
    setBusy('Verifying your identity on the ATS tokens and funding your account');
    setMsg(undefined);
    try {
      const res = await onboard(w.address);
      setVerified(true);
      signalRefresh();
      setMsg({
        kind: 'ok',
        text: res.hbarNote
          ? `Verified and funded — ${res.hbarNote}.`
          : 'Verified and funded. You can place an order now.',
      });
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
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
      setMsg({ kind: 'err', text: 'Price and quantity must be whole numbers above zero.' });
      return;
    }
    setMsg(undefined);

    // Don't ask anyone to sign a hold they can't cover.
    const token = mode === 'sell' ? VENUE.bondToken : VENUE.cashToken;
    const need = mode === 'sell' ? BigInt(q) : BigInt(q) * BigInt(p);
    const sym = mode === 'sell' ? INSTRUMENT.bondSymbol : INSTRUMENT.cashSymbol;
    const have = await balanceOf(token, w.address);
    if (have < need) {
      setMsg({
        kind: 'err',
        text: `You need ${need} ${sym} free but hold ${have}. Cancel a resting order to release one, or onboard for more.`,
      });
      return;
    }

    try {
      if (mode === 'sell') {
        setBusy(`Placing a hold on ${q} ${INSTRUMENT.bondSymbol} — confirm in your wallet`);
        const holdId = await placeHold(wallet, w.address, VENUE.bondToken, BigInt(q));
        setBusy('Posting your ask');
        await submitOrder({ side: 'ask', account: w.address, price: p, quantity: q, holdId: holdId.toString() });
      } else {
        const cash = q * p;
        setBusy(`Placing a hold on ${cashStr(cash)} ${INSTRUMENT.cashSymbol} — confirm in your wallet`);
        const holdId = await placeHold(wallet, w.address, VENUE.cashToken, BigInt(cash));
        setBusy('Posting your bid');
        await submitOrder({ side: 'bid', account: w.address, price: p, quantity: q, holdId: holdId.toString() });
      }
      setMsg({ kind: 'ok', text: 'Your order is resting. The hold backing it is live on-chain.' });
      refresh();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
    } finally {
      setBusy(undefined);
    }
  }

  async function doSettle() {
    if (!selBid || !selAsk) return;
    setBusy('Clearing both legs in one transaction');
    setMsg(undefined);
    try {
      const r = await settlePair(selBid, selAsk);
      setMsg({ kind: 'ok', text: `Cleared as trade ${r.tradeId.slice(0, 10)}…`, link: r.link });
      setSelBid(undefined);
      setSelAsk(undefined);
      refresh();
      onSettled?.();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
    } finally {
      setBusy(undefined);
    }
  }

  async function doCancel(o: BookOrder) {
    const wallet = w.walletClient();
    if (!w.address || !wallet) return;
    setBusy('Releasing your hold — confirm in your wallet');
    setMsg(undefined);
    try {
      const token = o.side === 'ask' ? VENUE.bondToken : VENUE.cashToken;
      await releaseHold(wallet, w.address, token, o.holdId);
      await cancelOrder(o.id);
      if (selBid === o.id) setSelBid(undefined);
      if (selAsk === o.id) setSelAsk(undefined);
      setMsg({ kind: 'ok', text: 'Order withdrawn. The hold is released and the funds are back in your balance.' });
      refresh();
      signalRefresh();
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e) });
    } finally {
      setBusy(undefined);
    }
  }

  function orderRow(o: BookOrder, sel: string | undefined, set: (id?: string) => void) {
    const mine = !!w.address && o.account.toLowerCase() === w.address.toLowerCase();
    const selected = sel === o.id;
    return (
      <div
        key={o.id}
        className={`order${selected ? ' sel' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => set(selected ? undefined : o.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            set(selected ? undefined : o.id);
          }
        }}
      >
        <span className="figures">
          <span className="qty num">{o.quantity}</span>
          <span className="at">at</span>
          <span className="px num">{o.price}</span>
        </span>
        <span className="who">{mine ? 'You' : deskName(o.account)}</span>
        {mine ? (
          <button
            className="order-drop"
            title="Withdraw this order and release the hold"
            aria-label="Withdraw this order"
            onClick={(e) => {
              e.stopPropagation();
              void doCancel(o);
            }}
            disabled={!!busy}
          >
            ✕
          </button>
        ) : null}
      </div>
    );
  }

  const committing =
    mode === 'buy'
      ? `${cashStr(Number(qty) * Number(price) || 0)} ${INSTRUMENT.cashSymbol}`
      : `${qty || 0} ${INSTRUMENT.bondSymbol}`;

  return (
    <section className="floor">
      <div className="side delivery">
        <div className="side-head">
          <h2>Delivery</h2>
          <span className="what">sellers holding bond</span>
          <span className="count num">{asks.length}</span>
        </div>
        {asks.length === 0 ? (
          <p className="empty">No bond on offer. Place an ask to be the first.</p>
        ) : (
          asks.map((o) => orderRow(o, selAsk, setSelAsk))
        )}
      </div>

      <div className="seam">
        {!w.address ? (
          <div className="gate">
            {w.hasProvider ? (
              <>
                <p>Connect a wallet to trade this bond on Hedera testnet.</p>
                <button className="btn" onClick={() => void w.connect()} disabled={w.connecting}>
                  {w.connecting ? 'Connecting' : 'Connect wallet'}
                </button>
              </>
            ) : (
              <p>
                Trading here needs a browser wallet on Hedera testnet — MetaMask or HashPack. The
                book, the tape and the independent check below all read live without one.
              </p>
            )}
          </div>
        ) : !w.onRightChain ? (
          <div className="gate">
            <p>The venue runs on Hedera testnet. Switch networks to continue.</p>
            <button className="btn" onClick={() => void w.switchChain()}>
              Switch to Hedera testnet
            </button>
          </div>
        ) : verified === false ? (
          <div className="gate">
            <p>
              Your address isn’t verified on this bond yet. The venue can register your identity on
              both ATS tokens and fund you with test bond and cash.
            </p>
            <button className="btn btn-primary" onClick={() => void doOnboard()} disabled={!!busy}>
              {busy ? 'Setting you up' : 'Verify and fund me'}
            </button>
          </div>
        ) : (
          <>
            <div className="ticket">
              <h2>Your order</h2>
              <p className="lede">
                Placing an order escrows the leg you owe in an ATS hold, signed by you.
              </p>

              <div className="sides">
                <button className={mode === 'buy' ? 'on' : ''} onClick={() => setMode('buy')}>
                  Buy bond
                </button>
                <button className={mode === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>
                  Sell bond
                </button>
              </div>

              <div className="fields">
                <label className="field">
                  <span>Price per unit</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="numeric"
                    aria-label={`Price per unit in ${INSTRUMENT.cashSymbol}`}
                  />
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    inputMode="numeric"
                    aria-label={`Quantity in ${INSTRUMENT.bondSymbol}`}
                  />
                </label>
              </div>

              <div className="commit">
                <span>You escrow</span>
                <span className="v">{committing}</span>
              </div>

              <button className="btn" onClick={() => void place()} disabled={!!busy}>
                {mode === 'buy' ? 'Place bid' : 'Place ask'}
              </button>
            </div>

            {bid && ask ? (
              <div
                className={`cross${
                  !crossing ? '' : clearsPreflight ? ' ready' : pf ? ' blocked' : ''
                }`}
              >
                <div className="cross-h">
                  {!crossing
                    ? 'These don’t cross'
                    : !pf
                      ? 'Checking both legs'
                      : clearsPreflight
                        ? 'Ready to cross'
                        : 'The chain refuses this trade'}
                </div>

                <div className="cross-legs">
                  <div className="cross-leg">
                    <span className="k">Delivery</span>
                    <span className="v">
                      {ask.quantity} {INSTRUMENT.bondSymbol}
                    </span>
                  </div>
                  <span className="cross-and" aria-hidden>
                    ∧
                  </span>
                  <div className="cross-leg r">
                    <span className="k">Payment</span>
                    <span className="v">
                      {cashStr(ask.quantity * bid.price)} {INSTRUMENT.cashSymbol}
                    </span>
                  </div>
                </div>

                {!crossing ? (
                  <p className="cross-hint">
                    {bid.quantity !== ask.quantity
                      ? 'Pick a bid and an ask of the same quantity.'
                      : 'The bid is below the ask.'}
                  </p>
                ) : (
                  <>
                    <div className="preflight">
                      <div className={`pf ${pf ? (pf.bond.ok ? 'ok' : 'no') : ''}`}>
                        <i aria-hidden />
                        Bond to the buyer
                        <span className="code">
                          {pf ? `${pf.bond.code} ${pf.bond.ok ? pf.bond.codeName : pf.bond.reason}` : 'checking'}
                        </span>
                      </div>
                      <div className={`pf ${pf ? (pf.cash.ok ? 'ok' : 'no') : ''}`}>
                        <i aria-hidden />
                        Cash to the seller
                        <span className="code">
                          {pf ? `${pf.cash.code} ${pf.cash.ok ? pf.cash.codeName : pf.cash.reason}` : 'checking'}
                        </span>
                      </div>
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => void doSettle()}
                      disabled={!clearsPreflight || !!busy}
                    >
                      Settle both legs
                    </button>

                    {pf && !clearsPreflight ? (
                      <p className="cross-hint">
                        Both parties must be verified on this bond before it can settle.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </>
        )}

        {busy ? <div className="status busy">{busy}</div> : null}
        {msg ? (
          <div className={`status ${msg.kind}`}>
            {msg.text}
            {msg.link ? (
              <>
                {' '}
                <a href={msg.link} target="_blank" rel="noreferrer">
                  View on HashScan
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="side payment">
        <div className="side-head">
          <h2>Payment</h2>
          <span className="what">buyers holding cash</span>
          <span className="count num">{bids.length}</span>
        </div>
        {bids.length === 0 ? (
          <p className="empty">No cash on offer. Place a bid to be the first.</p>
        ) : (
          bids.map((o) => orderRow(o, selBid, setSelBid))
        )}
      </div>
    </section>
  );
}
