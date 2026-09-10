// Proves the full on-chain settlement path on Hedera testnet: place a real bond hold + cash hold,
// then operator.settle() → SettlementReceipt. The operator is its own counterparty here (it has HBAR
// for gas); real users each place their own hold from their wallet (piece 4). Run with tsx from app/.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, http, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { atsAbi } from '../lib/abi';
import { VENUE, hederaTestnet, publicClient } from '../lib/chain';
import { balanceOf, fetchSettlements } from '../lib/onchain';
import { type Trade, mint, setVerified, settle } from '../lib/server/operator';
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
  const QTY = 5n;
  const PRICE = 100n;
  const CASH = QTY * PRICE;

  console.log('operator (self-counterparty):', op.address);
  await setVerified(VENUE.bondToken, op.address);
  await setVerified(VENUE.cashToken, op.address);
  await mint(VENUE.bondToken, op.address, QTY);
  await mint(VENUE.cashToken, op.address, CASH);
  console.log('funded — bond', (await balanceOf(VENUE.bondToken, op.address)).toString(), 'cash', (await balanceOf(VENUE.cashToken, op.address)).toString());

  const placeHold = async (token: Address, amount: bigint): Promise<bigint> => {
    const hold = { amount, expirationTimestamp: 0n, escrow: VENUE.holdLeg, to: ZERO, data: '0x' as Hex };
    const { result } = await publicClient.simulateContract({
      account: op,
      address: token,
      abi: atsAbi,
      functionName: 'createHoldByPartition',
      args: [P, hold],
    });
    const holdId = (result as readonly [boolean, bigint])[1];
    const hash = await wallet.writeContract({
      account: op,
      chain: hederaTestnet,
      address: token,
      abi: atsAbi,
      functionName: 'createHoldByPartition',
      args: [P, hold],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return holdId;
  };

  const bondHold = await placeHold(VENUE.bondToken, QTY);
  const cashHold = await placeHold(VENUE.cashToken, CASH);
  console.log('placed holds — bond', bondHold.toString(), 'cash', cashHold.toString());

  const tradeId = toHex(randomBytes(32));
  const trade: Trade = {
    bond: { token: VENUE.bondToken, from: op.address, to: op.address, amount: QTY, partition: P, holdId: bondHold, tradeId, extra: '0x' },
    cash: { token: VENUE.cashToken, from: op.address, to: op.address, amount: CASH, partition: P, holdId: cashHold, tradeId, extra: '0x' },
  };
  const tx = await settle(trade);
  console.log('settle tx:', tx);

  const settlements = await fetchSettlements();
  const found = settlements.find((s) => s.tradeId.toLowerCase() === tradeId.toLowerCase());
  console.log(`settlements now: ${settlements.length} · new receipt present: ${!!found}`);
  if (found) {
    console.log('receipt:', { tradeId: `${found.tradeId.slice(0, 12)}…`, qty: found.quantity.toString(), cash: found.cashAmount.toString(), block: found.blockNumber.toString(), tx: found.txHash });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
