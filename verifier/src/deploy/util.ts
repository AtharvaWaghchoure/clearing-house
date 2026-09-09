// Shared helpers for the deploy/demo scripts.

import { existsSync, readFileSync } from 'node:fs';

// Load KEY=value lines from <root>/.env into process.env, without overwriting existing vars.
export function loadEnv(root: string): void {
  const path = `${root}/.env`;
  if (!existsSync(path)) throw new Error(`no .env at ${path}`);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
  }
}

export const hashscan = {
  tx: (h: string) => `https://hashscan.io/testnet/transaction/${h}`,
  contract: (a: string) => `https://hashscan.io/testnet/contract/${a}`,
};

export const arcscan = {
  tx: (h: string) => `https://testnet.arcscan.app/tx/${h}`,
  address: (a: string) => `https://testnet.arcscan.app/address/${a}`,
};
