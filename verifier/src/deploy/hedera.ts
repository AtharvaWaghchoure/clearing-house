// Deploy the venue to Hedera testnet and clear real settlements through the Hashio JSON-RPC relay.
//
// This is the same wiring as the local anvil demo (src/demo/e2e.ts), pointed at Hedera with the
// funded operator from .env. Two differences the real network forces:
//   1. Only the operator is funded, so we generate a seller + buyer and HBAR-fund them (Hedera
//      auto-creates the accounts on first receipt), persisting their keys so reruns stay cheap.
//   2. Gas is estimated-then-padded per call — Hedera charges ~80% of the gas *limit*, so we size
//      each limit to the op instead of setting one huge ceiling.
//
// It deploys bond + cash (ATS-faithful MockATSSecurity), the HederaHoldLeg escrow, and the
// MatchingEngine; issues + KYCs; clears two atomic delivery-vs-payment trades; then revokes the
// buyer's KYC and shows the identical order pre-flight to 0x10 · AddressNotVerified and refuse to
// settle. Every artifact prints a HashScan link, and the deployment is saved to .local/hedera.json.
//
// Run:  pnpm --filter @clearing-house/verifier exec tsx src/deploy/hedera.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Abi,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  http,
  parseEther,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hederaTestnet } from 'viem/chains';
import { AccountCreateTransaction, AccountId, Client, Hbar, PrivateKey } from '@hashgraph/sdk';
import { loadArtifact } from '../abi.js';
import { codeName, reasonName } from '../codes.js';
import { hashscan, loadEnv } from './util.js';
import type { Address, Hex } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../../');
const LOCAL = resolve(here, '../../.local');

const P = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex; // default partition
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const QTY = 10n;
const CASH = 1000n;
const tid = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

const MIRROR = 'https://testnet.mirrornode.hedera.com';
/** Is this EVM address indexed as an account on the mirror node the relay reads from? */
async function mirrorFound(addr: string): Promise<boolean> {
  try {
    const r = await fetch(`${MIRROR}/api/v1/accounts/${addr}`);
    if (!r.ok) return false;
    const j = (await r.json()) as { account?: string };
    return Boolean(j.account);
  } catch {
    return false;
  }
}
/** The relay resolves senders via the mirror node, which lags consensus a few seconds. */
async function waitIndexed(addr: string, tries = 25): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await mirrorFound(addr)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`account ${addr} never indexed on the mirror node`);
}

