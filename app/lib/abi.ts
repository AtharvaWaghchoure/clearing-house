// The exact slice of the on-chain surface the terminal calls, as viem human-readable ABIs. Structs
// mirror contracts/src/interfaces (ISettlementLeg.LegInstruction, IATSSecurity.Hold/HoldIdentifier)
// verbatim, so encoding matches the deployed bytecode.

import { parseAbi } from 'viem';

/** ATS security diamond (bond + cash). MockATS adds `mint`/`setVerified` for open onboarding. */
export const atsAbi = parseAbi([
  'struct Hold { uint256 amount; uint256 expirationTimestamp; address escrow; address to; bytes data; }',
  'struct HoldIdentifier { bytes32 partition; address tokenHolder; uint256 holdId; }',
  // holder places a hold over its own balance; returns the assigned hold id
  'function createHoldByPartition(bytes32 partition, Hold hold) returns (bool success, uint256 holdId)',
  // escrow moves the held tokens (called by the leg inside settle; here for completeness)
  'function executeHoldByPartition(HoldIdentifier holdIdentifier, address to, uint256 amount) returns (bool success, bytes32 partition)',
  // read-only eligibility: EIP-1066 code + ATS reason selector
  'function canTransferByPartition(address from, address to, bytes32 partition, uint256 value, bytes data, bytes operatorData) view returns (bool status, bytes1 code, bytes32 reason)',
  'function balanceOfByPartition(bytes32 partition, address tokenHolder) view returns (uint256)',
  // MockATS operator/issuer controls — how the venue onboards any address on testnet
  'function mint(bytes32 partition, address to, uint256 amount)',
  'function setVerified(address account, bool status)',
  'function isVerified(address account) view returns (bool)',
  'event Verified(address indexed account, bool status)',
  'event Blocked(address indexed account, bool status)',
]);

/** The venue core. `settle` is operator-only; `preflight` is the never-reverting pre-check. */
export const engineAbi = parseAbi([
  'struct LegInstruction { address token; address from; address to; uint256 amount; bytes32 partition; uint256 holdId; bytes32 tradeId; bytes extra; }',
  'struct Trade { LegInstruction bond; LegInstruction cash; }',
  'function settle(Trade t) returns (bytes32 tradeId)',
  'function preflight(Trade t) view returns (bool ok, bytes1 bondCode, bytes32 bondReason, bytes1 cashCode, bytes32 cashReason)',
  'function operator() view returns (address)',
  'function settledCount() view returns (uint256)',
  'event SettlementReceipt(bytes32 indexed tradeId, address indexed bondToken, address indexed seller, address buyer, uint256 quantity, address cashToken, uint256 cashAmount, bytes1 bondCode, bytes1 cashCode)',
]);
