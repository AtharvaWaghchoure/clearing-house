// THE CAPSTONE: settle the REAL ATS-issued bond through the venue.
//
// The venue's HederaHoldLeg + MatchingEngine were written against the ATS hold/compliance interface
// (canTransferByPartition, createHoldByPartition, executeHoldByPartition, Hold/HoldIdentifier) — the
// real ATS diamond exposes those with the SAME signatures, so the same engine + leg clear a bond
// minted through Factory 0.0.9213391. Delivery is a REAL ATS hold.
//
// On the real bond: grant issuer/kyc/ssi roles → register the SSI issuer → grantKyc(seller,buyer) →
// issue to seller → seller places a hold with escrow = our leg. Cash leg is a deposit token. Then
// engine.settle pre-flights (compliance) and executes both holds atomically, emitting SettlementReceipt.
//
// Run:  pnpm --filter @clearing-house/verifier exec tsx src/deploy/ats-settle.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Abi, createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hederaTestnet } from 'viem/chains';
import { loadArtifact } from '../abi.js';
import { codeName, reasonName } from '../codes.js';
import type { Address, Hex } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../');
const LOCAL = resolve(here, '../../.local');

const P = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ROLE_ISSUER = '0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f' as Hex;
const ROLE_KYC = '0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc' as Hex;
const ROLE_SSI_MANAGER = '0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1' as Hex;
const QTY = 10n;
const CASH = 1000n;
const TRADE_ID = `0x${(0xa75).toString(16).padStart(64, '0')}` as Hex; // 0x…0a75

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const txUrl = (h: string) => `https://hashscan.io/testnet/transaction/${h}`;
const ctUrl = (a: string) => `https://hashscan.io/testnet/contract/${a}`;

