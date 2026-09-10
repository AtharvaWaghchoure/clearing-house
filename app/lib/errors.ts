// Turn viem / wallet / RPC errors into short human sentences for the UI, instead of raw revert blobs.
// API errors (thrown as plain Error from the fetch helpers) are already friendly and pass through.

import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((err) => err instanceof UserRejectedRequestError || (err as { code?: number }).code === 4001)) {
      return 'You rejected the request in your wallet.';
    }

    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const tag = `${revert.data?.errorName ?? ''} ${revert.shortMessage ?? ''}`;
      if (/AddressNotVerified/i.test(tag)) return 'This wallet isn’t verified yet — onboard first.';
      if (/insufficient-available|InvalidHoldAmount/i.test(tag)) return 'Not enough free balance to place that hold.';
      if (/WrongHoldId/i.test(tag)) return 'That hold no longer exists — it was already settled or cancelled.';
      if (/NotOperator/i.test(tag)) return 'Only the venue operator can settle a trade.';
      return revert.data?.errorName ? `Transaction reverted: ${revert.data.errorName}.` : 'The transaction reverted.';
    }

    if (/insufficient funds/i.test(e.message)) {
      return 'Not enough HBAR for gas — top up from the Hedera portal faucet.';
    }
    return e.shortMessage || e.message;
  }

  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
