// Named participants, bound to the deterministic anvil accounts so the terminal lines up 1:1 with
// verifier/.local/local.json when run in live mode. The desk names are cosmetic; the addresses are
// the real anvil keypairs the local demo settles between.

import type { Address, Hex } from './types';

export interface Desk {
  address: Address;
  name: string;
  role: 'operator' | 'dealer' | 'buyside';
}

// anvil default mnemonic — account order is stable across machines.
export const OPERATOR: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // acct 0 — the venue

export const DESKS: Desk[] = [
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', name: 'MERIDIAN CAPITAL', role: 'dealer' }, // 1
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', name: 'ASHFORD PENSION', role: 'buyside' }, // 2
  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', name: 'KESTREL SECURITIES', role: 'dealer' }, // 3
  { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', name: 'HALLMARK TRUST', role: 'buyside' }, // 4
  { address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', name: 'BRANTLEY & CO', role: 'buyside' }, // 5 — KYC demo
];

const BY_ADDR: Record<string, Desk> = Object.fromEntries(
  DESKS.map((d) => [d.address.toLowerCase(), d]),
);
BY_ADDR[OPERATOR.toLowerCase()] = { address: OPERATOR, name: 'CLEARING DESK', role: 'operator' };

export function deskFor(address: Address): Desk {
  return (
    BY_ADDR[address.toLowerCase()] ?? { address, name: 'UNKNOWN', role: 'dealer' }
  );
}

export function deskName(address: Address): string {
  return deskFor(address).name;
}

// The instrument on the book — a tokenised senior bond issued via ATS. bondToken/cashToken match the
// first two deterministic anvil deploys (see verifier/.local/local.json) so live mode aligns.
export const INSTRUMENT = {
  isin: 'XS2731045892',
  name: 'HELVETIA 4.25% 15FEB2031',
  ticker: 'HELV·31',
  coupon: '4.250%',
  maturity: '15 Feb 2031',
  face: 100, // cash units per bond unit at par
  bondToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address,
  cashToken: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
  partition: ('0x0000000000000000000000000000000000000000000000000000000000000001' as Hex),
  partitionName: 'SENIOR',
  bondSymbol: 'HELV31',
  cashSymbol: 'USDC',
} as const;
