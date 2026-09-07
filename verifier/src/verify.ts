// The independent reconstruction. Given only public chain facts (settlements + compliance events),
// decide — for each settlement — whether it was genuinely compliant AT THE BLOCK IT CLEARED, and
// whether the venue's self-report is faithful to the chain.
//
// The rules mirror exactly what the ATS enforces inside `executeHoldByPartition` (see
// specs/ats-mechanism.md): the recipient of each leg must be identity-verified and not blocked, and
// the sender must be identified. If the venue ever settled a trade that violated this — or reports a
// trade the chain does not corroborate — this catches it.

import type {
  Address,
  AuditFinding,
  AuditReport,
  ComplianceDataSource,
  ComplianceEvent,
  Hex,
  OnChainSettlement,
  VenueClaim,
} from './types.js';

/** Point-in-time view of identity/control state per (token, account), rebuilt from events. */
export class ComplianceTimeline {
  // token -> account -> ascending list of {block, logIndex, status}
  private verified = new Map<string, { block: bigint; logIndex: number; status: boolean }[]>();
  private blocked = new Map<string, { block: bigint; logIndex: number; status: boolean }[]>();

  constructor(events: ComplianceEvent[]) {
    const ordered = [...events].sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
    for (const e of ordered) {
      const map = e.kind === 'verified' ? this.verified : this.blocked;
      const key = this.key(e.token, e.account);
      const arr = map.get(key) ?? [];
      arr.push({ block: e.blockNumber, logIndex: e.logIndex, status: e.status });
      map.set(key, arr);
    }
  }

  private key(token: Address, account: Address): string {
    return `${token.toLowerCase()}:${account.toLowerCase()}`;
  }

  /** Latest status at or before `block`. Absent history => false (not verified / not blocked). */
  private statusAt(
    map: Map<string, { block: bigint; logIndex: number; status: boolean }[]>,
    token: Address,
    account: Address,
    block: bigint,
  ): boolean {
    const arr = map.get(this.key(token, account));
    if (!arr) return false;
    let status = false;
    for (const e of arr) {
      if (e.block <= block) status = e.status;
      else break;
    }
    return status;
  }

  isVerifiedAt(token: Address, account: Address, block: bigint): boolean {
    return this.statusAt(this.verified, token, account, block);
  }

  isBlockedAt(token: Address, account: Address, block: bigint): boolean {
    return this.statusAt(this.blocked, token, account, block);
  }
}

export interface ComplianceVerdict {
  compliant: boolean;
  reasons: string[];
}

/** Recompute a settlement's compliance from chain state at its own block. */
export function reconstructCompliance(s: OnChainSettlement, timeline: ComplianceTimeline): ComplianceVerdict {
  const reasons: string[] = [];
  const at = s.blockNumber;

  // Delivery leg: bond moves seller -> buyer on `bondToken`.
  //   onlyIdentifiedAddresses(seller, buyer) + onlyCompliant(0, buyer) + control-list(seller).
  if (!timeline.isVerifiedAt(s.bondToken, s.buyer, at)) reasons.push('buyer not identity-verified on bond (AddressNotVerified)');
  if (timeline.isBlockedAt(s.bondToken, s.buyer, at)) reasons.push('buyer blocked on bond (AccountIsBlocked)');
  if (!timeline.isVerifiedAt(s.bondToken, s.seller, at)) reasons.push('seller not identity-verified on bond (AddressNotVerified)');
  if (timeline.isBlockedAt(s.bondToken, s.seller, at)) reasons.push('seller blocked on bond (AccountIsBlocked)');

  // Payment leg: cash moves buyer -> seller on `cashToken`.
  if (!timeline.isVerifiedAt(s.cashToken, s.seller, at)) reasons.push('seller not identity-verified on cash (AddressNotVerified)');
  if (timeline.isBlockedAt(s.cashToken, s.seller, at)) reasons.push('seller blocked on cash (AccountIsBlocked)');
  if (!timeline.isVerifiedAt(s.cashToken, s.buyer, at)) reasons.push('buyer not identity-verified on cash (AddressNotVerified)');
  if (timeline.isBlockedAt(s.cashToken, s.buyer, at)) reasons.push('buyer blocked on cash (AccountIsBlocked)');

  return { compliant: reasons.length === 0, reasons };
}

