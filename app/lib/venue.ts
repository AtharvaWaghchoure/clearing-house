// A faithful in-browser model of the settlement venue — the same logic the Solidity enforces, so the
// terminal is a real preview of on-chain behaviour rather than a mock-up. It mirrors:
//
//   • MatchingEngine.preflight/settle — pre-flight BOTH legs, then execute atomically (both or neither)
//   • ATS canTransferByPartition       — recipient must be identity-verified and not on the control list,
//                                         sender must be identified; failure → EIP-1066 0x10 + a named reason
//   • ArcMemoLeg                        — plain USDC transferFrom (no KYC on the cash rail); funds check → 0x54
//   • SettlementReceipt                 — the ground-truth event an independent index reads back
//   • Verified / Blocked                — ATS identity/control events, kept as a point-in-time timeline
//
// The store is framework-agnostic (no React import) and exposes an immutable snapshot for
// useSyncExternalStore. Every mutation replaces `state`, so snapshot identity changes on each action.

import { INSTRUMENT, OPERATOR } from './accounts';
import { codeName, reasonName, reasonWord, CODE } from './eip1066';
import { fauxTx, notional } from './format';
import type {
  Address,
  ComplianceEvent,
  Hex,
  LegVerdict,
  OnChainSettlement,
  Order,
  Preflight,
  Rail,
  VenueClaim,
} from './types';

export interface VenueState {
  block: bigint;
  orders: Order[];
  settlements: OnChainSettlement[];
  events: ComplianceEvent[];
  balances: Record<string, { bond: number; cash: number }>;
  seq: number;
  tradeSeq: number;
  rail: Rail;
  /** transient: the last leg-not-compliant rejection, for the UI to surface. */
  lastReject?: { tradeLabel: string; leg: 'bond' | 'cash'; verdict: LegVerdict };
}

const bondTokenReasonEmpty = ('0x' + '0'.repeat(64)) as Hex;

function tradeIdOf(n: number): Hex {
  return ('0x' + n.toString(16).padStart(64, '0')) as Hex;
}

function bal(state: VenueState, a: Address) {
  return state.balances[a.toLowerCase()] ?? { bond: 0, cash: 0 };
}

/** Compose the register verdict object with decoded names attached. */
function verdict(ok: boolean, code: Hex, reason32: Hex, detail: string): LegVerdict {
  return { ok, code, codeName: codeName(code), reason: reasonName(reason32), detail };
}

