'use client';

// Real wallet connection + the connected account's live position on Hedera testnet. Everything here
// is read straight from chain: partitioned bond/cash balances and ATS transfer-eligibility (KYC).

import { useCallback, useEffect, useState } from 'react';
import { INSTRUMENT } from '@/lib/accounts';
import { VENUE, scan } from '@/lib/chain';
import { cashStr, qtyStr, shortAddr } from '@/lib/format';
import { balanceOf, bondEligibility } from '@/lib/onchain';
import type { Address } from '@/lib/types';
import { useWallet } from '@/lib/wallet';

interface Position {
  bond: bigint;
  cash: bigint;
  kyc: { ok: boolean; reason: string };
}

export default function ConnectBar() {
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
      setPos({ bond, cash, kyc: { ok: kyc.ok, reason: kyc.reason } });
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

  // --- not connected ---
  if (!w.address) {
    return (
      <div className="connectbar">
        <span className="cb-lead">Connect a wallet to trade on Hedera testnet</span>
        <button className="cb-connect" onClick={() => void w.connect()} disabled={w.connecting}>
          {w.connecting ? 'Connecting…' : w.hasProvider ? 'Connect wallet' : 'Install MetaMask'}
          <span className="arw"> →</span>
        </button>
      </div>
    );
  }

  // --- connected, wrong network ---
  if (!w.onRightChain) {
    return (
      <div className="connectbar warn">
        <span className="cb-lead">Wrong network — the venue lives on Hedera Testnet (296)</span>
        <button className="cb-connect" onClick={() => void w.switchChain()}>
          Switch network<span className="arw"> →</span>
        </button>
      </div>
    );
  }

  // --- connected ---
  return (
    <div className="connectbar on">
      <span className="cb-acct">
        <span className="cb-dot" aria-hidden />
        <a href={scan.address(w.address)} target="_blank" rel="noreferrer" className="cb-addr" title="View on HashScan">
          {shortAddr(w.address)} ↗
        </a>
      </span>

      <span className="cb-pos">
        <span className="cb-k">Bond</span>
        <span className="cb-v num">
          {loading && !pos ? '—' : qtyStr(pos?.bond ?? 0n)} {INSTRUMENT.bondSymbol}
        </span>
      </span>
      <span className="cb-pos">
        <span className="cb-k">Cash</span>
        <span className="cb-v num">
          {loading && !pos ? '—' : cashStr(pos?.cash ?? 0n)} {INSTRUMENT.cashSymbol}
        </span>
      </span>

      <span className={`cb-kyc ${pos?.kyc.ok ? 'ok' : 'no'}`}>
        {pos?.kyc.ok ? 'KYC ✓ can receive bond' : `not verified · ${pos?.kyc.reason ?? '—'}`}
      </span>

      <button className="cb-refresh" onClick={() => w.address && void load(w.address)} disabled={loading} title="Refresh position">
        {loading ? '···' : '↻'}
      </button>
    </div>
  );
}
