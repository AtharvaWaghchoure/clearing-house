// Open onboarding — the step that makes the venue usable by ANY address on testnet. The operator
// (server-side) grants ATS identity verification on both tokens and faucet-funds the caller with
// bond + cash, so a fresh wallet can immediately act as buyer or seller. No auth by design: this is
// a public testnet faucet. The operator key never leaves the server.

import { NextResponse } from 'next/server';
import { isAddress, parseEther } from 'viem';
import { VENUE, scan } from '@/lib/chain';
import { fundHbar, hbarBalanceWei, mint, operatorAddress, setVerified } from '@/lib/server/operator';
import type { Address } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Faucet grant per onboarding — enough free balance to place a bond hold or a cash hold. */
const FAUCET_BOND = 1000n;
const FAUCET_CASH = 100_000n;
/** HBAR of gas for a new wallet; only sent when the wallet is below the floor, so repeat onboarding
 *  can't drain the operator. */
const HBAR_DRIP = '5';
const HBAR_FLOOR = parseEther('1');

export async function POST(req: Request) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json({ error: 'a valid EVM address is required' }, { status: 400 });
  }
  const who = body.address as Address;

  try {
    // Gas first (lazy-creates the account) if the wallet is low; then verify + fund. Sequential to
    // keep the operator's nonce ordered.
    const fundHbarTx = (await hbarBalanceWei(who)) < HBAR_FLOOR ? await fundHbar(who, HBAR_DRIP) : undefined;
    const verifyBond = await setVerified(VENUE.bondToken, who);
    const verifyCash = await setVerified(VENUE.cashToken, who);
    const mintBond = await mint(VENUE.bondToken, who, FAUCET_BOND);
    const mintCash = await mint(VENUE.cashToken, who, FAUCET_CASH);

    return NextResponse.json({
      ok: true,
      address: who,
      operator: operatorAddress(),
      granted: { bond: FAUCET_BOND.toString(), cash: FAUCET_CASH.toString(), hbar: fundHbarTx ? HBAR_DRIP : '0' },
      txs: { fundHbar: fundHbarTx, verifyBond, verifyCash, mintBond, mintCash },
      links: { verifyBond: scan.tx(verifyBond), mintBond: scan.tx(mintBond), mintCash: scan.tx(mintCash) },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
