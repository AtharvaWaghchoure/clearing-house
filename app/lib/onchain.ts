// Real reads off Hedera testnet — no venue API, no simulation. Settlement history and compliance
// events come from the mirror node (range-tolerant); balances and transfer-eligibility are point
// reads over the Hashio relay. This is the same public data the independent verifier reconstructs
// from, ported from verifier/src/datasource/chain.ts.
//
// The mirror node rejects topic0 filtering without a timestamp bound, and these venue contracts emit
// only a handful of logs, so we pull all logs per contract and filter client-side by decoded event.

import { decodeEventLog } from 'viem';
import { atsAbi, engineAbi } from './abi';
import { MIRROR, VENUE, publicClient } from './chain';
import { codeName, reasonName } from './eip1066';
import type { Address, ComplianceEvent, Hex, OnChainSettlement } from './types';

interface MirrorLog {
  data: Hex;
  index: number;
  block_number: number;
  timestamp: string;
  topics: Hex[];
  transaction_hash: Hex;
}

/** All of a contract's logs from the mirror node, following pagination (bounded). */
async function mirrorLogs(address: Address): Promise<MirrorLog[]> {
  const out: MirrorLog[] = [];
  let path: string | null = `/contracts/${address}/results/logs?order=asc&limit=100`;
  for (let guard = 0; path && guard < 25; guard++) {
    const res: Response = await fetch(
      path.startsWith('/api/v1') ? `https://testnet.mirrornode.hedera.com${path}` : `${MIRROR}${path}`,
    );
    if (!res.ok) throw new Error(`mirror node ${res.status} for ${address}`);
    const body = (await res.json()) as { logs?: MirrorLog[]; links?: { next?: string | null } };
    out.push(...(body.logs ?? []));
    path = body.links?.next ?? null;
  }
  return out;
}

/** The `SettlementReceipt` history — what actually cleared. Ground truth for the tape. */
export async function fetchSettlements(): Promise<OnChainSettlement[]> {
  const logs = await mirrorLogs(VENUE.engine);
  const out: OnChainSettlement[] = [];
  for (const l of logs) {
    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({ abi: engineAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
    } catch {
      continue; // a log whose topic0 isn't in the engine ABI
    }
    if (decoded.eventName !== 'SettlementReceipt') continue;
    const a = decoded.args as unknown as {
      tradeId: Hex;
      bondToken: Address;
      seller: Address;
      buyer: Address;
      quantity: bigint;
      cashToken: Address;
      cashAmount: bigint;
      bondCode: Hex;
      cashCode: Hex;
    };
    // the engine is long-lived; show only settlements on the current bond token (the venue's tokens
    // were redeployed for hold release, so earlier receipts reference retired tokens)
    if (a.bondToken.toLowerCase() !== VENUE.bondToken.toLowerCase()) continue;
    out.push({
      tradeId: a.tradeId,
      bondToken: a.bondToken,
      seller: a.seller,
      buyer: a.buyer,
      quantity: a.quantity,
      cashToken: a.cashToken,
      cashAmount: a.cashAmount,
      bondCode: a.bondCode,
      cashCode: a.cashCode,
      blockNumber: BigInt(l.block_number),
      txHash: l.transaction_hash,
      logIndex: l.index,
      rail: 'hedera',
    });
  }
  return out;
}

/** ATS identity/control timeline (`Verified` / `Blocked`) across the bond + cash tokens. */
export async function fetchComplianceEvents(
  tokens: Address[] = [VENUE.bondToken, VENUE.cashToken],
): Promise<ComplianceEvent[]> {
  const out: ComplianceEvent[] = [];
  for (const token of tokens) {
    const logs = await mirrorLogs(token);
    for (const l of logs) {
      let decoded: ReturnType<typeof decodeEventLog>;
      try {
        decoded = decodeEventLog({ abi: atsAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      } catch {
        continue;
      }
      if (decoded.eventName !== 'Verified' && decoded.eventName !== 'Blocked') continue;
      const a = decoded.args as unknown as { account: Address; status: boolean };
      out.push({
        token,
        kind: decoded.eventName === 'Verified' ? 'verified' : 'blocked',
        account: a.account,
        status: a.status,
        blockNumber: BigInt(l.block_number),
        logIndex: l.index,
      });
    }
  }
  return out;
}

/** Available (non-held) partitioned balance of `holder` on a token. */
export function balanceOf(token: Address, holder: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: atsAbi,
    functionName: 'balanceOfByPartition',
    args: [VENUE.partition, holder],
  });
}

export interface Eligibility {
  ok: boolean;
  code: Hex;
  codeName: string;
  reason: string;
}

/** The ATS's own answer to "would this leg move right now?" — the same `canTransferByPartition`
 *  the engine's preflight() calls, so the terminal can name a rejection (0x10 · AddressNotVerified)
 *  before anyone is asked to sign. INSUFFICIENT_FUNDS (0x54) is not a compliance failure: for a
 *  resting order the amount is already escrowed in a hold, so identity is what's being tested. */
export async function transferEligibility(
  token: Address,
  from: Address,
  to: Address,
  amount = 1n,
): Promise<Eligibility> {
  const [status, code, reason] = await publicClient.readContract({
    address: token,
    abi: atsAbi,
    functionName: 'canTransferByPartition',
    args: [from, to, VENUE.partition, amount, '0x', '0x'],
  });
  const ok = status || code === '0x54';
  return { ok, code, codeName: codeName(code), reason: reasonName(reason) };
}

/** Can `who` receive the bond? AddressNotVerified ⇒ they still need onboarding. */
export function bondEligibility(who: Address): Promise<Eligibility> {
  return transferEligibility(VENUE.bondToken, who, who);
}
