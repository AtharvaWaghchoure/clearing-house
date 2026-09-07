// A model of the venue's SELF-REPORTED ledger — the thing the verifier tries to falsify. In the
// demo, the venue's honest report is derived from the chain; flipping a "lie" reproduces the classic
// failure the venue asks institutions to just trust: a report that doesn't match settlement reality.

import type { Address, Hex, OnChainSettlement, VenueClaim } from './types.js';

/** The venue's honest report: exactly what settled on-chain, all asserted compliant. */
export function honestClaims(settlements: OnChainSettlement[]): VenueClaim[] {
  return settlements.map((s) => ({
    tradeId: s.tradeId,
    bondToken: s.bondToken,
    seller: s.seller,
    buyer: s.buyer,
    quantity: s.quantity.toString(),
    cashToken: s.cashToken,
    cashAmount: s.cashAmount.toString(),
    compliant: true,
  }));
}

export type Lie =
  | { kind: 'fabricate'; tradeId: Hex; buyer?: Address } // report a settlement that never happened
  | { kind: 'hide'; tradeId: Hex } // omit a real settlement
  | { kind: 'misreport'; tradeId: Hex; newBuyer: Address }; // rewrite a counterparty

/** Return a copy of the venue's report with one lie injected. */
export function withLie(base: VenueClaim[], lie: Lie): VenueClaim[] {
  const claims = base.map((c) => ({ ...c }));
  switch (lie.kind) {
    case 'fabricate': {
      const template = claims[0];
      if (!template) throw new Error('need at least one real claim to model a fabrication');
      claims.push({ ...template, tradeId: lie.tradeId, buyer: lie.buyer ?? template.buyer, compliant: true });
      return claims;
    }
    case 'hide':
      return claims.filter((c) => c.tradeId.toLowerCase() !== lie.tradeId.toLowerCase());
    case 'misreport':
      return claims.map((c) =>
        c.tradeId.toLowerCase() === lie.tradeId.toLowerCase() ? { ...c, buyer: lie.newBuyer } : c,
      );
  }
}
