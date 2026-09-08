// Run the INDEPENDENT verifier against the live Hedera deployment.
//
// It reads the public facts straight off Hedera (SettlementReceipt from the engine, Verified/Blocked
// from the tokens) through the same ChainDataSource the anvil demo uses — no venue code, no venue
// API — reconstructs each settlement's compliance, and reconciles it against the venue's report:
// first the honest report (all confirmed), then a report with one fabricated trade (caught by id).
//
// It also writes verifier-ready config + ledger files so `ch-verify --config … --ledger …` and the
// MCP server can point at Hedera. Reuses the addresses from the last deploy (no redeploy).
//
// Run:  pnpm --filter @clearing-house/verifier exec tsx src/deploy/hedera-audit.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChainDataSource } from '../datasource/chain.js';
import { formatReport } from '../format.js';
import type { Address, Hex } from '../types.js';
import { honestClaims, withLie } from '../venue.js';
import { audit } from '../verify.js';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL = resolve(here, '../../.local');
const MIRROR = 'https://testnet.mirrornode.hedera.com';
const tid = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

interface HederaDeploy {
  rpcUrl: string;
  engine: Address;
  bondToken: Address;
  cashToken: Address;
}

/** Earliest block the engine emitted a log at (its deploy block) — a tight, RPC-friendly fromBlock. */
async function firstLogBlock(engine: string): Promise<number> {
  const r = await fetch(`${MIRROR}/api/v1/contracts/${engine}/results/logs?order=asc&limit=1`);
  const j = (await r.json()) as { logs?: { block_number?: number }[] };
  return j.logs?.[0]?.block_number ?? 0;
}

async function main() {
  const path = `${LOCAL}/hedera.json`;
  if (!existsSync(path)) throw new Error(`no ${path} — run src/deploy/hedera.ts first`);
  const d = JSON.parse(readFileSync(path, 'utf8')) as HederaDeploy;

  const fromBlock = await firstLogBlock(d.engine);
  console.log(`\n▍ Independent verifier — reading Hedera testnet from block ${fromBlock}\n`);

  const ds = new ChainDataSource({
    rpcUrl: d.rpcUrl,
    engine: d.engine,
    tokens: [d.bondToken, d.cashToken],
    fromBlock: BigInt(Math.max(0, fromBlock - 2)),
    label: 'hedera-testnet',
  });

  const settlements = await ds.getSettlements();
  console.log(`  read ${settlements.length} SettlementReceipt(s) and the token identity logs from the mirror-backed relay`);
  if (settlements.length === 0) throw new Error('no settlements found on-chain — did the deploy clear any?');

  const honest = honestClaims(settlements);
  const lying = withLie(honest, { kind: 'fabricate', tradeId: tid(413) });

  console.log(`\n  venue's HONEST report (${honest.length} trades):`);
  console.log(formatReport(await audit(ds, honest)));
  console.log(`\n  venue's report with ONE fabricated trade (${tid(413).slice(0, 10)}…):`);
  console.log(formatReport(await audit(ds, lying)));

  // verifier-ready artifacts for the CLI / MCP
  const config = {
    rpcUrl: d.rpcUrl,
    engine: d.engine,
    bondToken: d.bondToken,
    cashToken: d.cashToken,
    fromBlock,
    tradeIds: settlements.map((s) => s.tradeId),
  };
  writeFileSync(`${LOCAL}/hedera-config.json`, JSON.stringify(config, null, 2));
  writeFileSync(`${LOCAL}/hedera-ledger.json`, JSON.stringify(lying, null, 2));
  writeFileSync(`${LOCAL}/hedera-ledger.honest.json`, JSON.stringify(honest, null, 2));
  console.log(`\n  wrote ${LOCAL}/{hedera-config.json, hedera-ledger.json}`);
  console.log(`\n  point the CLI at Hedera:`);
  console.log(`    pnpm --filter @clearing-house/verifier exec tsx src/cli.ts audit \\`);
  console.log(`      --config .local/hedera-config.json --ledger .local/hedera-ledger.json\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
