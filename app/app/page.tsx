'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// The venue's front door. Same institutional language as the terminal (Instrument Serif nameplate,
// muted-brass accent, ledger ground, grain) pushed to hero scale, with the product's whole thesis —
// delivery ∧ payment in one atomic tx — as the signature visual. Enter routes to the live order book.
export default function Cover() {
  const router = useRouter();

  // Prefetch the terminal and let Enter/Space walk through the door.
  useEffect(() => {
    router.prefetch('/venue');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        router.push('/venue');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <main className="cover">
      <span className="reg tl" aria-hidden />
      <span className="reg tr" aria-hidden />
      <span className="reg bl" aria-hidden />
      <span className="reg br" aria-hidden />

      <header className="cover-top">
        <span className="ct-l">Clearing House · settlement venue</span>
        <span className="ct-r">
          <span className="pulse">
            <i />
            live on testnet
          </span>
          <span className="plate">Est. ETHOnline 2026 · Plate No. 01</span>
        </span>
      </header>

      <section className="cover-hero">
        <div className="eyebrow">Tokenised-bond delivery · versus · payment</div>

        <h1 className="cover-name">
          <span className="l1">Clearing</span>
          <span className="l2">
            <em>House</em>
          </span>
        </h1>

        <div className="cover-rule" />

        <p className="cover-thesis">
          Delivery <span className="amp">∧</span> payment settle in <b>one atomic transaction</b>.
          Compliance is checked <b>inside</b> it — and a venue-independent index proves that no
          non-compliant trade has ever cleared.
        </p>

        <div className="dvp" aria-label="Atomic delivery-versus-payment">
          <div className="leg leg-bond">
            <span className="who">Seller</span>
            <span className="track">
              <span className="what">delivers 10 HELV31 — the bond</span>
              <span className="line" />
              <span className="tip" aria-hidden />
            </span>
            <span className="who r">Buyer</span>
          </div>

          <div className="leg leg-cash">
            <span className="who">Seller</span>
            <span className="track">
              <span className="what">is paid 1,000 USDC — the cash</span>
              <span className="line" />
              <span className="tip" aria-hidden />
            </span>
            <span className="who r">Buyer</span>
          </div>

          <div className="seal" aria-hidden>
            <span className="seal-mark">⇄</span>
            <span className="seal-cap">one atomic tx</span>
          </div>
        </div>

        <div className="cover-cta">
          <Link href="/venue" className="enter">
            Enter the venue <span className="arw">→</span>
          </Link>
          <span className="entkey">
            or press <kbd>↵</kbd>
          </span>
          <Link href="/receipt" className="cover-specimen">
            specimen certificate ↗
          </Link>
        </div>
      </section>

      <footer className="cover-foot">
        <span className="sp">Hedera ATS · The Graph · Arc / Circle</span>
        <span className="mid">HELV31 4.25% 15FEB2031 · ATS / ERC-3643</span>
        <span className="seam">
          <b>one seam</b> · ISettlementLeg — delivery always a hold, payment swappable
        </span>
      </footer>
    </main>
  );
}
