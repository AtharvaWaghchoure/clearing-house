// The venue's self-reporting API — the endpoint that returns what the venue says cleared, and thus
// the place a lie can enter. The frontend verifier panel calls this, independently reconstructs the
// truth from public chain facts, and reconciles the two: a fabricated, hidden, or misreported trade
// gets caught.

import { NextResponse } from 'next/server';
import type { Address, Hex, VenueClaim } from '@/lib/types';

type Lie =
  | { kind: 'none' }
  | { kind: 'fabricate'; tradeId: Hex; buyer?: Address }
  | { kind: 'hide'; tradeId: Hex }
  | { kind: 'misreport'; tradeId: Hex; newBuyer: Address };

/** Port of verifier/src/venue.ts withLie — the venue's report authority applies the lie server-side. */
function applyLie(base: VenueClaim[], lie: Lie): VenueClaim[] {
  const claims = base.map((c) => ({ ...c }));
  switch (lie.kind) {
    case 'fabricate': {
      const template = claims[0];
      if (!template) return claims;
      claims.push({ ...template, tradeId: lie.tradeId, buyer: lie.buyer ?? template.buyer, compliant: true });
      return claims;
    }
    case 'hide':
      return claims.filter((c) => c.tradeId.toLowerCase() !== lie.tradeId.toLowerCase());
    case 'misreport':
      return claims.map((c) =>
        c.tradeId.toLowerCase() === lie.tradeId.toLowerCase() ? { ...c, buyer: lie.newBuyer } : c,
      );
    default:
      return claims;
  }
}

export async function POST(req: Request) {
  let body: { claims?: VenueClaim[]; lie?: Lie };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const claims = Array.isArray(body.claims) ? body.claims : [];
  const lie: Lie = body.lie ?? { kind: 'none' };
  const report = applyLie(claims, lie);

  return NextResponse.json({
    venue: 'CLEARING HOUSE · self-reported ledger',
    asOf: report.length,
    honest: lie.kind === 'none',
    report,
  });
}

export async function GET() {
  return NextResponse.json({ venue: 'CLEARING HOUSE reporting API', status: 'up' });
}