export function createVenueStore() {
  let state: VenueState = seed();
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const set = (next: VenueState) => {
    state = next;
    emit();
  };

  // ---- point-in-time compliance, reduced from the event log at the CURRENT block ----
  const statusAt = (
    kind: 'verified' | 'blocked',
    token: Address,
    account: Address,
    atBlock: bigint,
    evs: ComplianceEvent[],
  ): boolean => {
    let status = false;
    for (const e of evs) {
      if (e.kind !== kind) continue;
      if (e.token.toLowerCase() !== token.toLowerCase()) continue;
      if (e.account.toLowerCase() !== account.toLowerCase()) continue;
      if (e.blockNumber <= atBlock) status = e.status;
    }
    return status;
  };

  const isVerified = (token: Address, a: Address) =>
    statusAt('verified', token, a, state.block, state.events);
  const isBlocked = (token: Address, a: Address) =>
    statusAt('blocked', token, a, state.block, state.events);

  /** Faithful port of ATS canTransferByPartition: check recipient control-list, recipient identity,
   *  then sender identity — surfacing the first failure as an EIP-1066 code + selector reason. */
  const atsCheck = (token: Address, from: Address, to: Address, subject: string): LegVerdict => {
    if (isBlocked(token, to))
      return verdict(false, CODE.DISALLOWED, reasonWord('AccountIsBlocked'), `${subject} on control list`);
    if (!isVerified(token, to))
      return verdict(false, CODE.DISALLOWED, reasonWord('AddressNotVerified'), `${subject} identity not verified`);
    if (!isVerified(token, from))
      return verdict(false, CODE.DISALLOWED, reasonWord('AddressNotVerified'), `counterparty identity not verified`);
    return verdict(true, CODE.SUCCESS, bondTokenReasonEmpty, `${subject} cleared`);
  };

  /** Pre-flight both legs of a bid×ask cross exactly as MatchingEngine.preflight would. */
  const preflight = (bid: Order, ask: Order, rail: Rail = state.rail): Preflight => {
    const buyer = bid.account;
    const seller = ask.account;
    const qty = Math.min(bid.quantity, ask.quantity);
    const cash = notional(ask.priceCents, qty);

    // Delivery leg — bond moves seller → buyer, gated by the ATS hold's own compliance.
    const bond = atsCheck(INSTRUMENT.bondToken, seller, buyer, 'buyer');

    // Payment leg — swappable rail.
    let cashLeg: LegVerdict;
    if (rail === 'arc') {
      // ArcMemoLeg: plain USDC transferFrom wrapped in Memo — no KYC on the cash, only funds.
      if (bal(state, buyer).cash < cash)
        cashLeg = verdict(false, CODE.INSUFFICIENT_FUNDS, bondTokenReasonEmpty, 'buyer USDC balance short');
      else cashLeg = verdict(true, CODE.SUCCESS, bondTokenReasonEmpty, 'USDC funded · Memo(tradeId)');
    } else {
      // HederaHoldLeg on the cash token: the deposit-token is itself ATS-compliant.
      cashLeg = atsCheck(INSTRUMENT.cashToken, buyer, seller, 'seller');
    }

    return { bond, cash: cashLeg, ok: bond.ok && cashLeg.ok };
  };

  return {
    getSnapshot: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    isVerified,
    isBlocked,
    preflight,

    /** Best (top-of-book) resting orders. */
    bestBid(): Order | undefined {
      return [...state.orders.filter((o) => o.side === 'bid')].sort(
        (a, b) => b.priceCents - a.priceCents || a.seq - b.seq,
      )[0];
    },
    bestAsk(): Order | undefined {
      return [...state.orders.filter((o) => o.side === 'ask')].sort(
        (a, b) => a.priceCents - b.priceCents || a.seq - b.seq,
      )[0];
    },

    setRail(rail: Rail) {
      set({ ...state, rail });
    },

    /** Toggle an account's ATS identity (KYC) on a token — emits a `Verified` event, mines a block. */
    setVerified(token: Address, account: Address, status: boolean) {
      const block = state.block + 1n;
      const ev: ComplianceEvent = {
        token,
        kind: 'verified',
        account,
        status,
        blockNumber: block,
        logIndex: state.seq,
      };
      set({ ...state, block, seq: state.seq + 1, events: [...state.events, ev] });
    },

    /** Toggle an account onto/off the control (block) list — emits a `Blocked` event, mines a block. */
    setBlocked(token: Address, account: Address, status: boolean) {
      const block = state.block + 1n;
      const ev: ComplianceEvent = {
        token,
        kind: 'blocked',
        account,
        status,
        blockNumber: block,
        logIndex: state.seq,
      };
      set({ ...state, block, seq: state.seq + 1, events: [...state.events, ev] });
    },

    place(order: Omit<Order, 'id' | 'seq'>) {
      const seq = state.seq;
      const o: Order = { ...order, id: `o${seq}`, seq };
      set({ ...state, seq: seq + 1, orders: [...state.orders, o] });
    },

    cancel(id: string) {
      set({ ...state, orders: state.orders.filter((o) => o.id !== id) });
    },

    /** Atomic DvP. Pre-flight both legs; on any failure NOTHING moves (mirrors the Solidity revert). */
    settle(bidId: string, askId: string): { ok: boolean; receipt?: OnChainSettlement; preflight: Preflight } {
      const bid = state.orders.find((o) => o.id === bidId && o.side === 'bid');
      const ask = state.orders.find((o) => o.id === askId && o.side === 'ask');
      if (!bid || !ask) throw new Error('order not found');

      const pf = preflight(bid, ask);
      if (!pf.ok) {
        const leg = !pf.bond.ok ? 'bond' : 'cash';
        set({
          ...state,
          lastReject: { tradeLabel: `${bid.id}×${ask.id}`, leg, verdict: leg === 'bond' ? pf.bond : pf.cash },
        });
        return { ok: false, preflight: pf };
      }

      // Execute — mine a block, emit the receipt, move balances, consume the filled quantity.
      const block = state.block + 1n;
      const qty = Math.min(bid.quantity, ask.quantity);
      const cash = notional(ask.priceCents, qty);
      const tradeId = tradeIdOf(state.tradeSeq);
      const logIndex = state.seq;

      const receipt: OnChainSettlement = {
        tradeId,
        bondToken: INSTRUMENT.bondToken,
        seller: ask.account,
        buyer: bid.account,
        quantity: BigInt(qty),
        cashToken: INSTRUMENT.cashToken,
        cashAmount: BigInt(cash),
        bondCode: CODE.SUCCESS,
        cashCode: CODE.SUCCESS,
        blockNumber: block,
        txHash: fauxTx(state.tradeSeq * 1000 + logIndex),
        logIndex,
        rail: state.rail,
      };

      // Balances: bond seller→buyer, cash buyer→seller.
      const b = { ...state.balances };
      const move = (a: Address, d: { bond?: number; cash?: number }) => {
        const key = a.toLowerCase();
        const cur = b[key] ?? { bond: 0, cash: 0 };
        b[key] = { bond: cur.bond + (d.bond ?? 0), cash: cur.cash + (d.cash ?? 0) };
      };
      move(ask.account, { bond: -qty, cash: +cash });
      move(bid.account, { bond: +qty, cash: -cash });

      // Consume filled quantity from the book.
      const orders = state.orders
        .map((o) => {
          if (o.id === bid.id || o.id === ask.id) return { ...o, quantity: o.quantity - qty };
          return o;
        })
        .filter((o) => o.quantity > 0);

      set({
        ...state,
        block,
        seq: state.seq + 1,
        tradeSeq: state.tradeSeq + 1,
        settlements: [...state.settlements, receipt],
        balances: b,
        orders,
        lastReject: undefined,
      });

      return { ok: true, receipt, preflight: pf };
    },

    /** The venue's HONEST self-report, derived from what actually settled. */
    honestClaims(): VenueClaim[] {
      return state.settlements.map((s) => ({
        tradeId: s.tradeId,
        bondToken: s.bondToken,
        seller: s.seller,
        buyer: s.buyer,
        quantity: s.quantity.toString(),
        cashToken: s.cashToken,
        cashAmount: s.cashAmount.toString(),
        compliant: true,
      }));
    },

    reset() {
      set(seed());
    },
  };
}

