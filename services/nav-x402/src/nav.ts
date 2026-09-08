// Net Asset Value of the tokenised bond, computed live from the real ATS bond on Hedera.
// Reads the bond's outstanding supply on-chain and marks it against a clean price — the number the
// x402 paywall sells access to.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi } from 'viem';
import { hederaTestnet } from 'viem/chains';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL = resolve(here, '../../../verifier/.local');
const RPC = process.env.HEDERA_RPC ?? 'https://testnet.hashio.io/api';
// The bond issued via the ATS Factory (verifier/src/deploy/ats-bond.ts).
const FALLBACK_BOND = '0x6e1983459281E1958D9Ca6E5bC4aBDe6A066522a';

const bondAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]);

export interface Nav {
  isin: string;
  bond: `0x${string}`;
  name: string;
  symbol: string;
  unitsOutstanding: number;
  nominalValueUsd: number;
  cleanPrice: number;
  navUsd: number;
  currency: string;
  asOf: string;
  source: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computeNav(asOf: string): Promise<Nav> {
  const bond = (existsSync(`${LOCAL}/ats-bond.json`)
    ? JSON.parse(readFileSync(`${LOCAL}/ats-bond.json`, 'utf8')).bond
    : FALLBACK_BOND) as `0x${string}`;

  const pub = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });
  const [supply, name, symbol] = await Promise.all([
    pub.readContract({ address: bond, abi: bondAbi, functionName: 'totalSupply' }) as Promise<bigint>,
    pub.readContract({ address: bond, abi: bondAbi, functionName: 'name' }) as Promise<string>,
    pub.readContract({ address: bond, abi: bondAbi, functionName: 'symbol' }) as Promise<string>,
  ]);

  const unitsOutstanding = Number(supply); // ATS bond units in issue
  const nominalValueUsd = 1.0; // face 100, 2 decimals
  const cleanPrice = 99.85; // marked clean price (% of par)
  const navUsd = round2(unitsOutstanding * nominalValueUsd * (cleanPrice / 100));

  return {
    isin: 'US0378331005',
    bond,
    name,
    symbol,
    unitsOutstanding,
    nominalValueUsd,
    cleanPrice,
    navUsd,
    currency: 'USD',
    asOf,
    source: 'live totalSupply() on the ATS bond · Hedera testnet',
  };
}
