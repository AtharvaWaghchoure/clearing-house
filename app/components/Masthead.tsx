'use client';

import { cashStr, blockStr } from '@/lib/format';
import type { VenueState } from '@/lib/venue';

export default function Masthead({ state }: { state: VenueState }) {
  const cleared = state.settlements.length;
  const notional = state.settlements.reduce((a, s) => a + Number(s.cashAmount), 0);

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
          <div className="v num">{blockStr(state.block)}</div>
          <div className="k">Block</div>
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
          Local · Anvil
        </div>
      </div>
    </header>
  );
}
