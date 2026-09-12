'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { INSTRUMENT } from '@/lib/accounts';
import { blockStr, cashStr } from '@/lib/format';
import { fetchSettlements } from '@/lib/onchain';
import type { OnChainSettlement } from '@/lib/types';

// The front door, laid out on the same centre rule as the trading floor so both pages read as one
// idea. Left: what the venue claims. Right: the mechanism behind the claim, and the venue's live
// record of having done it. The two legs draw once on load — the only motion here — and then
// nothing moves again unless you do something.
export default function Cover() {
  const router = useRouter();
  const [settled, setSettled] = useState<OnChainSettlement[]>([]);

  useEffect(() => {
    router.prefetch('/venue');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        router.push('/venue');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  useEffect(() => {
    fetchSettlements().then(setSettled).catch(() => {});
  }, []);

  const lastBlock = settled.reduce((m, s) => (s.blockNumber > m ? s.blockNumber : m), 0n);
  const notional = settled.reduce((a, s) => a + Number(s.cashAmount), 0);

  return (
    <main className="cover">
      <header className="cover-top">
        <span className="brand-name">Clearing House</span>
        <span className="live">
          <i aria-hidden />
          Live on Hedera testnet
        </span>
      </header>

      <section className="cover-mid">
        <div className="cover-lead">
          <h1>
            Both legs
            <span className="two">or neither</span>
          </h1>

          <p className="cover-say">
            A settlement venue for tokenised bonds. The bond and the cash move in{' '}
            <b>one transaction</b>, compliance is checked <b>inside</b> it, and what cleared can be
            proved from an index the venue doesn’t control.
          </p>

          <div className="cover-act">
            <Link href="/venue" className="btn btn-primary">
              Enter the venue
            </Link>
            <span className="keyhint">
              or press <kbd>↵</kbd>
            </span>
            <Link href="/receipt" className="quiet-link">
              See a settlement certificate
            </Link>
          </div>
        </div>

        <div className="cover-aside">
          <div className="mech">
            <div className="mech-leg">
              <span className="end">Seller</span>
              <span className="mech-track">
                <span className="what">10 {INSTRUMENT.bondSymbol}</span>
                <span className="wire" aria-hidden />
              </span>
              <span className="end r">Buyer</span>
            </div>

            <div className="mech-leg">
              <span className="end">Buyer</span>
              <span className="mech-track">
                <span className="what">1,000 {INSTRUMENT.cashSymbol}</span>
                <span className="wire" aria-hidden />
              </span>
              <span className="end r">Seller</span>
            </div>

            <div className="mech-bind">
              <span className="rule" aria-hidden />
              <span className="say">settled together, or not at all</span>
              <span className="rule" aria-hidden />
            </div>
          </div>

          <div className="state">
            <div className="state-row">
              <span>Trades cleared</span>
              <span className="v">{settled.length || '—'}</span>
            </div>
            <div className="state-row">
              <span>Value settled</span>
              <span className="v">
                {notional ? `${cashStr(notional)} ${INSTRUMENT.cashSymbol}` : '—'}
              </span>
            </div>
            <div className="state-row">
              <span>Last cleared at block</span>
              <span className="v">{lastBlock > 0n ? blockStr(lastBlock) : '—'}</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="cover-foot">
        <span>
          {INSTRUMENT.bondSymbol} · {INSTRUMENT.coupon} · {INSTRUMENT.maturity} · issued on Hedera
          ATS
        </span>
        <span>Hedera · The Graph · Arc</span>
      </footer>
    </main>
  );
}
