// Proves the independent verifier reconstructs the REAL on-chain settlements from Hedera public logs.
import { fetchComplianceEvents, fetchSettlements } from '../lib/onchain';
import { audit } from '../lib/verify';

async function main() {
  const [settlements, events] = await Promise.all([fetchSettlements(), fetchComplianceEvents()]);
  const claims = settlements.map((s) => ({
    tradeId: s.tradeId,
    bondToken: s.bondToken,
    seller: s.seller,
    buyer: s.buyer,
    quantity: s.quantity.toString(),
    cashToken: s.cashToken,
    cashAmount: s.cashAmount.toString(),
    compliant: true,
  }));

  const honest = audit(settlements, events, claims);
  console.log(`honest report → clean=${honest.clean} · ${honest.onChainCount} on-chain · ${honest.confirmed} confirmed`);
  for (const f of honest.findings) console.log(`  ${f.status}  ${f.tradeId.slice(0, 10)}…`);

  // inject a fabricated claim → must be caught
  const lied = audit(settlements, events, [
    ...claims,
    { tradeId: `0x${'0'.repeat(61)}19d`, bondToken: claims[0]?.bondToken ?? '0x', seller: '0x000000000000000000000000000000000000dEaD', buyer: '0x000000000000000000000000000000000000dEaD', quantity: '1', cashToken: claims[0]?.cashToken ?? '0x', cashAmount: '1', compliant: true },
  ]);
  console.log(`\nwith a fabricated claim → clean=${lied.clean} (expect false)`);
  for (const f of lied.findings.filter((x) => x.severity === 'critical')) console.log(`  CAUGHT: ${f.status} ${f.tradeId.slice(0, 10)}…`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