function loadEnv() {
  for (const line of readFileSync(`${ROOT}/.env`, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !(t.slice(0, eq).trim() in process.env)) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}
const readJson = (p: string) => {
  if (!existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};

const bondAbi = parseAbi([
  'function grantRole(bytes32 role, address account) returns (bool)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function addIssuer(address issuer) returns (bool)',
  'function isIssuer(address issuer) view returns (bool)',
  'function grantKyc(address account, string vcId, uint256 validFrom, uint256 validTo, address issuer) returns (bool)',
  'function getKycStatusFor(address account) view returns (uint8)',
  'function issue(address tokenHolder, uint256 value, bytes data)',
  'function createHoldByPartition(bytes32 partition, (uint256 amount, uint256 expirationTimestamp, address escrow, address to, bytes data) hold) returns (bool, uint256)',
  'function canTransferByPartition(address from, address to, bytes32 partition, uint256 value, bytes data, bytes operatorData) view returns (bool, bytes1, bytes32)',
  'function balanceOfByPartition(bytes32 partition, address account) view returns (uint256)',
]);

async function main() {
  loadEnv();
  const RPC = process.env.HEDERA_RPC ?? 'https://testnet.hashio.io/api';
  const OP_KEY = process.env.HEDERA_OPERATOR_KEY as Hex;
  const bondJson = readJson(`${LOCAL}/ats-bond.json`);
  const accts = readJson(`${LOCAL}/hedera-accounts.json`);
  const bond = bondJson.bond as Address;

  const pub = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });
  const operator = privateKeyToAccount(OP_KEY);
  const seller = privateKeyToAccount(accts.seller as Hex);
  const buyer = privateKeyToAccount(accts.buyer as Hex);
  const wallet = (a: typeof operator) => createWalletClient({ account: a, chain: hederaTestnet, transport: http(RPC) });
  const wOp = wallet(operator);
  const wSeller = wallet(seller);
  const wBuyer = wallet(buyer);

  const Engine = loadArtifact('MatchingEngine');
  const HoldLeg = loadArtifact('HederaHoldLeg');
  const MockATS = loadArtifact('MockATSSecurity');
  const wait = { timeout: 120_000, pollingInterval: 2_000 } as const;
  const pad = (g: bigint) => (g * 130n) / 100n;
  const send = async (w: typeof wOp, address: Address, abi: readonly unknown[], fn: string, args: unknown[], fb = 2_500_000n) => {
    let gas = fb;
    try {
      gas = pad(await pub.estimateContractGas({ account: w.account!.address, address, abi: abi as Abi, functionName: fn, args }));
    } catch {
      /* keep fallback */
    }
    const hash = await w.writeContract({ address, abi: abi as Abi, functionName: fn, args, gas });
    const rc = await pub.waitForTransactionReceipt({ hash, ...wait });
    if (rc.status !== 'success') throw new Error(`${fn} reverted (${txUrl(hash)})`);
    return hash;
  };
  const read = (fn: string, args: unknown[]) => pub.readContract({ address: bond, abi: bondAbi, functionName: fn, args });
  const deploy = async (art: { abi: readonly unknown[]; bytecode: Hex }, args: unknown[]) => {
    const hash = await wOp.deployContract({ abi: art.abi as Abi, bytecode: art.bytecode, args, gas: 3_500_000n });
    const rc = await pub.waitForTransactionReceipt({ hash, ...wait });
    if (!rc.contractAddress) throw new Error('deploy failed');
    return rc.contractAddress as Address;
  };

  console.log(bold('\n▍ Settle the REAL ATS bond through the venue\n'));
  console.log(`  bond(ATS)  ${bond}   ${dim('(issued via Factory 0.0.9213391)')}`);

  // fresh venue with the real-ATS-correct preflight
  console.log(bold('\n▸ deploy venue (leg + engine)'));
  const leg = await deploy(HoldLeg, [operator.address]);
  const engine = await deploy(Engine, [operator.address, leg, leg, operator.address]);
  await send(wOp, leg, HoldLeg.abi, 'setEngine', [engine]);
  console.log(`  leg    ${green(leg)}\n  engine ${green(engine)}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validTo = now + 10n * 31_536_000n;

  // 1) roles + KYC + issue on the REAL bond (idempotent; ATS reverts on re-grant/re-KYC)
  console.log(bold('\n▸ prepare the ATS bond (roles · KYC · issue)'));
  const ensureRole = async (role: Hex) => {
    if (!(await read('hasRole', [role, operator.address]))) await send(wOp, bond, bondAbi, 'grantRole', [role, operator.address]);
  };
  await ensureRole(ROLE_ISSUER);
  await ensureRole(ROLE_KYC);
  await ensureRole(ROLE_SSI_MANAGER);
  if (!(await read('isIssuer', [operator.address]))) await send(wOp, bond, bondAbi, 'addIssuer', [operator.address]);
  const ensureKyc = async (a: Address, vc: string) => {
    if (Number(await read('getKycStatusFor', [a])) === 0) await send(wOp, bond, bondAbi, 'grantKyc', [a, vc, now - 3600n, validTo, operator.address]);
  };
  await ensureKyc(seller.address, 'vc-ch-seller');
  await ensureKyc(buyer.address, 'vc-ch-buyer');
  await send(wOp, bond, bondAbi, 'issue', [seller.address, QTY, '0x']); // fresh free balance for the hold
  console.log(dim(`  issuer/kyc/ssi ready · KYC'd seller+buyer · issued ${QTY} to seller`));

  // 2) deposit-token cash leg (mock), funded + KYC'd
  console.log(bold('\n▸ cash leg (deposit token)'));
  const cash = await deploy(MockATS, ['USD Deposit Token']);
  await send(wOp, cash, MockATS.abi, 'mint', [P, buyer.address, CASH * 10n]);
  await send(wOp, cash, MockATS.abi, 'setVerified', [seller.address, true]);
  await send(wOp, cash, MockATS.abi, 'setVerified', [buyer.address, true]);
  console.log(dim(`  cash ${cash}`));

  // 3) place holds (escrow = our leg); capture the assigned holdIds via simulate
  console.log(bold('\n▸ place holds (escrow = venue leg)'));
  const holdExp = now + 31_536_000n;
  const bondHold = { amount: QTY, expirationTimestamp: holdExp, escrow: leg, to: ZERO, data: '0x' as Hex };
  const cashHold = { amount: CASH, expirationTimestamp: holdExp, escrow: leg, to: ZERO, data: '0x' as Hex };
  const bondSim = await pub.simulateContract({ account: seller, address: bond, abi: bondAbi, functionName: 'createHoldByPartition', args: [P, bondHold] });
  const bondHoldId = (bondSim.result as readonly [boolean, bigint])[1];
  await send(wSeller, bond, bondAbi, 'createHoldByPartition', [P, bondHold]);
  const cashSim = await pub.simulateContract({ account: buyer, address: cash, abi: MockATS.abi as Abi, functionName: 'createHoldByPartition', args: [P, cashHold] });
  const cashHoldId = (cashSim.result as readonly [boolean, bigint])[1];
  await send(wBuyer, cash, MockATS.abi, 'createHoldByPartition', [P, cashHold]);
  console.log(dim(`  seller held the ATS bond (holdId ${bondHoldId}), buyer held the cash (holdId ${cashHoldId})`));

  // 4) pre-flight + settle atomically
  console.log(bold('\n▸ settle'));
  const trade = {
    bond: { token: bond, from: seller.address, to: buyer.address, amount: QTY, partition: P, holdId: bondHoldId, tradeId: TRADE_ID, extra: '0x' as Hex },
    cash: { token: cash, from: buyer.address, to: seller.address, amount: CASH, partition: P, holdId: cashHoldId, tradeId: TRADE_ID, extra: '0x' as Hex },
  };
  const pf = (await pub.readContract({ address: engine, abi: Engine.abi as Abi, functionName: 'preflight', args: [trade] })) as [boolean, Hex, Hex, Hex, Hex];
  console.log(`  pre-flight ok=${pf[0]}  bond ${bold(pf[1])} ${codeName(pf[1])} ${reasonName(pf[2])}  ·  cash ${bold(pf[3])} ${codeName(pf[3])}`);
  try {
    await pub.simulateContract({ account: operator, address: engine, abi: Engine.abi as Abi, functionName: 'settle', args: [trade], gas: 3_000_000n });
  } catch (e) {
    console.error(red(`\n✗ settle would revert:\n${e instanceof Error ? e.message : e}`));
    process.exit(1);
  }
  const hash = await send(wOp, engine, Engine.abi, 'settle', [trade], 3_000_000n);

  const buyerBond = (await read('balanceOfByPartition', [P, buyer.address])) as bigint;
  writeFileSync(`${LOCAL}/ats-settle.json`, JSON.stringify({ bond, cash, engine, leg, tradeId: TRADE_ID, settleTx: hash, buyerBondBalance: buyerBond.toString() }, null, 2));

  console.log(green(bold('\n▍ Settled a REAL ATS bond through the venue ✓')));
  console.log(`  delivery was a real ATS hold — buyer now holds ${cyan(buyerBond.toString())} of ${bond}`);
  console.log(`  engine ${ctUrl(engine)}`);
  console.log(`  settle ${txUrl(hash)}`);
  console.log(`  saved → verifier/.local/ats-settle.json\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