function sameParties(s: OnChainSettlement, c: VenueClaim): boolean {
  return (
    s.bondToken.toLowerCase() === c.bondToken.toLowerCase() &&
    s.seller.toLowerCase() === c.seller.toLowerCase() &&
    s.buyer.toLowerCase() === c.buyer.toLowerCase() &&
    s.cashToken.toLowerCase() === c.cashToken.toLowerCase() &&
    s.quantity === BigInt(c.quantity) &&
    s.cashAmount === BigInt(c.cashAmount)
  );
}

/** Run the full audit: reconcile the venue's claimed ledger against the reconstructed truth. */
export async function audit(dataSource: ComplianceDataSource, venueClaims: VenueClaim[]): Promise<AuditReport> {
  const [settlements, events] = await Promise.all([dataSource.getSettlements(), dataSource.getComplianceEvents()]);
  const timeline = new ComplianceTimeline(events);

  const onChainById = new Map<string, OnChainSettlement>();
  for (const s of settlements) onChainById.set(s.tradeId.toLowerCase(), s);

  const findings: AuditFinding[] = [];
  const claimedIds = new Set<string>();
  let confirmed = 0;

  for (const claim of venueClaims) {
    const id = claim.tradeId.toLowerCase();
    claimedIds.add(id);
    const onChain = onChainById.get(id);

    if (!onChain) {
      findings.push({
        tradeId: claim.tradeId,
        severity: 'critical',
        status: 'FABRICATED',
        detail: 'Venue reports this settlement, but no SettlementReceipt exists on-chain.',
        evidence: { claim },
      });
      continue;
    }

    if (!sameParties(onChain, claim)) {
      findings.push({
        tradeId: claim.tradeId,
        severity: 'critical',
        status: 'MISREPORTED',
        detail: 'On-chain receipt exists but its parties/amounts differ from the venue claim.',
        evidence: {
          onChain: { seller: onChain.seller, buyer: onChain.buyer, quantity: onChain.quantity.toString(), cashAmount: onChain.cashAmount.toString() },
          claim,
        },
      });
      continue;
    }

    const verdict = reconstructCompliance(onChain, timeline);
    if (!verdict.compliant) {
      findings.push({
        tradeId: claim.tradeId,
        severity: 'critical',
        status: 'NONCOMPLIANT_SETTLEMENT',
        detail: `Settled on-chain but reconstruction finds it was NOT compliant at block ${onChain.blockNumber}.`,
        evidence: { block: onChain.blockNumber.toString(), reasons: verdict.reasons },
      });
      continue;
    }

    confirmed++;
    findings.push({
      tradeId: claim.tradeId,
      severity: 'ok',
      status: 'CONFIRMED_COMPLIANT',
      detail: `Independently confirmed compliant at block ${onChain.blockNumber}.`,
    });
  }

  // Anything settled on-chain but omitted from the venue's report.
  for (const s of settlements) {
    if (!claimedIds.has(s.tradeId.toLowerCase())) {
      findings.push({
        tradeId: s.tradeId,
        severity: 'critical',
        status: 'HIDDEN',
        detail: 'Settled on-chain but omitted from the venue report.',
        evidence: { blockNumber: s.blockNumber.toString(), txHash: s.txHash },
      });
    }
  }

  const clean = findings.every((f) => f.severity !== 'critical');
  return {
    dataSource: dataSource.label,
    venueClaimsCount: venueClaims.length,
    onChainCount: settlements.length,
    confirmed,
    findings,
    clean,
  };
}

/** Verify a single trade id (used by the MCP `verify_trade` tool). */
export async function verifyTrade(
  dataSource: ComplianceDataSource,
  venueClaims: VenueClaim[],
  tradeId: Hex,
): Promise<AuditFinding> {
  const report = await audit(dataSource, venueClaims);
  const found = report.findings.find((f) => f.tradeId.toLowerCase() === tradeId.toLowerCase());
  return (
    found ?? {
      tradeId,
      severity: 'critical',
      status: 'FABRICATED',
      detail: 'No such trade in either the venue report or on-chain.',
    }
  );
}
