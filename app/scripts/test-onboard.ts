// Proves the operator backend really onboards a fresh wallet on Hedera testnet: generate a brand-new
// address, verify + fund it via the operator, then read chain state back to confirm. Costs operator
// gas (4 txs). Run with tsx from app/.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { VENUE } from '../lib/chain';
import { balanceOf, bondEligibility } from '../lib/onchain';
import { mint, operatorAddress, setVerified } from '../lib/server/operator';

async function main() {
  console.log('operator:', operatorAddress());
  const who = privateKeyToAccount(generatePrivateKey()).address;
  console.log('fresh address:', who);
  console.log('before:', JSON.stringify(await bondEligibility(who)));

  console.log('verify bond →', await setVerified(VENUE.bondToken, who));
  console.log('verify cash →', await setVerified(VENUE.cashToken, who));
  console.log('mint bond   →', await mint(VENUE.bondToken, who, 1000n));
  console.log('mint cash   →', await mint(VENUE.cashToken, who, 100_000n));

  console.log('after:', {
    bond: (await balanceOf(VENUE.bondToken, who)).toString(),
    cash: (await balanceOf(VENUE.cashToken, who)).toString(),
    elig: await bondEligibility(who),
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
