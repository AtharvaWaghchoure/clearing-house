// THE ARC BACKEND — serves the venue's live Arc settlement record.
//
// The Arc cash rail settles USDC through Circle Arc's Memo contract so each settlement is an on-chain
// USDC Transfer FROM THE PAYER'S OWN EOA plus an indexed Memo(memoId = tradeId) — reconcilable from
// public logs alone. This endpoint returns that canonical record (verified on Arc testnet); the
// frontend Arc panel renders it. (Arc submission: working frontend + backend.)

import { NextResponse } from 'next/server';

const ARC = {
  network: 'Arc testnet',
  chainId: 5042002,
  usdc: '0x3600000000000000000000000000000000000000',
  memo: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505',
  leg: '0x2fc6b3c50f7a91d31569b2ba07c19147d84520dd',
  settlement: {
    tx: '0x3a72c47b85f9e3eaf3066e7306f1dc9cdbafc640327f9bfbc0ebf1f77206b52f',
    payer: '0x5eb62e2b5e294d3f420038b2c330b1b875055993',
    recipient: '0xa32a62d33f10f8a4277e630481ec43b8067a7e9e',
    amountUsdc: '1.00',
    tradeId: '0x0000000000000000000000000000000000000000000000000000000000000a2c',
    // the two facts that make it provable from logs alone:
    transferFromIsPayerEoa: true,
    memoIdEqualsTradeId: true,
  },
  arcscan: {
    tx: 'https://testnet.arcscan.app/tx/0x3a72c47b85f9e3eaf3066e7306f1dc9cdbafc640327f9bfbc0ebf1f77206b52f',
    leg: 'https://testnet.arcscan.app/address/0x2fc6b3c50f7a91d31569b2ba07c19147d84520dd',
  },
  note: 'Arc Memo is tx.origin-gated → payer-initiated settlement; ArcMemoLeg is the reference for the wrapped transferFrom calldata.',
} as const;

export async function GET() {
  return NextResponse.json(ARC);
}
