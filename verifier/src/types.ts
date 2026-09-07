// Domain types for the independent compliance verifier.
//
// The verifier shares NO code with the venue. It derives everything from public chain data:
//   - SettlementReceipt events (what actually cleared), and
//   - identity/control-list events (who was compliant, and when).
// then compares that reconstruction against what the venue CLAIMS.

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** A settlement as it exists on-chain — the `SettlementReceipt` event. This is ground truth. */
export interface OnChainSettlement {
  tradeId: Hex;
  bondToken: Address;
  seller: Address;
  buyer: Address;
  quantity: bigint;
  cashToken: Address;
  cashAmount: bigint;
  bondCode: Hex; // EIP-1066 byte recorded at settle time (0x01)
  cashCode: Hex;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
}

/** A change to a token's identity registry (`verified`) or control list (`blocked`). */
export interface ComplianceEvent {
  token: Address;
  kind: 'verified' | 'blocked';
  account: Address;
  status: boolean;
  blockNumber: bigint;
  logIndex: number;
}

/** What the venue CLAIMS about a trade — its self-reported ledger / API response. Amounts are
 *  strings so the ledger round-trips through JSON. This is the thing we try to falsify. */
export interface VenueClaim {
  tradeId: Hex;
  bondToken: Address;
  seller: Address;
  buyer: Address;
  quantity: string;
  cashToken: Address;
  cashAmount: string;
  /** The venue's assertion that this trade was compliant. */
  compliant: boolean;
}

export type FindingStatus =
  | 'CONFIRMED_COMPLIANT' // on-chain receipt exists, parties match, reconstruction agrees it was compliant
  | 'FABRICATED' // venue claims a settlement with no on-chain receipt
  | 'MISREPORTED' // on-chain receipt exists but parties/amounts differ from the claim
  | 'NONCOMPLIANT_SETTLEMENT' // receipt exists but a party was not compliant at that block
  | 'HIDDEN'; // settled on-chain but omitted from the venue's report

export interface AuditFinding {
  tradeId: Hex;
  severity: 'ok' | 'critical';
  status: FindingStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface AuditReport {
  dataSource: string;
  venueClaimsCount: number;
  onChainCount: number;
  confirmed: number;
  findings: AuditFinding[];
  /** True when the venue's report is fully backed by, and consistent with, the chain. */
  clean: boolean;
}

/** A source of the public facts the verifier reasons over. Implemented for anvil/Hedera/Arc RPC,
 *  a subgraph, or an in-memory fixture — the reconstruction logic never changes. */
export interface ComplianceDataSource {
  readonly label: string;
  getSettlements(): Promise<OnChainSettlement[]>;
  getComplianceEvents(): Promise<ComplianceEvent[]>;
}
