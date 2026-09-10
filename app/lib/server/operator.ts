// The venue operator, server-side only. Holds the operator key (from server env), signs the
// operator-gated calls the venue design requires: settle() on the engine, and mint/setVerified on
// the ATS tokens (open testnet onboarding). This key NEVER reaches the browser — the module throws
// if it is ever evaluated in one, and it is only imported from API route handlers.

import { type Hex, type WalletClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { atsAbi, engineAbi } from '../abi';
import { VENUE, hederaTestnet, publicClient } from '../chain';
import type { Address } from '../types';
import { requireServerEnv } from './env';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/operator is server-only and must never be bundled to the client');
}

/** One LegInstruction, matching contracts/src/interfaces/ISettlementLeg.sol. */
export interface LegInstruction {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
  partition: Hex;
  holdId: bigint;
  tradeId: Hex;
  extra: Hex;
}
export interface Trade {
  bond: LegInstruction;
  cash: LegInstruction;
}

let cached: { account: ReturnType<typeof privateKeyToAccount>; wallet: WalletClient } | undefined;

function operator() {
  if (!cached) {
    let key = requireServerEnv('HEDERA_OPERATOR_KEY');
    if (!key.startsWith('0x')) key = `0x${key}`;
    const account = privateKeyToAccount(key as Hex);
    const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
    cached = { account, wallet };
  }
  return cached;
}

export function operatorAddress(): Address {
  return operator().account.address;
}

/** Send an operator-signed write and wait for the receipt; returns the tx hash. */
async function send(address: Address, abi: unknown, functionName: string, args: unknown[]): Promise<Hex> {
  const { account, wallet } = operator();
  const hash = await wallet.writeContract({
    address,
    abi: abi as never,
    functionName,
    args: args as never,
    account,
    chain: hederaTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Grant ATS identity verification to `who` on a token (idempotent on-chain). */
export function setVerified(token: Address, who: Address): Promise<Hex> {
  return send(token, atsAbi, 'setVerified', [who, true]);
}

/** Faucet: credit `to` with `amount` on a token's default partition. */
export function mint(token: Address, to: Address, amount: bigint): Promise<Hex> {
  return send(token, atsAbi, 'mint', [VENUE.partition, to, amount]);
}

/** Clear a matched trade atomically (operator-only). */
export function settle(trade: Trade): Promise<Hex> {
  return send(VENUE.engine, engineAbi, 'settle', [trade]);
}
