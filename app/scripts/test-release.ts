// Proves hold release (order cancel) on the live tokens: mint → place hold (free balance locks) →
// release (free balance returns). Run with tsx from app/.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { atsAbi } from '../lib/abi';
import { VENUE, hederaTestnet, publicClient } from '../lib/chain';
import { balanceOf } from '../lib/onchain';
import { mint, setVerified } from '../lib/server/operator';
import type { Address, Hex } from '../lib/types';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

function operatorKey(): Hex {
  for (const line of readFileSync(resolve(process.cwd(), '../.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('HEDERA_OPERATOR_KEY')) {
      const k = t.slice(t.indexOf('=') + 1).trim();
      return (k.startsWith('0x') ? k : `0x${k}`) as Hex;
    }
  }
  throw new Error('no HEDERA_OPERATOR_KEY');
}

async function main() {
  const op = privateKeyToAccount(operatorKey());
  const wallet = createWalletClient({ account: op, chain: hederaTestnet, transport: http() });
  const P = VENUE.partition;
  const QTY = 7n;
  const free = () => balanceOf(VENUE.bondToken, op.address);

  await setVerified(VENUE.bondToken, op.address);
  await mint(VENUE.bondToken, op.address, QTY);
  console.log('free before hold:', (await free()).toString());

  const hold = { amount: QTY, expirationTimestamp: 0n, escrow: VENUE.holdLeg, to: ZERO, data: '0x' as Hex };
  const { result } = await publicClient.simulateContract({ account: op, address: VENUE.bondToken, abi: atsAbi, functionName: 'createHoldByPartition', args: [P, hold] });
  const holdId = (result as readonly [boolean, bigint])[1];
  const h1 = await wallet.writeContract({ account: op, chain: hederaTestnet, address: VENUE.bondToken, abi: atsAbi, functionName: 'createHoldByPartition', args: [P, hold] });
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  console.log(`placed hold ${holdId} · free after hold: ${await free()}  (should be 0)`);

  const h2 = await wallet.writeContract({ account: op, chain: hederaTestnet, address: VENUE.bondToken, abi: atsAbi, functionName: 'releaseHoldByPartition', args: [P, holdId] });
  await publicClient.waitForTransactionReceipt({ hash: h2 });
  console.log(`released hold · free after release: ${await free()}  (should be ${QTY})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
