'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { INSTRUMENT, deskName } from '@/lib/accounts';
import { cashStr, shortAddr, shortId } from '@/lib/format';
import { codeName } from '@/lib/eip1066';
import type { Address, Hex } from '@/lib/types';

// The archival artifact, and the one thing here meant to leave the screen. It deliberately reads in
// a different register from the terminal — a printed instrument rather than a working surface — and
// prints to paper as one (see @media print). Reads a trade from the URL as linked from the tape,
// and falls back to the canonical specimen.
const HELV31 = '0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a'; // the real HELV31 diamond on Hedera testnet
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
  seller: { name: 'Meridian Capital', addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  buyer: { name: 'Ashford Pension', addr: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  bondCode: '0x01',
  cashCode: '0x01',
  railLabel: 'Hedera hold',
};

function tradeFromParams(sp: { get(k: string): string | null }): Trade | null {
  const t = sp.get('t');
  if (!t) return null;
  const g = (k: string, fallback = '') => sp.get(k) ?? fallback;
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
    railLabel: g('r') === 'arc' ? 'Arc, USDC via Memo' : 'Hedera hold',
  };
}

function Certificate() {
  const sp = useSearchParams();
  const trade = tradeFromParams(sp) ?? SPECIMEN;
  const no = shortId(trade.tradeId as Hex);
  const bondOk = trade.bondCode === '0x01';
  const cashOk = trade.cashCode === '0x01';

  return (
    <main className="specimen">
      <article className="plate">
        <header className="plate-head">
          <div>
            <div className="issuer">Clearing House</div>
            <h1>Certificate of settlement</h1>
          </div>
          <div className="plate-no">
            <span className="k">Trade</span>
            <span className="v">{no}</span>
          </div>
        </header>

        <p className="plate-attest">
          One delivery-versus-payment trade cleared <b>atomically</b> — both legs inside a single
          transaction — with compliance verified before either leg moved.
        </p>

        <div className="plate-legs">
          <div className="plate-leg">
            <span className="k">Delivery</span>
            <span className="v">
              {trade.qty} {INSTRUMENT.bondSymbol}
            </span>
            <span className="sub">
              {INSTRUMENT.name}, {INSTRUMENT.isin}
            </span>
            <span className="flow">
              {trade.seller.name} → {trade.buyer.name}
            </span>
          </div>

          <span className="plate-and" aria-label="and">
            ∧
          </span>

          <div className="plate-leg r">
            <span className="k">Payment</span>
            <span className="v">
              {cashStr(trade.cashUnits)} {INSTRUMENT.cashSymbol}
            </span>
            <span className="sub">cash, settled over {trade.railLabel}</span>
            <span className="flow">
              {trade.buyer.name} → {trade.seller.name}
            </span>
          </div>
        </div>

        <div className="plate-pf">
          <div className="t">What the ATS said before either leg moved</div>
          <div className="codes">
            <span className="c">
              <i aria-hidden />
              Bond {trade.bondCode} {codeName(trade.bondCode)}
            </span>
            <span className="c">
              <i aria-hidden />
              Cash {trade.cashCode} {codeName(trade.cashCode)}
            </span>
          </div>
          <div className="n">
            Checked inside the settling transaction. Had either leg been refused, the whole trade
            would have reverted with a named reason — a buyer who lost verification returns{' '}
            <span className="mono">0x10 AddressNotVerified</span> and simply cannot be filled.
          </div>
        </div>

        <div className="plate-rows">
          <div className="plate-row">
            <span className="k">Independently reconstructed</span>
            <span className="v">
              {bondOk && cashOk ? 'compliant, in-mapping on The Graph' : 'see the independent check'}
            </span>
          </div>
          <div className="plate-row">
            <span className="k">Counterparties</span>
            <span className="v num">
              {shortAddr(trade.seller.addr)} · {shortAddr(trade.buyer.addr)}
            </span>
          </div>
          <div className="plate-row">
            <span className="k">Instrument</span>
            <a className="v num" href={hashscan} target="_blank" rel="noreferrer">
              {shortAddr(HELV31)}
            </a>
          </div>
        </div>

        <footer className="plate-foot">
          <div className="auth">Clearing House, settlement authority</div>
          <div className="claim">
            Delivery and payment cleared as one — neither could have moved without the other.
          </div>
        </footer>
      </article>

      <div className="specimen-act">
        <button
          className="btn"
          onClick={() => {
            if (typeof window !== 'undefined') window.print();
          }}
        >
          Print this certificate
        </button>
        <Link href="/venue" className="quiet-link">
          Back to the venue
        </Link>
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
