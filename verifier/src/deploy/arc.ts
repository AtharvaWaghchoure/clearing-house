// Deploy the swappable payment rail (ArcMemoLeg) to Arc testnet and settle a USDC payment through
// Arc's Memo contract — proving the property no other chain reproduces: one call emits an ERC-20
// `Transfer` whose `from` is the PAYER's own address AND an indexed `Memo(memoId = tradeId)`, so a
// settlement is reconcilable from public logs alone (protocol-level sender delegation via CallFrom).
//
// Arc uses USDC as the native gas token — fund the operator at https://faucet.circle.com (Arc Testnet)
// before running. Same ISettlementLeg the Hedera venue uses; here `setEngine(operator)` lets the
// operator drive the cash leg directly for the demo.
//
// Run:  pnpm --filter @clearing-house/verifier exec tsx src/deploy/arc.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Abi,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbi,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact } from '../abi.js';
import type { Address, Hex } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../');
const LOCAL = resolve(here, '../../.local');

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
});

const AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
const RECIPIENT = '0xA32A62d33f10F8A4277e630481eC43b8067a7e9E' as Address; // the seller's receivable (a fresh account we control; anvil addresses are USDC-blocklisted on Arc)
const TRADE_ID = `0x${(0xa2c).toString(16).padStart(64, '0')}` as Hex; // 0x…0a2c

const usdcAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);
const memoAbi = parseAbi(['function memo(address target, bytes data, bytes32 memoId, bytes memoData)']);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function loadEnv() {
  for (const line of readFileSync(`${ROOT}/.env`, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const tx = (h: string) => `https://testnet.arcscan.app/tx/${h}`;
const addr = (a: string) => `https://testnet.arcscan.app/address/${a}`;

async function main() {
  loadEnv();
  const RPC = process.env.ARC_TESTNET_RPC || 'https://rpc.testnet.arc.network';
  const OP_KEY = process.env.HEDERA_OPERATOR_KEY as Hex; // same ECDSA key; a plain EVM account on Arc
  const USDC = (process.env.ARC_USDC ?? '0x3600000000000000000000000000000000000000') as Address;
  const MEMO = (process.env.ARC_MEMO ?? '0x5294E9927c3306DcBaDb03fe70b92e01cCede505') as Address;
  if (!/^0x[0-9a-fA-F]{64}$/.test(OP_KEY ?? '')) throw new Error('HEDERA_OPERATOR_KEY missing/invalid');

  const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
  const operator = privateKeyToAccount(OP_KEY);
  const wallet = createWalletClient({ account: operator, chain: arcTestnet, transport: http(RPC) });

  console.log(bold('\n▍ CLEARING HOUSE — Arc testnet (USDC settlement via Memo)\n'));
  console.log(`  operator/payer ${operator.address}`);
  const bal = (await pub.readContract({ address: USDC, abi: usdcAbi, functionName: 'balanceOf', args: [operator.address] })) as bigint;
  console.log(`  USDC balance   ${formatUnits(bal, 6)} USDC`);
  if (bal < AMOUNT) {
    throw new Error(`operator has < ${formatUnits(AMOUNT, 6)} USDC. Fund ${operator.address} at https://faucet.circle.com (Arc Testnet), then re-run.`);
  }

  const ArcLeg = loadArtifact('ArcMemoLeg');
  const wait = { timeout: 90_000, pollingInterval: 1_500 } as const;
  const send = async (address: Address, abi: readonly unknown[], fn: string, args: unknown[]) => {
    const hash = await wallet.writeContract({ address, abi: abi as Abi, functionName: fn, args });
    const rc = await pub.waitForTransactionReceipt({ hash, ...wait });
    if (rc.status !== 'success') throw new Error(`${fn} reverted (${tx(hash)})`);
    return { hash, rc };
  };

  // 1) deploy the leg + wire the operator as the driver
  console.log(bold('\n▸ deploy ArcMemoLeg'));
  const deployHash = await wallet.deployContract({ abi: ArcLeg.abi as Abi, bytecode: ArcLeg.bytecode, args: [operator.address, MEMO, USDC] });
  const dep = await pub.waitForTransactionReceipt({ hash: deployHash, ...wait });
  const leg = dep.contractAddress as Address;
  console.log(`  leg ${green(leg)}  ${dim(addr(leg))}  ${dim('(venue reference integration)')}`);

  // Arc's Memo routes through the CallFrom precompile, which only lets an EOA spoof ITSELF
  // (the effective sender must == tx.origin) — a contract cannot wrap it. So on Arc the PAYER settles
  // by calling Memo directly. We self-approve so the exact `transferFrom(payer, seller, amount)` the
  // ArcMemoLeg encodes runs with the payer as spender, keeping `Transfer.from == payer`.
  console.log(bold('\n▸ settle · payer → Memo(USDC.transferFrom, tradeId)'));
  await send(USDC, usdcAbi, 'approve', [operator.address, AMOUNT]); // self-approve for the wrapped transferFrom
  const meta = toHex('CLEARING HOUSE · HELV31 · cash leg');
  const transferData = encodeFunctionData({ abi: usdcAbi, functionName: 'transferFrom', args: [operator.address, RECIPIENT, AMOUNT] });
  const { hash, rc } = await send(MEMO, memoAbi, 'memo', [USDC, transferData, TRADE_ID, meta]);

  // 4) prove the property from the receipt: Transfer.from == payer, and an indexed Memo(tradeId)
  let transferFrom: string | undefined;
  let memoId: string | undefined;
  for (const log of rc.logs) {
    if (log.address.toLowerCase() === USDC.toLowerCase() && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC) {
      transferFrom = `0x${log.topics[1]!.slice(26)}`;
    }
    // Memo(sender, target, callDataHash, memoId, memo, memoIndex) — memoId is the indexed topic[3]
    if (log.address.toLowerCase() === MEMO.toLowerCase() && log.topics.length >= 4) {
      memoId = log.topics[3];
    }
  }

  const ok = transferFrom?.toLowerCase() === operator.address.toLowerCase() && memoId?.toLowerCase() === TRADE_ID.toLowerCase();
  console.log(`  settle tx ${green(hash)}`);
  console.log(`  Transfer.from = ${transferFrom} ${transferFrom?.toLowerCase() === operator.address.toLowerCase() ? green('(= payer EOA ✓)') : ''}`);
  console.log(`  Memo.memoId   = ${memoId} ${memoId?.toLowerCase() === TRADE_ID.toLowerCase() ? green('(= tradeId ✓)') : ''}`);

  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(`${LOCAL}/arc.json`, JSON.stringify({ network: 'arc-testnet', chainId: 5042002, leg, usdc: USDC, memo: MEMO, payer: operator.address, recipient: RECIPIENT, tradeId: TRADE_ID, settleTx: hash }, null, 2));

  console.log(ok ? green(bold('\n▍ USDC settled on Arc with provable reconciliation ✓')) : '\n▍ settled (verify logs)');
  console.log(`  ${tx(hash)}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
