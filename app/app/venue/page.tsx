'use client';

import { useCallback, useEffect, useState } from 'react';
import ArcPanel from '@/components/ArcPanel';
import ConnectBar from '@/components/ConnectBar';
import Masthead from '@/components/Masthead';
import SettlementTape from '@/components/SettlementTape';
import TradeDesk from '@/components/TradeDesk';
import VerifierPanel from '@/components/VerifierPanel';
import { INSTRUMENT } from '@/lib/accounts';
import { fetchSettlements } from '@/lib/onchain';
import type { OnChainSettlement } from '@/lib/types';

export default function Page() {
  // Settlement history, read live from Hedera testnet (mirror node). Polls so new clears appear.
  const [chainSettlements, setChainSettlements] = useState<OnChainSettlement[]>([]);
  const loadSettlements = useCallback(() => {
    fetchSettlements().then(setChainSettlements).catch(() => {});
  }, []);
  useEffect(() => {
    loadSettlements();
    const t = setInterval(loadSettlements, 15000);
    return () => clearInterval(t);
  }, [loadSettlements]);

  return (
    <main className="terminal">
      <Masthead settlements={chainSettlements} />

      <ConnectBar />

      <div className="instrument">
        <div className="cell hero">
          <span className="k">Instrument</span>
          <span className="v">{INSTRUMENT.name}</span>
        </div>
        <div className="cell">
          <span className="k">ISIN</span>
          <span className="v num">{INSTRUMENT.isin}</span>
        </div>
        <div className="cell">
          <span className="k">Coupon</span>
          <span className="v num">{INSTRUMENT.coupon}</span>
        </div>
        <div className="cell">
          <span className="k">Maturity</span>
          <span className="v">{INSTRUMENT.maturity}</span>
        </div>
        <div className="cell">
          <span className="k">Standard</span>
          <span className="v">ATS · ERC-3643</span>
        </div>
        <div className="cell">
          <span className="k">Partition</span>
          <span className="v gold">{INSTRUMENT.partitionName}</span>
        </div>
      </div>

      <div className="grid">
        <div className="col">
          <TradeDesk onSettled={loadSettlements} />
        </div>
        <div className="col">
          <SettlementTape settlements={chainSettlements} />
        </div>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        <VerifierPanel />
        <ArcPanel />
      </div>

      <footer className="footer">
        <span className="seam">
          one seam · <b>ISettlementLeg</b> · delivery always an ATS Hold, payment swappable
        </span>
        <span>HEDERA ATS · THE GRAPH · ARC — built for ETHOnline 2026</span>
      </footer>
    </main>
  );
}
