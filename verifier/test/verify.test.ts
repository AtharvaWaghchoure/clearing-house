import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../src/datasource/fixture.js';
import type { Address, ComplianceEvent, Hex, OnChainSettlement } from '../src/types.js';
import { audit } from '../src/verify.js';
import { honestClaims, withLie } from '../src/venue.js';

const BOND = '0x00000000000000000000000000000000000000b0' as Address;
const CASH = '0x00000000000000000000000000000000000000ca' as Address;
const SELLER = '0x0000000000000000000000000000000000000551' as Address;
const BUYER = '0x0000000000000000000000000000000000000b0b' as Address;

const tid = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const ZERO_TX = `0x${'0'.repeat(64)}` as Hex;

/** KYC both parties on both tokens at block 1. */
function kycEvents(atBlock = 1n): ComplianceEvent[] {
  const mk = (token: Address, account: Address, i: number): ComplianceEvent => ({
    token,
    kind: 'verified',
    account,
    status: true,
    blockNumber: atBlock,
    logIndex: i,
  });
  return [mk(BOND, SELLER, 0), mk(BOND, BUYER, 1), mk(CASH, SELLER, 2), mk(CASH, BUYER, 3)];
}

function settlement(n: number, block: bigint): OnChainSettlement {
  return {
    tradeId: tid(n),
    bondToken: BOND,
    seller: SELLER,
    buyer: BUYER,
    quantity: 10n,
    cashToken: CASH,
    cashAmount: 1000n,
    bondCode: '0x01',
    cashCode: '0x01',
    blockNumber: block,
    txHash: ZERO_TX,
    logIndex: 0,
  };
}

describe('independent compliance verifier', () => {
  it('confirms an honest report against the chain (clean)', async () => {
    const settlements = [settlement(1, 2n), settlement(2, 3n), settlement(3, 4n)];
    const ds = new FixtureDataSource(settlements, kycEvents());
    const report = await audit(ds, honestClaims(settlements));

    expect(report.clean).toBe(true);
    expect(report.confirmed).toBe(3);
    expect(report.findings.every((f) => f.status === 'CONFIRMED_COMPLIANT')).toBe(true);
  });

  it('catches a FABRICATED trade the venue invented', async () => {
    const settlements = [settlement(1, 2n), settlement(2, 3n)];
    const ds = new FixtureDataSource(settlements, kycEvents());
    const lying = withLie(honestClaims(settlements), { kind: 'fabricate', tradeId: tid(413) });

    const report = await audit(ds, lying);
    expect(report.clean).toBe(false);
    const flagged = report.findings.find((f) => f.status === 'FABRICATED');
    expect(flagged?.tradeId).toBe(tid(413));
  });

  it('catches a HIDDEN settlement omitted from the report', async () => {
    const settlements = [settlement(1, 2n), settlement(2, 3n)];
    const ds = new FixtureDataSource(settlements, kycEvents());
    const lying = withLie(honestClaims(settlements), { kind: 'hide', tradeId: tid(2) });

    const report = await audit(ds, lying);
    expect(report.clean).toBe(false);
    expect(report.findings.find((f) => f.status === 'HIDDEN')?.tradeId).toBe(tid(2));
  });

  it('catches a MISREPORTED counterparty', async () => {
    const settlements = [settlement(1, 2n)];
    const ds = new FixtureDataSource(settlements, kycEvents());
    const other = '0x000000000000000000000000000000000000dead' as Address;
    const lying = withLie(honestClaims(settlements), { kind: 'misreport', tradeId: tid(1), newBuyer: other });

    const report = await audit(ds, lying);
    expect(report.clean).toBe(false);
    expect(report.findings.find((f) => f.status === 'MISREPORTED')?.tradeId).toBe(tid(1));
  });

  it('independently flags a settlement that was NOT compliant at its block', async () => {
    // Buyer only becomes verified on the bond at block 5, but the trade cleared at block 2.
    const settlements = [settlement(1, 2n)];
    const events: ComplianceEvent[] = [
      { token: BOND, kind: 'verified', account: SELLER, status: true, blockNumber: 1n, logIndex: 0 },
      { token: CASH, kind: 'verified', account: SELLER, status: true, blockNumber: 1n, logIndex: 1 },
      { token: CASH, kind: 'verified', account: BUYER, status: true, blockNumber: 1n, logIndex: 2 },
      { token: BOND, kind: 'verified', account: BUYER, status: true, blockNumber: 5n, logIndex: 0 },
    ];
    const ds = new FixtureDataSource(settlements, events);
    const report = await audit(ds, honestClaims(settlements)); // venue claims it was compliant

    expect(report.clean).toBe(false);
    const f = report.findings.find((f) => f.status === 'NONCOMPLIANT_SETTLEMENT');
    expect(f?.tradeId).toBe(tid(1));
    expect((f?.evidence as { reasons: string[] }).reasons.join()).toContain('buyer not identity-verified on bond');
  });
});
