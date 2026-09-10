// End-to-end through the REAL API routes against a running dev server: onboard → place holds →
// submit ask+bid → settle, then confirm the SettlementReceipt on-chain. Operator is its own
// counterparty (it has HBAR for gas); this exercises the actual HTTP surface, not the lib directly.
// Usage: start `next dev -p 3737`, then run this with tsx from app/.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { atsAbi } from '../lib/abi';
import { VENUE, hederaTestnet, publicClient } from '../lib/chain';
import { fetchSettlements } from '../lib/onchain';
import type { Address, Hex } from '../lib/types';

const BASE = 'http://127.0.0.1:3737';
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

async function post(path: string, body: unknown) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

async function main() {
  const op = privateKeyToAccount(operatorKey());
  const wallet = createWalletClient({ account: op, chain: hederaTestnet, transport: http() });
  const QTY = 3n;
  const PRICE = 100;
  const CASH = QTY * BigInt(PRICE);

  console.log('1) onboard via HTTP →', (await post('/api/venue/onboard', { address: op.address })).status);

  const placeHold = async (token: Address, amount: bigint): Promise<bigint> => {
    const hold = { amount, expirationTimestamp: 0n, escrow: VENUE.holdLeg, to: ZERO, data: '0x' as Hex };
    const { result } = await publicClient.simulateContract({ account: op, address: token, abi: atsAbi, functionName: 'createHoldByPartition', args: [VENUE.partition, hold] });
    const hash = await wallet.writeContract({ account: op, chain: hederaTestnet, address: token, abi: atsAbi, functionName: 'createHoldByPartition', args: [VENUE.partition, hold] });
    await publicClient.waitForTransactionReceipt({ hash });
    return (result as readonly [boolean, bigint])[1];
  };

  const bondHold = await placeHold(VENUE.bondToken, QTY);
  const cashHold = await placeHold(VENUE.cashToken, CASH);
  console.log('2) placed holds — bond', bondHold.toString(), 'cash', cashHold.toString());

  const ask = await post('/api/venue/orders', { side: 'ask', account: op.address, price: PRICE, quantity: Number(QTY), holdId: bondHold.toString() });
  const bid = await post('/api/venue/orders', { side: 'bid', account: op.address, price: PRICE, quantity: Number(QTY), holdId: cashHold.toString() });
  const askId = (ask.json.order as { id: string }).id;
  const bidId = (bid.json.order as { id: string }).id;
  console.log('3) submitted orders — ask', askId, 'bid', bidId);

  const settled = await post('/api/venue/settle', { bidId, askId });
  console.log('4) settle via HTTP →', settled.status, JSON.stringify(settled.json));

  const tradeId = (settled.json.tradeId as string) ?? '';
  const found = (await fetchSettlements()).find((x) => x.tradeId.toLowerCase() === tradeId.toLowerCase());
  console.log('5) SettlementReceipt on-chain:', !!found);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
