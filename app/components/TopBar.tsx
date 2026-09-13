'use client';

// Identity, network state and your own position in a single bar. These used to be three stacked
// strips (masthead / connect bar / stat row) that between them ate a third of the fold while
// repeating the same two facts. Everything here is read live from Hedera testnet.

import { useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { INSTRUMENT } from '@/lib/accounts';
import { VENUE, scan } from '@/lib/chain';
import { cashStr, qtyStr, shortAddr } from '@/lib/format';
import { balanceOf, bondEligibility } from '@/lib/onchain';
import type { Address } from '@/lib/types';
import { useWallet } from '@/lib/wallet';

interface Position {
  bond: bigint;
  cash: bigint;
  verified: boolean;
}

export default function TopBar() {
  const w = useWallet();
  const [pos, setPos] = useState<Position>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (addr: Address) => {
    setLoading(true);
    try {
      const [bond, cash, kyc] = await Promise.all([
        balanceOf(VENUE.bondToken, addr),
        balanceOf(VENUE.cashToken, addr),
        bondEligibility(addr),
      ]);
      setPos({ bond, cash, verified: kyc.ok });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!w.address || !w.onRightChain) {
      setPos(undefined);
      return;
    }
    void load(w.address);
  }, [w.address, w.onRightChain, load]);

  // Re-read after a trade, cancel or onboard anywhere else on the floor.
  useEffect(() => {
    const onRefresh = () => {
      if (w.address && w.onRightChain) void load(w.address);
    };
    window.addEventListener('venue:refresh', onRefresh);
    return () => window.removeEventListener('venue:refresh', onRefresh);
  }, [w.address, w.onRightChain, load]);

  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark className="brand-mark" />
        <span className="brand-name">Clearing House</span>
        <span className="brand-what">delivery versus payment, settled atomically</span>
      </div>

      <span className="topbar-spacer" />

      <span className="live">
        <i aria-hidden />
        Live on Hedera testnet
      </span>

      <div className="wallet">
        {!w.address ? (
          // With no wallet installed there is nothing to connect to, and the floor below already
          // says so — a second dead button here would just be noise.
          w.hasProvider ? (
            <button className="btn" onClick={() => void w.connect()} disabled={w.connecting}>
              {w.connecting ? 'Connecting' : 'Connect wallet'}
            </button>
          ) : null
        ) : !w.onRightChain ? (
          <button className="btn" onClick={() => void w.switchChain()}>
            Switch to Hedera testnet
          </button>
        ) : (
          <>
            <span className="wallet-pos">
              <span className="k">Bond</span>
              <span className="v num">
                {loading && !pos ? '—' : qtyStr(pos?.bond ?? 0n)} {INSTRUMENT.bondSymbol}
              </span>
            </span>
            <span className="wallet-pos">
              <span className="k">Cash</span>
              <span className="v num">
                {loading && !pos ? '—' : cashStr(pos?.cash ?? 0n)} {INSTRUMENT.cashSymbol}
              </span>
            </span>
            <a
              className="wallet-addr"
              href={scan.address(w.address)}
              target="_blank"
              rel="noreferrer"
              title="View this account on HashScan"
            >
              <i aria-hidden />
              {shortAddr(w.address)}
            </a>
          </>
        )}
      </div>
    </header>
  );
}
