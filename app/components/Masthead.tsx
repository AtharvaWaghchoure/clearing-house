'use client';

import { blockStr, cashStr } from '@/lib/format';
import type { OnChainSettlement } from '@/lib/types';

export default function Masthead({ settlements }: { settlements: OnChainSettlement[] }) {
  const cleared = settlements.length;
  const notional = settlements.reduce((a, s) => a + Number(s.cashAmount), 0);
  const lastBlock = settlements.reduce((m, s) => (s.blockNumber > m ? s.blockNumber : m), 0n);

  return (
    <header className="masthead">
      <div className="nameplate">
        <span className="mark">C</span>
        <div>
          <h1>
            CLEARING <em>HOUSE</em>
          </h1>
          <div className="sub">delivery versus payment, atomic &amp; compliant</div>
        </div>
      </div>

      <div className="masthead-right">
        <div className="stat">
          <div className="v num">{lastBlock > 0n ? blockStr(lastBlock) : '—'}</div>
          <div className="k">Last block</div>
        </div>
        <div className="stat">
          <div className="v num">{cleared}</div>
          <div className="k">Cleared</div>
        </div>
        <div className="stat">
          <div className="v gold num">{cashStr(notional)}</div>
          <div className="k">Notional · USDC</div>
        </div>
        <div className="pulse">
          <i />
          Live · Hedera Testnet
        </div>
      </div>
    </header>
  );
}
