// Decoders for the on-chain compliance signals, so the terminal can say
// "0x10 · DISALLOWED_OR_STOP · AddressNotVerified" instead of just "failed".
// Values verified against the ATS source (specs/ats-mechanism.md); this is a
// faithful port of verifier/src/codes.ts so the UI and CLI agree byte-for-byte.

import type { Hex } from './types';

export const EIP1066: Record<string, string> = {
  '0x01': 'SUCCESS',
  '0x10': 'DISALLOWED_OR_STOP',
  '0x16': 'REVOKED_OR_BANNED',
  '0x40': 'UNAVAILABLE',
  '0x42': 'PAUSED',
  '0x54': 'INSUFFICIENT_FUNDS',
  '0x56': 'TRANSFER_VOLUME_EXCEEDED',
};

export function codeName(code: string): string {
  return EIP1066[code.toLowerCase()] ?? code;
}

// The ATS error selectors carried in the `reason` field of canTransferByPartition.
// Precomputed keccak-256 4-byte selectors (matches viem's toFunctionSelector on the
// same signatures used in verifier/src/codes.ts) so we need no crypto dep in the browser.
export const REASONS: Record<string, string> = {
  '0xac12c8b3': 'AddressNotVerified', // AddressNotVerified(address)
  '0x796c1f0d': 'AccountIsBlocked', //   AccountIsBlocked(address)
  '0x155a732e': 'InvalidKycStatus', //   InvalidKycStatus(address)
};

/** `reason` is a bytes32 with the 4-byte error selector left-aligned. */
export function reasonName(reason32: string): string {
  const s = reason32.slice(0, 10).toLowerCase();
  if (s === '0x00000000') return '—';
  return REASONS[s] ?? s;
}

/** Build a left-aligned bytes32 reason from a known selector name (venue → chain direction). */
export function reasonWord(name: keyof typeof reasonsBySelector | string): Hex {
  const entry = Object.entries(REASONS).find(([, n]) => n === name);
  const sel = entry ? entry[0] : '0x00000000';
  return (sel + '0'.repeat(64 - (sel.length - 2))) as Hex;
}

const reasonsBySelector = REASONS;

export const CODE = {
  SUCCESS: '0x01' as Hex,
  DISALLOWED: '0x10' as Hex,
  INSUFFICIENT_FUNDS: '0x54' as Hex,
} as const;
