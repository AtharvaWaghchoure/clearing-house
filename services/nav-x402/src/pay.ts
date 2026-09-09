// An agent that pays for the NAV. Uses @x402/fetch + @x402/hedera to auto-handle the 402: it reads
// the payment terms, builds a partially-signed Hedera transfer (operator → payTo), and lets the
// Blocky402 facilitator add the fee-payer signature and settle. Then it prints the NAV it bought and
// the on-chain settlement tx.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme, createClientHederaSigner, PrivateKey } from '@x402/hedera';
import { decodePaymentResponseHeader } from '@x402/core/http';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../');

function loadEnv() {
  const p = `${ROOT}/.env`;
  if (!existsSync(p)) throw new Error(`no .env at ${p}`);
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

async function main() {
  loadEnv();
  const OP_ID = process.env.HEDERA_OPERATOR_ID;
  const OP_KEY = process.env.HEDERA_OPERATOR_KEY;
  const url = process.env.NAV_URL ?? 'http://localhost:4021/nav';
  if (!OP_ID || !OP_KEY) throw new Error('HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY missing in .env');

  const privateKey = PrivateKey.fromStringECDSA(OP_KEY.replace(/^0x/, ''));
  const signer = createClientHederaSigner(OP_ID, privateKey, { network: 'hedera:testnet' });
  const client = new x402Client().register('hedera:testnet', new ExactHederaScheme(signer));
  // Allow paying in HBAR (0.0.0) — it isn't in the client's default-asset table, so opt in explicitly.
  client.setSpendControls({ allowedAssets: true });
  const payFetch = wrapFetchWithPayment(fetch, client);

  console.log(`\n  paying ${url} as ${OP_ID} …`);
  const res = await payFetch(url);
  const body = await res.json();

  if (!res.ok) {
    console.error(`  ✗ ${res.status}:`, body);
    process.exit(1);
  }

  console.log(`\n  ✓ NAV purchased (HTTP ${res.status}):`);
  console.log(JSON.stringify(body, null, 2));

  const settleHeader = res.headers.get('X-PAYMENT-RESPONSE');
  if (settleHeader) {
    const settle = decodePaymentResponseHeader(settleHeader);
    console.log(`\n  settlement on Hedera: tx ${settle.transaction}`);
    console.log(`  https://hashscan.io/testnet/transaction/${settle.transaction}\n`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
