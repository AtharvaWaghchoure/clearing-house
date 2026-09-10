// Live Hedera-testnet wiring for the terminal. This is the real thing: the venue below is deployed
// and clearing settlements on Hedera testnet (chain 296), source-verified on HashScan. Reads go
// through the mirror node (range-tolerant) and the Hashio JSON-RPC relay; writes go through the
// user's injected wallet (see wallet.ts). Nothing here is a secret — these are public addresses.

import { createPublicClient, defineChain, http } from 'viem';
import type { Address, Hex } from './types';

/** Hedera testnet as an EVM chain (Hashio relay). MetaMask/HashPack point here for signing. */
export const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hashio.io/api'] } },
  blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
  testnet: true,
});

/** The live MockATS venue (docs/hedera-deployment.md, run of 2026-09-08). The operator can freely
 *  mint + verify any address on these tokens — that is what makes open, any-user onboarding possible. */
export const VENUE = {
  engine: '0xa73690cb94d03ee05a68fd2de753964b73a7072a' as Address,
  holdLeg: '0x90775920812cc4726c75e651fe30bc2606f78dee' as Address,
  bondToken: '0x4f76877d98db72102127fab8b0a1e7fedf763604' as Address,
  cashToken: '0xa6491faaf3f5ef0b582e2a865ca6e3b993d09f79' as Address,
  /** _DEFAULT_PARTITION — the senior tranche. */
  partition: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
  /** First block of the deployment; mirror-node scans start here. */
  fromBlock: 40252086,
} as const;

/** Hedera mirror node — the reliable, range-tolerant source of contract logs. */
export const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';

/** HashScan deep links. */
export const scan = {
  tx: (h: string) => `https://hashscan.io/testnet/transaction/${h}`,
  contract: (a: string) => `https://hashscan.io/testnet/contract/${a}`,
  address: (a: string) => `https://hashscan.io/testnet/address/${a}`,
};

/** Read-only client over the public Hashio relay (used for point reads: balances, eligibility). */
export const publicClient = createPublicClient({ chain: hederaTestnet, transport: http() });