async function main() {
  loadEnv(ROOT);
  const RPC = process.env.HEDERA_RPC ?? 'https://testnet.hashio.io/api';
  const OP_KEY = process.env.HEDERA_OPERATOR_KEY as Hex | undefined;
  if (!OP_KEY || !/^0x[0-9a-fA-F]{64}$/.test(OP_KEY)) {
    throw new Error('HEDERA_OPERATOR_KEY missing/not a 0x+64hex key — check .env');
  }
  const OP_ID = process.env.HEDERA_OPERATOR_ID;
  if (!OP_ID || !/^0\.0\.\d+$/.test(OP_ID)) {
    throw new Error('HEDERA_OPERATOR_ID missing/invalid (want 0.0.x) — check .env');
  }

  const pub = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });
  await pub.getBlockNumber().catch(() => {
    throw new Error(`cannot reach Hedera relay at ${RPC}`);
  });

  const operator = privateKeyToAccount(OP_KEY);

  // seller/buyer: reuse persisted throwaway keys, or mint new ones
  mkdirSync(LOCAL, { recursive: true });
  const accPath = `${LOCAL}/hedera-accounts.json`;
  let acc: { seller: Hex; buyer: Hex };
  if (existsSync(accPath)) {
    acc = JSON.parse(readFileSync(accPath, 'utf8'));
  } else {
    acc = { seller: generatePrivateKey(), buyer: generatePrivateKey() };
    writeFileSync(accPath, JSON.stringify(acc, null, 2));
  }
  const seller = privateKeyToAccount(acc.seller);
  const buyer = privateKeyToAccount(acc.buyer);

  const wallet = (a: typeof operator) => createWalletClient({ account: a, chain: hederaTestnet, transport: http(RPC) });
  const wOp = wallet(operator);
  const wSeller = wallet(seller);
  const wBuyer = wallet(buyer);

  console.log('\nCLEARING HOUSE — Hedera testnet deployment\n');
  const opBal = await pub.getBalance({ address: operator.address });
  console.log(`  operator ${operator.address}  ${formatEther(opBal)} HBAR`);
  console.log(`  seller   ${seller.address}`);
  console.log(`  buyer    ${buyer.address}`);
  if (opBal < parseEther('60')) console.log(`  operator balance is low; deployment needs ~50-60 HBAR`);

  const waitOpts = { timeout: 90_000, pollingInterval: 2_000 } as const;
  const pad = (g: bigint) => (g * 125n) / 100n;
  const gasOr = async (fn: () => Promise<bigint>, fallback: bigint) => {
    try {
      return pad(await fn());
    } catch {
      return fallback;
    }
  };

  const deploy = async (label: string, art: { abi: readonly unknown[]; bytecode: Hex }, args: unknown[], fb: bigint) => {
    const data = encodeDeployData({ abi: art.abi as Abi, bytecode: art.bytecode, args });
    const gas = await gasOr(() => pub.estimateGas({ account: operator.address, data }), fb);
    const hash = await wOp.deployContract({ abi: art.abi as Abi, bytecode: art.bytecode, args, gas });
    const rc = await pub.waitForTransactionReceipt({ hash, ...waitOpts });
    if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`${label} deploy failed (${hashscan.tx(hash)})`);
    console.log(`  ${label.padEnd(7)} ${rc.contractAddress}  ${hashscan.contract(rc.contractAddress)}`);
    return rc.contractAddress as Address;
  };

  const send = async (
    w: typeof wOp,
    address: Address,
    abi: readonly unknown[],
    fn: string,
    args: unknown[],
    fb = 1_200_000n,
  ) => {
    const gas = await gasOr(
      () => pub.estimateContractGas({ account: w.account!.address, address, abi: abi as Abi, functionName: fn, args }),
      fb,
    );
    const hash = await w.writeContract({ address, abi: abi as Abi, functionName: fn, args, gas });
    const rc = await pub.waitForTransactionReceipt({ hash, ...waitOpts });
    return { hash, status: rc.status };
  };

  // An EVM value-transfer to a fresh address does NOT create an account on Hedera; the native
  // AccountCreate (with the ECDSA key's EVM alias) does, yielding an account the relay can transact
  // from once the mirror node indexes it.
  console.log('\nprovision counterparties');
  const hedera = Client.forTestnet().setOperator(
    AccountId.fromString(OP_ID),
    PrivateKey.fromStringECDSA(OP_KEY.slice(2)),
  );
  const ensure = async (name: string, hex: Hex, addr: Address) => {
    if (await mirrorFound(addr)) {
      console.log(`  ${name.padEnd(6)} already provisioned  ${addr}`);
      return;
    }
    const key = PrivateKey.fromStringECDSA(hex.slice(2));
    const resp = await new AccountCreateTransaction().setECDSAKeyWithAlias(key).setInitialBalance(new Hbar(25)).execute(hedera);
    const rec = await resp.getReceipt(hedera);
    await waitIndexed(addr);
    console.log(`  ${name.padEnd(6)} ${rec.accountId?.toString() ?? '?'}  ${addr}`);
  };
  try {
    await ensure('seller', acc.seller, seller.address);
    await ensure('buyer', acc.buyer, buyer.address);
  } finally {
    hedera.close();
  }

  const MockATS = loadArtifact('MockATSSecurity');
  const HoldLeg = loadArtifact('HederaHoldLeg');
  const Engine = loadArtifact('MatchingEngine');

  console.log('\ndeploy');
  const bond = await deploy('bond', MockATS, ['HELVETIA 4.25% 15FEB2031'], 3_500_000n);
  const cash = await deploy('cash', MockATS, ['USD Deposit Token'], 3_500_000n);
  const holdLeg = await deploy('leg', HoldLeg, [operator.address], 1_500_000n);
  const engine = await deploy('engine', Engine, [operator.address, holdLeg, holdLeg, operator.address], 2_500_000n);
  await send(wOp, holdLeg, HoldLeg.abi, 'setEngine', [engine]);

  console.log('\nissue + KYC');
  await send(wOp, bond, MockATS.abi, 'mint', [P, seller.address, 1000n]);
  await send(wOp, cash, MockATS.abi, 'mint', [P, buyer.address, 100000n]);
  for (const token of [bond, cash]) {
    for (const who of [seller.address, buyer.address]) {
      await send(wOp, token, MockATS.abi, 'setVerified', [who, true]);
    }
  }
  console.log('  bond → seller, cash → buyer; both KYC-verified on both tokens');

  const leg = (token: Address, from: Address, to: Address, amount: bigint, holdId: bigint, tradeId: Hex) => ({
    token,
    from,
    to,
    amount,
    partition: P,
    holdId,
    tradeId,
    extra: '0x' as Hex,
  });
  const placeBondHold = () =>
    send(wSeller, bond, MockATS.abi, 'createHoldByPartition', [
      P,
      { amount: QTY, expirationTimestamp: 0n, escrow: holdLeg, to: ZERO, data: '0x' },
    ]);
  const placeCashHold = () =>
    send(wBuyer, cash, MockATS.abi, 'createHoldByPartition', [
      P,
      { amount: CASH, expirationTimestamp: 0n, escrow: holdLeg, to: ZERO, data: '0x' },
    ]);

  console.log('\none tx · delivery ∧ payment  (live on Hedera)');
  const settlements: { tradeId: Hex; tx: Hex }[] = [];
  for (let i = 1; i <= 2; i++) {
    await placeBondHold();
    await placeCashHold();
    const trade = {
      bond: leg(bond, seller.address, buyer.address, QTY, BigInt(i), tid(i)),
      cash: leg(cash, buyer.address, seller.address, CASH, BigInt(i), tid(i)),
    };
    const r = await send(wOp, engine, Engine.abi, 'settle', [trade], 1_500_000n);
    if (r.status !== 'success') throw new Error(`settle ${i} reverted (${hashscan.tx(r.hash)})`);
    settlements.push({ tradeId: tid(i), tx: r.hash });
    console.log(`  settled ${tid(i).slice(0, 10) + '…'}  bond→buyer ∧ cash→seller, atomic  ${hashscan.tx(r.hash)}`);
  }

  console.log('\nrevoke KYC → identical order rejects (named reason, pre-signature)');
  await placeBondHold(); // holdId 3
  await placeCashHold(); // holdId 3
  const trade3 = {
    bond: leg(bond, seller.address, buyer.address, QTY, 3n, tid(3)),
    cash: leg(cash, buyer.address, seller.address, CASH, 3n, tid(3)),
  };
  await send(wOp, bond, MockATS.abi, 'setVerified', [buyer.address, false]);
  const pf = (await pub.readContract({
    address: engine,
    abi: Engine.abi as Abi,
    functionName: 'preflight',
    args: [trade3],
  })) as [boolean, Hex, Hex, Hex, Hex];
  console.log(`  pre-flight ok=${pf[0]}  bond → ${pf[1]} · ${codeName(pf[1])} · ${reasonName(pf[2])}`);
  let rejected = false;
  try {
    const r = await send(wOp, engine, Engine.abi, 'settle', [trade3], 1_500_000n);
    rejected = r.status === 'reverted';
  } catch {
    rejected = true;
  }
  console.log(rejected ? '  settle() refused — the venue cannot fill a non-compliant trade' : '  settle unexpectedly succeeded');
  await send(wOp, bond, MockATS.abi, 'setVerified', [buyer.address, true]); // restore for reuse

  const out = {
    network: 'hedera-testnet',
    chainId: hederaTestnet.id,
    rpcUrl: RPC,
    operator: operator.address,
    seller: seller.address,
    buyer: buyer.address,
    engine,
    holdLeg,
    bondToken: bond,
    cashToken: cash,
    settlements,
    hashscan: {
      engine: hashscan.contract(engine),
      bondToken: hashscan.contract(bond),
      cashToken: hashscan.contract(cash),
    },
  };
  writeFileSync(`${LOCAL}/hedera.json`, JSON.stringify(out, null, 2));

  console.log('\ndone — venue live on Hedera testnet');
  console.log(`  engine   ${hashscan.contract(engine)}`);
  console.log(`  bond     ${hashscan.contract(bond)}`);
  console.log(`  settlements: ${settlements.length}   saved verifier/.local/hedera.json\n`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
