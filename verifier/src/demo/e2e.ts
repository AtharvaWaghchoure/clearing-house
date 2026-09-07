// End-to-end local demo. Against a local anvil node this:
//   1. deploys the mock ATS (bond + cash), the HederaHoldLeg, and the MatchingEngine
//   2. issues + KYCs, then clears three compliant trades atomically           (MOMENT 1)
//   3. revokes the buyer's KYC and shows the SAME order refuse itself with the
//      real named reason (0x10 · AddressNotVerified), then reverting on settle  (MOMENT 2)
//   4. runs the INDEPENDENT verifier against the chain and catches the venue
//      lying about a fabricated trade                                           (MOMENT 3)
//
// The mock ATS stands in for the real Hedera deployment; the Hedera/Arc path is the same code with
// real addresses + RPC. Run with: `pnpm --filter @clearing-house/verifier demo` (needs anvil).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Abi, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { loadArtifact } from '../abi.js';
import { codeName, reasonName } from '../codes.js';
import { ChainDataSource } from '../datasource/chain.js';
import { formatReport } from '../format.js';
import type { Address, Hex } from '../types.js';
import { honestClaims, withLie } from '../venue.js';
import { audit } from '../verify.js';

const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const P = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex; // _DEFAULT_PARTITION
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

// Standard anvil dev keys — deployer/operator, seller, buyer.
const PK = {
  operator: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  seller: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  buyer: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const;

const QTY = 10n;
const CASH = 1000n;
const tid = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function main() {
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  await pub.getBlockNumber().catch(() => {
    throw new Error(`Cannot reach anvil at ${RPC}. Start it with: anvil`);
  });

  const operator = privateKeyToAccount(PK.operator);
  const seller = privateKeyToAccount(PK.seller);
  const buyer = privateKeyToAccount(PK.buyer);
  const wallet = (acc: typeof operator) => createWalletClient({ account: acc, chain: foundry, transport: http(RPC) });
  const wOp = wallet(operator);
  const wSeller = wallet(seller);
  const wBuyer = wallet(buyer);

  const MockATS = loadArtifact('MockATSSecurity');
  const HoldLeg = loadArtifact('HederaHoldLeg');
  const Engine = loadArtifact('MatchingEngine');

  const deploy = async (w: typeof wOp, art: { abi: readonly unknown[]; bytecode: `0x${string}` }, args: unknown[]) => {
    const hash = await w.deployContract({ abi: art.abi as Abi, bytecode: art.bytecode, args });
    const rc = await pub.waitForTransactionReceipt({ hash });
    if (!rc.contractAddress) throw new Error('deploy failed');
    return rc.contractAddress as Address;
  };
  const send = async (w: typeof wOp, address: Address, abi: readonly unknown[], fn: string, args: unknown[]) => {
    const hash = await w.writeContract({ address, abi: abi as Abi, functionName: fn, args });
    await pub.waitForTransactionReceipt({ hash });
  };

  const startBlock = await pub.getBlockNumber();
  console.log(bold('\n▍ CLEARING HOUSE — local end-to-end demo\n'));

  // --- deploy ---
  const bond = await deploy(wOp, MockATS, ['ACME 5.5% 2030 Bond']);
  const cash = await deploy(wOp, MockATS, ['USD Deposit Token']);
  const holdLeg = await deploy(wOp, HoldLeg, [operator.address]);
  const engine = await deploy(wOp, Engine, [operator.address, holdLeg, holdLeg, operator.address]);
  await send(wOp, holdLeg, HoldLeg.abi, 'setEngine', [engine]);
  console.log(dim(`  bond   ${bond}\n  cash   ${cash}\n  leg    ${holdLeg}\n  engine ${engine}`));

  // --- issue + KYC ---
  await send(wOp, bond, MockATS.abi, 'mint', [P, seller.address, 1000n]);
  await send(wOp, cash, MockATS.abi, 'mint', [P, buyer.address, 100000n]);
  for (const token of [bond, cash]) {
    for (const who of [seller.address, buyer.address]) {
      await send(wOp, token, MockATS.abi, 'setVerified', [who, true]);
    }
  }
  console.log(dim('  issued bond to seller, cash to buyer; KYC granted to both on both tokens'));

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

  // --- MOMENT 1: three compliant settlements, each one tx, both legs ---
  console.log(bold('\n① one tx · delivery ∧ payment'));
  for (let i = 1; i <= 3; i++) {
    await placeBondHold();
    await placeCashHold();
    const trade = {
      bond: leg(bond, seller.address, buyer.address, QTY, BigInt(i), tid(i)),
      cash: leg(cash, buyer.address, seller.address, CASH, BigInt(i), tid(i)),
    };
    await send(wOp, engine, Engine.abi, 'settle', [trade]);
    console.log(`   settled ${cyan(tid(i).slice(0, 10) + '…')}  ${dim('bond→buyer ∧ cash→seller, atomic')}`);
  }

  // --- MOMENT 2: revoke KYC, same order refuses itself with the real named reason ---
  console.log(bold('\n② revoke KYC → the identical order rejects (named reason, pre-signature)'));
  await placeBondHold(); // holdId 4
  await placeCashHold(); // holdId 4
  const trade4 = {
    bond: leg(bond, seller.address, buyer.address, QTY, 4n, tid(4)),
    cash: leg(cash, buyer.address, seller.address, CASH, 4n, tid(4)),
  };
  await send(wOp, bond, MockATS.abi, 'setVerified', [buyer.address, false]); // issuer revokes buyer KYC
  const pf = (await pub.readContract({
    address: engine,
    abi: Engine.abi as Abi,
    functionName: 'preflight',
    args: [trade4],
  })) as [boolean, Hex, Hex, Hex, Hex];
  console.log(
    `   pre-flight: ok=${pf[0]}  bond → ${bold(pf[1])} · ${bold(codeName(pf[1]))} · ${bold(reasonName(pf[2]))}`,
  );
  try {
    await send(wOp, engine, Engine.abi, 'settle', [trade4]);
    console.log('   ⚠ settle unexpectedly succeeded');
  } catch {
    console.log(`   settle() reverted ${dim('— the venue cannot fill a non-compliant trade')}`);
  }

  // --- MOMENT 3: the independent verifier catches the venue lying ---
  console.log(bold('\n③ independent verifier (reads the chain, shares no venue code)'));
  const ds = new ChainDataSource({ rpcUrl: RPC, engine, tokens: [bond, cash], fromBlock: startBlock, label: 'anvil' });
  const onchain = await ds.getSettlements();
  const honest = honestClaims(onchain);
  const lying = withLie(honest, { kind: 'fabricate', tradeId: tid(413) });

  console.log(dim(`\n   venue's HONEST report (${honest.length} trades):`));
  console.log(formatReport(await audit(ds, honest)));
  console.log(dim(`\n   venue's report with ONE fabricated trade (${tid(413).slice(0, 10)}…):`));
  console.log(formatReport(await audit(ds, lying)));

  // --- persist for the CLI / MCP / frontend ---
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '../../.local');
  mkdirSync(outDir, { recursive: true });
  const deployment = {
    rpcUrl: RPC,
    engine,
    bondToken: bond,
    cashToken: cash,
    fromBlock: Number(startBlock),
    tradeIds: onchain.map((s) => s.tradeId),
  };
  writeFileSync(`${outDir}/local.json`, JSON.stringify(deployment, null, 2));
  writeFileSync(`${outDir}/venue-ledger.json`, JSON.stringify(lying, null, 2));
  writeFileSync(`${outDir}/venue-ledger.honest.json`, JSON.stringify(honest, null, 2));
  console.log(dim(`\n   wrote ${outDir}/{local.json, venue-ledger.json}`));
  console.log(bold('\n▍ done.\n'));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
