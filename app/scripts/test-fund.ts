// Does a plain EVM value transfer from the operator fund (and lazy-create) a fresh Hedera account?
// If yes, HBAR onboarding is a one-liner in the onboard route; if not, we need the Hedera SDK.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, formatEther, http, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hederaTestnet, publicClient } from '../lib/chain';
import type { Hex } from '../lib/types';

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
  const fresh = privateKeyToAccount(generatePrivateKey()).address;

  console.log('operator HBAR:', formatEther(await publicClient.getBalance({ address: op.address })));
  console.log('fresh address:', fresh);
  console.log('fresh HBAR before:', formatEther(await publicClient.getBalance({ address: fresh })));

  const hash = await wallet.sendTransaction({ account: op, chain: hederaTestnet, to: fresh, value: parseEther('3') });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('funded tx:', hash);
  console.log('fresh HBAR after:', formatEther(await publicClient.getBalance({ address: fresh })));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
