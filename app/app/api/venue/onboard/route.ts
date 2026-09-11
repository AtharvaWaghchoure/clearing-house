// Open onboarding — the step that makes the venue usable by ANY address on testnet. The operator
// (server-side) grants ATS identity verification on both tokens and faucet-funds the caller with
// bond + cash, so a fresh wallet can immediately act as buyer or seller. No auth by design: this is
// a public testnet faucet. The operator key never leaves the server.

import { NextResponse } from 'next/server';
import { isAddress, parseEther } from 'viem';
import { VENUE, scan } from '@/lib/chain';
import { fundHbar, hbarBalanceWei, mint, operatorAddress, setVerified } from '@/lib/server/operator';
import { getCooldown, pushOnboard, setCooldown, windowOnboards } from '@/lib/server/store';
import type { Address, Hex } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Faucet grant per onboarding — enough free balance to place a bond hold or a cash hold. */
const FAUCET_BOND = 1000n;
const FAUCET_CASH = 100_000n;
/** HBAR of gas for a new wallet; only sent when the wallet is below the floor, so repeat onboarding
 *  can't drain the operator. */
const HBAR_DRIP = '5';
const HBAR_FLOOR = parseEther('1');

// Onboarding costs operator gas, so a per-address cooldown stops one address from triggering it
// repeatedly. The cooldown + the circuit-breaker ledger below live in the shared store (Redis in
// prod), so the guard survives restarts and holds across instances — not just within one process.
// Must exceed the onboard's own latency (~4 sequential on-chain receipts, ~35s) or it would lapse
// before the call returns and fail to throttle back-to-back onboards.
const ONBOARD_COOLDOWN_MS = 60_000;

// Circuit-breaker so fresh-address spam can't drain the operator (a new wallet clears the per-address
// cooldown every time). A rolling-window ledger caps how much HBAR is dripped and how many onboards
// run per window, and drips stop entirely if the operator's own reserve gets low.
const HBAR_DRIP_WEI = parseEther(HBAR_DRIP);
const OPERATOR_HBAR_FLOOR = parseEther('100'); // never drip below this reserve
const CB_WINDOW_MS = 60 * 60 * 1000; // rolling 1h
const CB_MAX_ONBOARDS = 60; // onboards per window (caps operator gas spend)
const CB_HBAR_BUDGET = parseEther('100'); // HBAR dripped per window

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

  const now = Date.now();
  const last = await getCooldown(who);
  if (last && now - last < ONBOARD_COOLDOWN_MS) {
    return NextResponse.json({ error: 'onboarding cooldown — wait a moment and retry' }, { status: 429 });
  }
  const { count, drippedWei: drippedSoFar } = await windowOnboards(now, CB_WINDOW_MS);
  if (count >= CB_MAX_ONBOARDS) {
    return NextResponse.json({ error: 'onboarding is temporarily rate-limited — try again shortly' }, { status: 429 });
  }
  await setCooldown(who, now, ONBOARD_COOLDOWN_MS);

  try {
    // HBAR drip, behind the circuit-breaker: only if the wallet is low AND the operator keeps its
    // reserve AND we're under the rolling drip budget. Then verify + fund. Sequential to keep the
    // operator's nonce ordered.
    let fundHbarTx: Hex | undefined;
    let hbarNote: string | undefined;
    if ((await hbarBalanceWei(who)) < HBAR_FLOOR) {
      const opBal = await hbarBalanceWei(operatorAddress());
      if (opBal - HBAR_DRIP_WEI >= OPERATOR_HBAR_FLOOR && drippedSoFar + HBAR_DRIP_WEI <= CB_HBAR_BUDGET) {
        fundHbarTx = await fundHbar(who, HBAR_DRIP);
      } else {
        hbarNote = 'gas faucet throttled — fund this wallet from the Hedera portal faucet to trade';
      }
    }
    await pushOnboard(now, fundHbarTx ? HBAR_DRIP_WEI : 0n, CB_WINDOW_MS);

    const verifyBond = await setVerified(VENUE.bondToken, who);
    const verifyCash = await setVerified(VENUE.cashToken, who);
    const mintBond = await mint(VENUE.bondToken, who, FAUCET_BOND);
    const mintCash = await mint(VENUE.cashToken, who, FAUCET_CASH);

    return NextResponse.json({
      ok: true,
      address: who,
      operator: operatorAddress(),
      granted: { bond: FAUCET_BOND.toString(), cash: FAUCET_CASH.toString(), hbar: fundHbarTx ? HBAR_DRIP : '0' },
      hbarNote,
      txs: { fundHbar: fundHbarTx, verifyBond, verifyCash, mintBond, mintCash },
      links: { verifyBond: scan.tx(verifyBond), mintBond: scan.tx(mintBond), mintCash: scan.tx(mintCash) },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