export type VenueStore = ReturnType<typeof createVenueStore>;

// ---------------------------------------------------------------------------
// Seed: verify every desk on both tokens at block 0, then rest a two-sided book.
// bondToken/cashToken/partition and the first trade ids line up with local.json.
// ---------------------------------------------------------------------------
function seed(): VenueState {
  const desks: Address[] = [
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // MERIDIAN
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // ASHFORD
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // KESTREL
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // HALLMARK
    '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // BRANTLEY
  ];

  const events: ComplianceEvent[] = [];
  let logIndex = 0;
  for (const token of [INSTRUMENT.bondToken, INSTRUMENT.cashToken]) {
    for (const account of desks) {
      events.push({ token, kind: 'verified', account, status: true, blockNumber: 0n, logIndex: logIndex++ });
    }
  }

  const balances: Record<string, { bond: number; cash: number }> = {};
  for (const a of desks) balances[a.toLowerCase()] = { bond: 0, cash: 5_000_000 };
  balances[OPERATOR.toLowerCase()] = { bond: 0, cash: 0 };
  // Dealers carry inventory of the bond.
  balances['0x70997970c51812dc3a010c7d01b50e0d17dc79c8'].bond = 1_000_000; // MERIDIAN
  balances['0x90f79bf6eb2c4f870365e785982e1f101e93b906'].bond = 1_000_000; // KESTREL

  const p = INSTRUMENT.partition;
  const mk = (side: Order['side'], account: Address, price: number, quantity: number, seq: number): Order => ({
    id: `s${seq}`,
    side,
    account,
    priceCents: price,
    quantity,
    partition: p,
    seq,
  });

  const orders: Order[] = [
    // Asks — offers to sell the bond, best (lowest) first.
    mk('ask', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 10000, 10, 100), // MERIDIAN 100.00 ×10  ← demo
    mk('ask', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', 10015, 8, 101), //  KESTREL  100.15 ×8
    mk('ask', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 10040, 20, 102), // MERIDIAN 100.40 ×20
    // Bids — offers to buy the bond, best (highest) first.
    mk('bid', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 9990, 10, 103), //  ASHFORD  99.90 ×10  ← demo
    mk('bid', '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', 9980, 12, 104), //  HALLMARK 99.80 ×12
    mk('bid', '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', 9960, 10, 105), //  BRANTLEY 99.60 ×10  ← KYC demo
  ];

  return {
    block: 0n,
    orders,
    settlements: [],
    events,
    balances,
    seq: 200,
    tradeSeq: 1, // first tradeId → 0x…0001, matching local.json
    rail: 'arc',
  };
}
