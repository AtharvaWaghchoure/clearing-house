// Decoders for the on-chain compliance signals, so the UI/CLI can say "0x10 · AddressNotVerified"
// instead of "failed". Values verified against the ATS source (specs/ats-mechanism.md).

import { toFunctionSelector } from 'viem';

export const EIP1066: Record<string, string> = {
  '0x01': 'SUCCESS',
  '0x10': 'DISALLOWED_OR_STOP',
  '0x16': 'REVOKED_OR_BANNED',
  '0x40': 'UNAVAILABLE',
  '0x42': 'PAUSED',
  '0x54': 'INSUFFICIENT_FUNDS',
  '0x56': 'TRANSFER_VOLUME_EXCEEDED',
};

const sel = (sig: string) => toFunctionSelector(sig).toLowerCase();

// The ATS error selectors carried in the `reason` field of canTransferByPartition.
export const REASONS: Record<string, string> = {
  [sel('AddressNotVerified(address)')]: 'AddressNotVerified',
  [sel('AccountIsBlocked(address)')]: 'AccountIsBlocked',
  [sel('InvalidKycStatus(address)')]: 'InvalidKycStatus',
};

export function codeName(code: string): string {
  return EIP1066[code.toLowerCase()] ?? code;
}

/** `reason` is a bytes32 with the 4-byte error selector left-aligned. */
export function reasonName(reason32: string): string {
  const s = reason32.slice(0, 10).toLowerCase();
  if (s === '0x00000000') return '—';
  return REASONS[s] ?? s;
}
