'use client';

import { useCallback, useEffect, useState } from 'react';
import ArcPanel from '@/components/ArcPanel';
import SettlementTape from '@/components/SettlementTape';
import TopBar from '@/components/TopBar';
import TradeFloor from '@/components/TradeFloor';
import VerifierPanel from '@/components/VerifierPanel';
import { INSTRUMENT } from '@/lib/accounts';
import { fetchSettlements } from '@/lib/onchain';
import type { OnChainSettlement } from '@/lib/types';

export default function Page() {
  // Settlement history, read live from Hedera testnet. Polled so new clears appear on their own.
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
    <main className="app">
      <TopBar />

      <div className="rail">
        <div className="rail-cell lead">
          <span className="k">Instrument</span>
          <span className="v">{INSTRUMENT.name}</span>
        </div>
        <div className="rail-cell">
          <span className="k">ISIN</span>
          <span className="v num">{INSTRUMENT.isin}</span>
        </div>
        <div className="rail-cell">
          <span className="k">Coupon</span>
          <span className="v num">{INSTRUMENT.coupon}</span>
        </div>
        <div className="rail-cell">
          <span className="k">Maturity</span>
          <span className="v">{INSTRUMENT.maturity}</span>
        </div>
        <div className="rail-cell">
          <span className="k">Tranche</span>
          <span className="v">Senior</span>
        </div>
        <div className="rail-cell">
          <span className="k">Standard</span>
          <span className="v">ATS (ERC-3643)</span>
        </div>
      </div>

      <TradeFloor onSettled={loadSettlements} />

      <div className="band">
        <SettlementTape settlements={chainSettlements} />
      </div>

      <div className="deck">
        <VerifierPanel />
        <ArcPanel />
      </div>

      <footer className="foot">
        <span>
          One seam — <b>ISettlementLeg</b>. Delivery is always an ATS hold; the cash rail is
          swappable.
        </span>
        <span>Hedera ATS · The Graph · Arc</span>
      </footer>
    </main>
  );
}
