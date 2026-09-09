import type { AuditReport } from './types.js';

const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;

export function formatReport(r: AuditReport): string {
  const out: string[] = [];
  out.push(`Independent audit (source: ${r.dataSource}, no venue code)`);
  out.push(`  venue claims: ${r.venueClaimsCount}   on-chain: ${r.onChainCount}   independently confirmed: ${r.confirmed}`);
  for (const f of r.findings) {
    const ok = f.severity !== 'critical';
    const tag = ok ? `ok   ${f.status}` : `FAIL ${f.status}`;
    out.push(`   ${tag}  ${short(f.tradeId)}  ${f.detail}`);
    const reasons = (f.evidence as { reasons?: string[] } | undefined)?.reasons;
    if (reasons?.length) out.push(`        ${reasons.join('; ')}`);
  }
  out.push(
    r.clean
      ? `  RESULT: the venue's report is fully backed by the chain.`
      : `  RESULT: the venue's report contradicts the chain (see FAIL).`,
  );
  return out.join('\n');
}
