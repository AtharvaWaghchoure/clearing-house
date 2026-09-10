// Gating check for the operator backend: does the .env operator key actually control the deployed
// venue (engine.operator())? Prints only the DERIVED ADDRESS — never the private key.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { engineAbi } from '../lib/abi';
import { VENUE, publicClient } from '../lib/chain';

function envVal(key: string): string | undefined {
  const txt = readFileSync(resolve(process.cwd(), '../.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return undefined;
}

async function main() {
  let key = envVal('HEDERA_OPERATOR_KEY');
  const id = envVal('HEDERA_OPERATOR_ID');
  console.log('HEDERA_OPERATOR_ID:', id ?? '(missing)');
  if (!key) throw new Error('no HEDERA_OPERATOR_KEY in .env');
  console.log('key format: length', key.length, '· 0x-prefixed', key.startsWith('0x'));
  if (!key.startsWith('0x')) key = `0x${key}`;

  let derived = '(underivable as raw 32-byte key)';
  try {
    derived = privateKeyToAccount(key as `0x${string}`).address;
  } catch (e) {
    console.log('note:', (e as Error).message);
  }

  const onchain = (await publicClient.readContract({
    address: VENUE.engine,
    abi: engineAbi,
    functionName: 'operator',
  })) as string;

  console.log('engine.operator() :', onchain);
  console.log('derived operator  :', derived);
  console.log('MATCH             :', derived.toLowerCase() === onchain.toLowerCase());
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
