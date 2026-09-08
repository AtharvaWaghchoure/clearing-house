// Client-side domain types for the CLEARING HOUSE terminal.
//
// These mirror the on-chain surface exactly:
//   - `SettlementReceipt` (the MatchingEngine event) is ground truth,
//   - the ATS identity/control events (`Verified` / `Blocked`) drive compliance,
//   - the venue's self-reported ledger (`VenueClaim`) is the thing the verifier tries to falsify.
// The shapes match verifier/src/types.ts so the same reconstruction logic runs unchanged.

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Which cash rail the payment leg settles on. This is the swappable seam (`setLegs`). */
export type Rail = 'hedera' | 'arc';

export type Side = 'bid' | 'ask';

/** A resting order in the book. An ask is a bond `Hold` (escrow = engine); a bid is escrowed cash. */
export interface Order {
  id: string;
  side: Side;
  account: Address;
  /** Cash per unit of face, 2dp, as an integer count of cents to avoid float drift. */
  priceCents: number;
  /** Units of the bond. */
  quantity: number;
  partition: Hex;
  /** Monotonic sequence for stable book ordering. */
  seq: number;
}

/** The `SettlementReceipt` event — what actually cleared. Ground truth. */
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
  rail: Rail;
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

/** What the venue CLAIMS about a trade — its self-reported ledger. Amounts are strings so the
 *  ledger round-trips through the backend API as JSON. This is what we try to falsify. */
export interface VenueClaim {
  tradeId: Hex;
  bondToken: Address;
  seller: Address;
  buyer: Address;
  quantity: string;
  cashToken: Address;
  cashAmount: string;
  compliant: boolean;
}

/** One leg's pre-flight verdict — the decoded return of `canTransferByPartition` / the Arc check. */
export interface LegVerdict {
  ok: boolean;
  code: Hex; // EIP-1066 status byte, e.g. 0x01 / 0x10 / 0x54
  codeName: string; // SUCCESS / DISALLOWED_OR_STOP / INSUFFICIENT_FUNDS
  reason: string; // decoded selector name, e.g. AddressNotVerified, or '—'
  detail: string; // human sentence for the register row
}

/** The full pre-flight the engine runs before it will sign a settlement. */
export interface Preflight {
  bond: LegVerdict;
  cash: LegVerdict;
  ok: boolean; // both legs clear
}

export type FindingStatus =
  | 'CONFIRMED_COMPLIANT'
  | 'FABRICATED'
  | 'MISREPORTED'
  | 'NONCOMPLIANT_SETTLEMENT'
  | 'HIDDEN';

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
  clean: boolean;
}
