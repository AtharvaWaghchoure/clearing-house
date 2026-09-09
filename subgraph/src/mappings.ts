import { BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';
import { SettlementReceipt } from '../generated/MatchingEngine/MatchingEngine';
import { Blocked, Verified } from '../generated/BondToken/ATSToken';
import { ComplianceEvent, Settlement, Token, TokenAccount, VenueStat } from '../generated/schema';

function taId(token: Bytes, account: Bytes): Bytes {
  return token.concat(account);
}

function touchToken(token: Bytes, block: BigInt): void {
  let t = Token.load(token);
  if (t == null) {
    t = new Token(token);
    t.firstSeenBlock = block;
    t.save();
  }
}

function loadOrInit(token: Bytes, account: Bytes): TokenAccount {
  const id = taId(token, account);
  let ta = TokenAccount.load(id);
  if (ta == null) {
    ta = new TokenAccount(id);
    ta.token = token;
    ta.account = account;
    ta.verified = false;
    ta.blocked = false;
    ta.lastUpdatedBlock = BigInt.zero();
  }
  return ta;
}

function logCompliance(token: Bytes, account: Bytes, kind: string, status: boolean, event: ethereum.Event): void {
  const ce = new ComplianceEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));
  ce.token = token;
  ce.account = account;
  ce.kind = kind;
  ce.status = status;
  ce.blockNumber = event.block.number;
  ce.timestamp = event.block.timestamp;
  ce.txHash = event.transaction.hash;
  ce.save();
}

// identity / control-list stream, from both token data sources

export function handleVerified(event: Verified): void {
  touchToken(event.address, event.block.number);
  const ta = loadOrInit(event.address, event.params.account);
  ta.verified = event.params.status;
  ta.lastUpdatedBlock = event.block.number;
  ta.save();
  logCompliance(event.address, event.params.account, 'verified', event.params.status, event);
}

export function handleBlocked(event: Blocked): void {
  touchToken(event.address, event.block.number);
  const ta = loadOrInit(event.address, event.params.account);
  ta.blocked = event.params.status;
  ta.lastUpdatedBlock = event.block.number;
  ta.save();
  logCompliance(event.address, event.params.account, 'blocked', event.params.status, event);
}

// settlement stream, with in-mapping compliance reconstruction

function eligible(token: Bytes, account: Bytes): boolean {
  const ta = TokenAccount.load(taId(token, account));
  if (ta == null) return false;
  return ta.verified && !ta.blocked;
}

export function handleSettlementReceipt(event: SettlementReceipt): void {
  const p = event.params;
  const s = new Settlement(p.tradeId);
  s.tradeId = p.tradeId;
  s.bondToken = p.bondToken;
  s.cashToken = p.cashToken;
  s.seller = p.seller;
  s.buyer = p.buyer;
  s.quantity = p.quantity;
  s.cashAmount = p.cashAmount;
  s.bondCode = p.bondCode;
  s.cashCode = p.cashCode;

  // Reconstruct compliance from the composed identity state AT THIS BLOCK (handlers run in order,
  // so the TokenAccount entities already reflect every earlier Verified/Blocked event).
  const reasons: string[] = [];
  if (!eligible(p.bondToken, p.buyer)) reasons.push('buyer not verified on bond');
  if (!eligible(p.bondToken, p.seller)) reasons.push('seller not verified on bond');
  if (!eligible(p.cashToken, p.seller)) reasons.push('seller not verified on cash');
  if (!eligible(p.cashToken, p.buyer)) reasons.push('buyer not verified on cash');

  s.reconstructedCompliant = reasons.length == 0;
  s.reason = reasons.join('; ');
  s.blockNumber = event.block.number;
  s.timestamp = event.block.timestamp;
  s.txHash = event.transaction.hash;
  s.save();

  let stat = VenueStat.load(event.address);
  if (stat == null) {
    stat = new VenueStat(event.address);
    stat.settledCount = BigInt.zero();
    stat.compliantCount = BigInt.zero();
    stat.nonCompliantCount = BigInt.zero();
  }
  stat.settledCount = stat.settledCount.plus(BigInt.fromI32(1));
  if (s.reconstructedCompliant) {
    stat.compliantCount = stat.compliantCount.plus(BigInt.fromI32(1));
  } else {
    stat.nonCompliantCount = stat.nonCompliantCount.plus(BigInt.fromI32(1));
  }
  stat.save();
}
