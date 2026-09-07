#!/usr/bin/env node
// ch-verify — audit a venue's settlement report against the chain, from the outside.
//
//   ch-verify audit                 full reconciliation report
//   ch-verify trade <tradeId>       verdict for one trade
//   flags: --config <local.json> --ledger <ledger.json>
//
// Works against any EVM the deployment config points at (anvil, Hedera testnet, Arc).

import { ChainDataSource } from './datasource/chain.js';
import { DEFAULT_CONFIG, DEFAULT_LEDGER, loadDeployment, loadLedger } from './config.js';
import { formatReport } from './format.js';
import type { Hex } from './types.js';
import { audit, verifyTrade } from './verify.js';

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const cmd = process.argv[2] ?? 'audit';
  const deployment = loadDeployment(flag('config', DEFAULT_CONFIG));
  const ledger = loadLedger(flag('ledger', DEFAULT_LEDGER));
  const ds = new ChainDataSource({
    rpcUrl: deployment.rpcUrl,
    engine: deployment.engine,
    tokens: [deployment.bondToken, deployment.cashToken],
    fromBlock: BigInt(deployment.fromBlock),
    label: deployment.rpcUrl.includes('hashio') ? 'hedera-testnet' : deployment.rpcUrl.includes('127.0.0.1') ? 'anvil' : deployment.rpcUrl,
  });

  if (cmd === 'trade') {
    const tradeId = process.argv[3] as Hex | undefined;
    if (!tradeId) throw new Error('usage: ch-verify trade <tradeId>');
    const finding = await verifyTrade(ds, ledger, tradeId);
    console.log(JSON.stringify(finding, null, 2));
    process.exit(finding.severity === 'critical' ? 1 : 0);
  }

  const report = await audit(ds, ledger);
  console.log(formatReport(report));
  process.exit(report.clean ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
