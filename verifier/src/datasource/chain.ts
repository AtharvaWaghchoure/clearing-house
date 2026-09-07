// Live chain data source. Reads the same public facts from any EVM RPC — local anvil, the Hedera
// testnet JSON-RPC relay, or Arc — via event logs. No venue code, no venue API: just logs.

import { createPublicClient, http, type PublicClient } from 'viem';
import { BLOCKED_EVENT, SETTLEMENT_RECEIPT, VERIFIED_EVENT } from '../abi.js';
import type { Address, ComplianceDataSource, ComplianceEvent, OnChainSettlement } from '../types.js';

export interface ChainConfig {
  rpcUrl: string;
  /** MatchingEngine address — source of SettlementReceipt logs. */
  engine: Address;
  /** Token diamonds/registries to scan for Verified/Blocked events (bond + cash). */
  tokens: Address[];
  fromBlock?: bigint;
  label?: string;
}

export class ChainDataSource implements ComplianceDataSource {
  readonly label: string;
  private readonly client: PublicClient;
  private readonly fromBlock: bigint;

  constructor(private readonly cfg: ChainConfig) {
    this.client = createPublicClient({ transport: http(cfg.rpcUrl) });
    this.label = cfg.label ?? `chain(${cfg.rpcUrl})`;
    this.fromBlock = cfg.fromBlock ?? 0n;
  }

  async getSettlements(): Promise<OnChainSettlement[]> {
    const logs = await this.client.getLogs({
      address: this.cfg.engine,
      event: SETTLEMENT_RECEIPT,
      fromBlock: this.fromBlock,
      toBlock: 'latest',
    });
    return logs.map((l) => {
      const a = l.args;
      return {
        tradeId: a.tradeId!,
        bondToken: a.bondToken! as Address,
        seller: a.seller! as Address,
        buyer: a.buyer! as Address,
        quantity: a.quantity!,
        cashToken: a.cashToken! as Address,
        cashAmount: a.cashAmount!,
        bondCode: a.bondCode!,
        cashCode: a.cashCode!,
        blockNumber: l.blockNumber!,
        txHash: l.transactionHash!,
        logIndex: l.logIndex!,
      };
    });
  }

  async getComplianceEvents(): Promise<ComplianceEvent[]> {
    const out: ComplianceEvent[] = [];
    for (const token of this.cfg.tokens) {
      const [verified, blocked] = await Promise.all([
        this.client.getLogs({ address: token, event: VERIFIED_EVENT, fromBlock: this.fromBlock, toBlock: 'latest' }),
        this.client.getLogs({ address: token, event: BLOCKED_EVENT, fromBlock: this.fromBlock, toBlock: 'latest' }),
      ]);
      for (const l of verified) {
        out.push({ token, kind: 'verified', account: l.args.account! as Address, status: l.args.status!, blockNumber: l.blockNumber!, logIndex: l.logIndex! });
      }
      for (const l of blocked) {
        out.push({ token, kind: 'blocked', account: l.args.account! as Address, status: l.args.status!, blockNumber: l.blockNumber!, logIndex: l.logIndex! });
      }
    }
    return out;
  }
}
