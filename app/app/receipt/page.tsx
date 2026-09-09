'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { INSTRUMENT, deskName } from '@/lib/accounts';
import { cashStr, shortAddr, shortId } from '@/lib/format';
import type { Address, Hex } from '@/lib/types';

// A printable Certificate of Settlement — the venue's "provable settlement" claim rendered as an
// engraved instrument. Reads a trade from the URL (?t&s&b&q&c&bc&cc&r, as linked from the settlement
// tape) and falls back to the canonical specimen. ⌘/Ctrl-P re-renders it as paper (see @media print).
const HELV31 = '0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a'; // the real HELV31 diamond on Hedera testnet
const MICRO = 'CLEARING·HOUSE·PROVABLE·SETTLEMENT·'.repeat(30);
const hashscan = `https://hashscan.io/testnet/contract/${HELV31}`;

interface Party {
  name: string;
  addr: string;
}
interface Trade {
  tradeId: string;
  qty: string;
  cashUnits: number;
  seller: Party;
  buyer: Party;
  bondCode: string;
  cashCode: string;
  railLabel: string;
}

const SPECIMEN: Trade = {
  tradeId: `0x${'0'.repeat(63)}1`,
  qty: '10',
  cashUnits: 10 * INSTRUMENT.face,
  seller: { name: 'MERIDIAN CAPITAL', addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  buyer: { name: 'ASHFORD PENSION', addr: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  bondCode: '0x01',
  cashCode: '0x01',
  railLabel: 'swappable rail — Hedera hold or Arc Memo',
};

function tradeFromParams(sp: { get(k: string): string | null }): Trade | null {
  const t = sp.get('t');
  if (!t) return null;
  const g = (k: string, fallback = '') => sp.get(k) ?? fallback; // param or default
  const s = g('s');
  const b = g('b');
  return {
    tradeId: t,
    qty: g('q', '—'),
    cashUnits: Number(g('c', '0')),
    seller: { name: deskName(s as Address), addr: s },
    buyer: { name: deskName(b as Address), addr: b },
    bondCode: g('bc', '0x01'),
    cashCode: g('cc', '0x01'),
    railLabel: g('r') === 'arc' ? 'Arc · USDC via Memo' : 'Hedera · deposit-token hold',
  };
}

function Certificate() {
  const sp = useSearchParams();
  const trade = tradeFromParams(sp) ?? SPECIMEN;
  const no = shortId(trade.tradeId as Hex);

  return (
    <main className="specimen">
      <article className="plate">
        <span className="plate-edge" aria-hidden />
        <span className="corner tl" aria-hidden />
        <span className="corner tr" aria-hidden />
        <span className="corner bl" aria-hidden />
        <span className="corner br" aria-hidden />
        <div className="microtext" aria-hidden>
          {MICRO}
        </div>

        <header className="pl-head">
          <span className="pl-mark">⇄</span>
          <div className="pl-headtxt">
            <div className="pl-issuer">Clearing House</div>
            <h1 className="pl-title">Certificate of Settlement</h1>
          </div>
          <div className="pl-no">
            <span className="k">Certificate</span>
            <span className="v num">{no}</span>
          </div>
        </header>

        <div className="pl-hair" />

        <p className="pl-attest">
          This certifies that one delivery-versus-payment trade cleared <b>atomically</b> — both legs in a
          single transaction — with compliance verified <b>inside</b> it.
        </p>

        <div className="pl-legs">
          <div className="pl-leg">
            <span className="lg-k">Delivery</span>
            <span className="lg-v serif">
              {trade.qty} {INSTRUMENT.bondSymbol}
            </span>
            <span className="lg-sub">
              {INSTRUMENT.name} · {INSTRUMENT.isin}
            </span>
            <span className="lg-flow">
              {trade.seller.name} <em>→</em> {trade.buyer.name}
            </span>
          </div>

          <div className="pl-vs" aria-hidden>
            ∧
          </div>

          <div className="pl-leg r">
            <span className="lg-k">Payment</span>
            <span className="lg-v serif">
              {cashStr(trade.cashUnits)} {INSTRUMENT.cashSymbol}
            </span>
            <span className="lg-sub">cash · {trade.railLabel}</span>
            <span className="lg-flow">
              {trade.buyer.name} <em>→</em> {trade.seller.name}
            </span>
          </div>
        </div>

        <div className="pl-compliance">
          <div className="pc-title">Compliance pre-flight · engine.preflight()</div>
          <div className="pc-codes">
            <span className="pc-code ok">
              <i />
              BOND {trade.bondCode} · SUCCESS
            </span>
            <span className="pc-code ok">
              <i />
              CASH {trade.cashCode} · SUCCESS
            </span>
          </div>
          <div className="pc-note">
            Checked inside the settling transaction — a non-compliant leg reverts the whole trade with a
            named EIP-1066 reason (e.g. <span className="mono">0x10 · AddressNotVerified</span>).
          </div>
        </div>

        <div className="pl-proof">
          <div className="pr-row">
            <span className="k">Reconstructed</span>
            <span className="v">compliant · The Graph, in-mapping</span>
          </div>
          <div className="pr-row">
            <span className="k">Independence</span>
            <span className="v">from an index the venue does not control</span>
          </div>
          <div className="pr-row">
            <span className="k">Parties</span>
            <span className="v num">
              {shortAddr(trade.seller.addr)} · {shortAddr(trade.buyer.addr)}
            </span>
          </div>
          <div className="pr-row">
            <span className="k">Instrument</span>
            <a className="v num link" href={hashscan} target="_blank" rel="noreferrer">
              {shortAddr(HELV31)} — HashScan ↗
            </a>
          </div>
        </div>

        <footer className="pl-foot">
          <div className="pl-seal" aria-hidden>
            <span className="sl-mark">⇄</span>
            <span className="sl-cap">
              cleared
              <br />
              atomically
            </span>
          </div>
          <div className="pl-sign">
            <div className="sg-line" />
            <div className="sg-k">Clearing House · settlement authority</div>
            <div className="sg-sub serif">delivery ∧ payment — one seam, one transaction</div>
          </div>
        </footer>
      </article>

      <div className="specimen-actions">
        <button
          className="enter"
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
        >
          Print certificate <span className="arw">↗</span>
        </button>
        <Link href="/venue" className="specimen-back">
          ← back to the venue
        </Link>
        <span className="specimen-tag">Hedera ATS · The Graph · Arc — ETHOnline 2026</span>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="specimen" />}>
      <Certificate />
    </Suspense>
  );
}
