// Throwaway harness: proves lib/onchain.ts reads the REAL Hedera-testnet venue. Run with tsx.
import { VENUE } from '../lib/chain';
import { balanceOf, bondEligibility, fetchComplianceEvents, fetchSettlements } from '../lib/onchain';

async function main() {
  const s = await fetchSettlements();
  console.log(`\nsettlements: ${s.length}`);
  for (const x of s) {
    console.log(
      `  ${x.tradeId.slice(0, 10)}…  ${x.seller.slice(0, 8)} → ${x.buyer.slice(0, 8)}  qty ${x.quantity}  cash ${x.cashAmount}  blk ${x.blockNumber}  tx ${x.txHash.slice(0, 12)}…  codes ${x.bondCode}/${x.cashCode}`,
    );
  }

  const ce = await fetchComplianceEvents();
  console.log(`\ncompliance events: ${ce.length}`);
  for (const e of ce.slice(0, 8)) {
    console.log(`  ${e.kind} ${e.account.slice(0, 8)} = ${e.status}  (token ${e.token.slice(0, 8)}, blk ${e.blockNumber})`);
  }

  if (s.length) {
    const seller = s[0].seller;
    const buyer = s[0].buyer;
    console.log(`\npoint reads on seller ${seller.slice(0, 8)}:`);
    console.log(`  bond balance   ${await balanceOf(VENUE.bondToken, seller)}`);
    console.log(`  cash balance   ${await balanceOf(VENUE.cashToken, buyer)} (buyer)`);
    console.log(`  bond eligible  ${JSON.stringify(await bondEligibility(seller))}`);
    console.log(`  random addr    ${JSON.stringify(await bondEligibility('0x000000000000000000000000000000000000dEaD'))}`);
  }
  console.log('\nok');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
