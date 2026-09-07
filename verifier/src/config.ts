// Shared config loading for the CLI and MCP server: where to read the chain from, and which
// venue ledger to hold it against. Defaults point at the local anvil demo output; override via
// flags/env to point at Hedera testnet + a real venue ledger.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address, VenueClaim } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG = resolve(here, '../.local/local.json');
export const DEFAULT_LEDGER = resolve(here, '../.local/venue-ledger.json');

export interface ChainDeployment {
  rpcUrl: string;
  engine: Address;
  bondToken: Address;
  cashToken: Address;
  fromBlock: number;
  tradeIds?: string[];
}

export function loadDeployment(path = DEFAULT_CONFIG): ChainDeployment {
  if (!existsSync(path)) {
    throw new Error(`No deployment config at ${path}. Run the demo first (scripts/local-demo.sh) or pass --config.`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadLedger(path = DEFAULT_LEDGER): VenueClaim[] {
  if (!existsSync(path)) throw new Error(`No venue ledger at ${path}. Pass --ledger.`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
