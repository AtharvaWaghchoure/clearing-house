// Event ABIs the verifier indexes, and a loader for the Foundry build artifacts (so the demo can
// deploy the exact compiled contracts without duplicating bytecode).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAbiItem } from 'viem';

export const SETTLEMENT_RECEIPT = parseAbiItem(
  'event SettlementReceipt(bytes32 indexed tradeId, address indexed bondToken, address indexed seller, address buyer, uint256 quantity, address cashToken, uint256 cashAmount, bytes1 bondCode, bytes1 cashCode)',
);
export const VERIFIED_EVENT = parseAbiItem('event Verified(address indexed account, bool status)');
export const BLOCKED_EVENT = parseAbiItem('event Blocked(address indexed account, bool status)');

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, '../../contracts/out');

export interface Artifact {
  abi: readonly unknown[];
  bytecode: `0x${string}`;
}

/** Load a compiled contract from `contracts/out/<sol>.sol/<name>.json`. */
export function loadArtifact(sol: string, name = sol): Artifact {
  const path = `${OUT_DIR}/${sol}.sol/${name}.json`;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}
