'use client';

import { DESKS, INSTRUMENT } from '@/lib/accounts';
import { shortAddr } from '@/lib/format';
import type { VenueStore, VenueState } from '@/lib/venue';

// The issuer's identity registry, exposed as a console. Toggling a desk's KYC on the bond token emits
// an ATS `Verified` event and mines a block — which is exactly what flips a resting order's pre-flight
// from 0x01 SUCCESS to 0x10 · DISALLOWED_OR_STOP · AddressNotVerified, live, before anything is signed.
export default function KycConsole({ store, state }: { store: VenueStore; state: VenueState }) {
  return (
    <section className="panel">
      <header>
        <div className="title">
          <span className="ix">✦</span>
          <h2>Identity Registry · ATS KYC</h2>
        </div>
        <span className="hint">{INSTRUMENT.bondSymbol} · onlyCompliant</span>
      </header>

      <div className="kyc">
        {DESKS.map((d) => {
          const verified = store.isVerified(INSTRUMENT.bondToken, d.address);
          return (
            <div key={d.address} className="kyc-row">
              <span className="who">
                {d.name}
                <span className="addr num">{shortAddr(d.address)}</span>
              </span>
              <span className={`status-pill ${verified ? '' : 'off'}`}>
                {verified ? 'VERIFIED' : 'NOT VERIFIED'}
              </span>
              <button
                className={`toggle ${verified ? 'on' : ''}`}
                aria-label={`toggle KYC for ${d.name}`}
                onClick={() => store.setVerified(INSTRUMENT.bondToken, d.address, !verified)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
