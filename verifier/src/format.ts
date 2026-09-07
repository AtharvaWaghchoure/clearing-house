import type { AuditReport } from './types.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;

export function formatReport(r: AuditReport): string {
  const out: string[] = [];
  out.push(`${c.bold}Independent audit${c.reset} ${c.dim}(source: ${r.dataSource}, no venue code)${c.reset}`);
  out.push(
    `  venue claims: ${r.venueClaimsCount}   on-chain: ${r.onChainCount}   ` +
      `independently confirmed: ${c.green}${r.confirmed}${c.reset}`,
  );
  for (const f of r.findings) {
    const ok = f.severity !== 'critical';
    const tag = ok ? `${c.green}✓ ${f.status}${c.reset}` : `${c.red}✗ ${f.status}${c.reset}`;
    out.push(`   ${tag}  ${c.cyan}${short(f.tradeId)}${c.reset}  ${c.dim}${f.detail}${c.reset}`);
    const reasons = (f.evidence as { reasons?: string[] } | undefined)?.reasons;
    if (reasons?.length) out.push(`        ${c.yellow}${reasons.join('; ')}${c.reset}`);
  }
  out.push(
    r.clean
      ? `  ${c.green}${c.bold}RESULT: the venue's report is fully backed by the chain.${c.reset}`
      : `  ${c.red}${c.bold}RESULT: the venue's report contradicts the chain (see ✗).${c.reset}`,
  );
  return out.join('\n');
}
